// // src/controllers/mood.controller.js
// const { Op } = require('sequelize');
// const db = require('../models');
// const Mood = db.Mood;
// const User = db.User;
// const sequelize = db.sequelize;

// // in src/controllers/mood.controller.js
// async function resolveUserIdFromReq(req) {
//   if (req.user && req.user.id) return req.user.id;

//   const usernameHeader = (req.headers['x-username'] || (req.body && req.body.username) || '').trim();
//   if (!usernameHeader) return null;

//   if (!User) {
//     console.warn('resolveUserIdFromReq: User model not found in models export. Skipping lookup.');
//     return null;
//   }

//   try {
//     const usernameNormalized = usernameHeader.toLowerCase();

//     // Only query columns that exist in your users table.
//     const candidateCols = [
//       { username_normalized: usernameNormalized },
//       { email: usernameHeader },
//       { name: usernameHeader }
//     ];

//     const user = await User.findOne({
//       where: {
//         [Op.or]: candidateCols
//       }
//     });
//     return user ? user.id : null;
//   } catch (err) {
//     console.error('resolveUserIdFromReq error:', err);
//     return null;
//   }
// }

// async function getMoods(req, res) {
//   try {
//     const year = parseInt(req.query.year, 10);
//     const month = parseInt(req.query.month, 10);
//     if (!year || !month || month < 1 || month > 12) {
//       return res.status(400).json({ success: false, message: "Provide valid year and month query params" });
//     }

//     const start = `${year}-${String(month).padStart(2,'0')}-01`;
//     const lastDay = new Date(year, month, 0).getDate();
//     const end = `${year}-${String(month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;

//     const userId = await resolveUserIdFromReq(req);

//     const where = { date: { [Op.between]: [start, end] } };
//     if (userId) where.userId = userId;
//     else where.userId = null; // change if you want shared/anonymous listing

//     const rows = await Mood.findAll({
//       where,
//       order: [['date','ASC']],
//       attributes: ['id','userId','date','mood','note','createdAt','updatedAt']
//     });

//     return res.json(rows);
//   } catch (err) {
//     console.error('mood.getMoods error', err);
//     return res.status(500).json({ success: false, message: 'Server error' });
//   }
// }

// async function upsertMood(req, res) {
//   const t = await sequelize.transaction();
//   try {
//     const { date, mood, note } = req.body;
//     if (!date || !mood) {
//       await t.rollback();
//       return res.status(400).json({ success: false, message: 'date and mood required' });
//     }

//     const userId = await resolveUserIdFromReq(req);

//     const existing = await Mood.findOne({ where: { userId: userId || null, date }, transaction: t });

//     let saved;
//     if (existing) {
//       existing.mood = mood;
//       existing.note = note || null;
//       await existing.save({ transaction: t });
//       saved = existing;
//     } else {
//       saved = await Mood.create({
//         userId: userId || null,
//         date,
//         mood,
//         note: note || null,
//       }, { transaction: t });
//     }

//     await t.commit();
//     const returnRow = await Mood.findOne({ where: { id: saved.id } });
//     return res.json({ success: true, record: returnRow });
//   } catch (err) {
//     await t.rollback();
//     console.error('mood.upsert error', err);
//     if (err && err.name === 'SequelizeUniqueConstraintError') {
//       return res.status(409).json({ success: false, message: 'Duplicate entry' });
//     }
//     return res.status(500).json({ success: false, message: 'Server error' });
//   }
// }
// src/controllers/mood.controller.js
const { ddbDocClient } = require("../lib/dynamoClient");
const {
  PutCommand,
  QueryCommand,
  ScanCommand,
} = require("@aws-sdk/lib-dynamodb");

const MOODS_TABLE = process.env.MOODS_TABLE || "Moods";
const USERS_TABLE = process.env.USERS_TABLE || "Users";

// helper: normalize username to the form stored in username_normalized
function normalizeUsernameCandidate(name) {
  if (!name) return null;
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// helper: try to find a user by various means; returns userId string or null
async function resolveUserIdFromReq(req) {
  // 1) If auth middleware provided user id, use it
  if (req.user && req.user.id) {
    console.debug("resolveUserId: using req.user.id", req.user.id);
    return String(req.user.id);
  }

  // username from header or body
  const usernameRaw = (
    req.headers["x-username"] ||
    (req.body && req.body.username) ||
    ""
  ).trim();
  if (!usernameRaw) return null;

  const usernameNormalized = normalizeUsernameCandidate(usernameRaw);

  // Try these lookup attempts in order:
  // 1) Query username_normalized-index with normalized value
  // 2) Query a name-based index (if exists) with raw value
  // 3) Query email index with raw value
  // 4) Scan fallback matching name or email (case-sensitive)
  // 5) If still not found, create a new unregistered user with username_normalized set

  // 1) username_normalized-index
  if (usernameNormalized) {
    try {
      const out = await ddbDocClient.send(
        new QueryCommand({
          TableName: USERS_TABLE,
          IndexName: "username_normalized-index",
          KeyConditionExpression: "username_normalized = :v",
          ExpressionAttributeValues: { ":v": usernameNormalized },
          Limit: 1,
        })
      );
      if (out && out.Items && out.Items.length) {
        console.debug(
          "resolveUserId: found by username_normalized-index",
          out.Items[0].id
        );
        return out.Items[0].id;
      }
    } catch (err) {
      console.debug(
        "resolveUserId: username_normalized-index query failed (index may be missing)",
        err.message
      );
    }
  }

  // 2) UsersByName index (name)
  try {
    const out = await ddbDocClient.send(
      new QueryCommand({
        TableName: USERS_TABLE,
        IndexName: "UsersByName",
        KeyConditionExpression: "#n = :v",
        ExpressionAttributeNames: { "#n": "name" },
        ExpressionAttributeValues: { ":v": usernameRaw },
        Limit: 1,
      })
    );
    if (out && out.Items && out.Items.length) {
      console.debug(
        "resolveUserId: found by UsersByName index",
        out.Items[0].id
      );
      return out.Items[0].id;
    }
  } catch (err) {
    console.debug(
      "resolveUserId: UsersByName query failed (index may be missing)",
      err.message
    );
  }

  // 3) email-index
  try {
    const out = await ddbDocClient.send(
      new QueryCommand({
        TableName: USERS_TABLE,
        IndexName: "email-index",
        KeyConditionExpression: "email = :v",
        ExpressionAttributeValues: { ":v": usernameRaw },
        Limit: 1,
      })
    );
    if (out && out.Items && out.Items.length) {
      console.debug("resolveUserId: found by email-index", out.Items[0].id);
      return out.Items[0].id;
    }
  } catch (err) {
    console.debug(
      "resolveUserId: email-index query failed (index may be missing)",
      err.message
    );
  }

  // 4) fallback: scan by name or email (dev only — expensive)
  try {
    const scanOut = await ddbDocClient.send(
      new ScanCommand({
        TableName: USERS_TABLE,
        FilterExpression:
          "name = :n OR email = :n OR username_normalized = :nn",
        ExpressionAttributeValues: {
          ":n": usernameRaw,
          ":nn": usernameNormalized,
        },
        Limit: 1,
      })
    );
    if (scanOut && scanOut.Items && scanOut.Items.length) {
      console.debug(
        "resolveUserId: found by fallback scan",
        scanOut.Items[0].id
      );
      return scanOut.Items[0].id;
    }
  } catch (err) {
    console.debug("resolveUserId: fallback scan failed", err.message);
  }

  // 5) not found -> create an unregistered user record (include username_normalized)
  const uid = `u-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`;
  try {
    const item = {
      id: uid,
      name: usernameRaw,
      email: null,
      is_registered: false,
      username_normalized: usernameNormalized || null,
      created_at: new Date().toISOString(),
    };
    await ddbDocClient.send(
      new PutCommand({
        TableName: USERS_TABLE,
        Item: item,
      })
    );
    console.debug(
      "resolveUserId: created fallback user",
      uid,
      "username_normalized=",
      item.username_normalized
    );
    return uid;
  } catch (err) {
    console.error("resolveUserId: failed to create user", err);
    return null;
  }
}

async function getMoods(req, res) {
  try {
    // Accept optional year/month filters (if provided by client)
    const year = req.query.year ? parseInt(req.query.year, 10) : null;
    const month = req.query.month ? parseInt(req.query.month, 10) : null;

    const userId = await resolveUserIdFromReq(req);
    if (!userId) {
      return res.status(400).json({ message: "user required" });
    }
    console.debug(
      "getMoods: resolving moods for userId=",
      userId,
      "year=",
      year,
      "month=",
      month
    );

    // Prefer a Query on a GSI that has partition key userId (e.g. 'userId-index')
    try {
      const qParams = {
        TableName: MOODS_TABLE,
        IndexName: "userId-index", // create this GSI for production
        KeyConditionExpression: "userId = :u",
        ExpressionAttributeValues: { ":u": String(userId) },
        ScanIndexForward: false,
      };

      // if year & month specified, we can also filter by date or timestamp range client-side
      if (year && month) {
        // compute inclusive start/end ISO date strings
        const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, "0")}-${String(
          lastDay
        ).padStart(2, "0")}`;
        // QueryCommand cannot filter on non-key attributes in KeyConditionExpression; use FilterExpression
        qParams.FilterExpression = "date BETWEEN :start AND :end";
        qParams.ExpressionAttributeValues[":start"] = startDate;
        qParams.ExpressionAttributeValues[":end"] = endDate;
      }

      const out = await ddbDocClient.send(new QueryCommand(qParams));
      const list = (out.Items || []).map((it) => ({
        id: it.id || `${it.userId}-${it.timestamp}`,
        date:
          it.date ||
          it.dateISO ||
          (it.timestamp
            ? new Date(Number(it.timestamp)).toISOString().slice(0, 10)
            : null),
        mood: it.mood,
        note: it.note || "",
        createdAt:
          it.createdAt ||
          (it.timestamp ? new Date(Number(it.timestamp)).toISOString() : null),
      }));
      return res.json(list);
    } catch (err) {
      console.debug(
        "getMoods: userId-index query failed, will fallback to scan",
        err.message
      );
    }

    // fallback: full table scan (dev only)
    const scanParams = {
      TableName: MOODS_TABLE,
      FilterExpression: "userId = :u",
      ExpressionAttributeValues: { ":u": String(userId) },
    };

    if (year && month) {
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, "0")}-${String(
        lastDay
      ).padStart(2, "0")}`;
      scanParams.FilterExpression =
        "userId = :u AND #d BETWEEN :start AND :end";
      scanParams.ExpressionAttributeNames = { "#d": "date" };
      scanParams.ExpressionAttributeValues = {
        ":u": String(userId),
        ":start": startDate,
        ":end": endDate,
      };
    }

    const outScan = await ddbDocClient.send(new ScanCommand(scanParams));
    const list = (outScan.Items || []).map((it) => ({
      id: it.id || `${it.userId}-${it.timestamp}`,
      date:
        it.date ||
        it.dateISO ||
        (it.timestamp
          ? new Date(Number(it.timestamp)).toISOString().slice(0, 10)
          : null),
      mood: it.mood,
      note: it.note || "",
      createdAt:
        it.createdAt ||
        (it.timestamp ? new Date(Number(it.timestamp)).toISOString() : null),
    }));
    return res.json(list);
  } catch (err) {
    console.error("getMoods (dynamo) error", err);
    return res.status(500).json({ message: "Server error fetching moods" });
  }
}

// upsertMood remains same but ensure it returns record (you already updated this)
async function upsertMood(req, res) {
  try {
    const userId = await resolveUserIdFromReq(req);
    if (!userId) return res.status(400).json({ message: "user required" });

    const { date, mood, note } = req.body || {};
    const ts = date ? new Date(date).getTime() : Date.now();
    const id = `m-${userId}-${ts}`;

    const item = {
      id,
      userId: String(userId),
      timestamp: ts,
      date: date || new Date(ts).toISOString().slice(0, 10),
      mood,
      note: note || "",
      createdAt: new Date(ts).toISOString(),
    };

    await ddbDocClient.send(
      new PutCommand({
        TableName: MOODS_TABLE,
        Item: item,
      })
    );

    return res.status(201).json({ ok: true, id, record: item });
  } catch (err) {
    console.error("upsertMood (dynamo) error", err);
    return res.status(500).json({ message: "Server error saving mood" });
  }
}

module.exports = { getMoods, upsertMood };
