// src/controllers/mood.controller.js
const { ddbDocClient } = require("../lib/dynamoClient");
const { PutCommand, QueryCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");

const MOODS_TABLE = process.env.MOODS_TABLE || "Moods";
const USERS_TABLE = process.env.USERS_TABLE || "Users";

/* Helpers */
function normalizeUsernameCandidate(name) {
  if (!name) return null;
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function fmtISODateFromInput(dateInput) {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function formatMoodItem(it) {
  return {
    id: it.id || `${it.userId}-${it.timestamp}`,
    date:
      it.date ||
      it.dateISO ||
      (it.timestamp ? new Date(Number(it.timestamp)).toISOString().slice(0, 10) : null),
    mood: it.mood,
    note: it.note || "",
    createdAt: it.createdAt || (it.timestamp ? new Date(Number(it.timestamp)).toISOString() : null),
  };
}

/**
 * resolveUserIdFromReq (simplified)
 * - Prefer req.user.id (auth)
 * - Then x-user-id header (fast)
 * - Then x-username / body.username -> try username_normalized-index then email-index
 * - Fallback: safe Scan (DEV only)
 *
 * IMPORTANT: this function DOES NOT create users
 */
async function resolveUserIdFromReq(req) {
  // 0. Authenticated user id from middleware
  if (req.user && req.user.id) {
    console.debug("resolveUserId: using req.user.id", req.user.id);
    return String(req.user.id);
  }

  // 0.5 Direct header override - fastest and avoids indexes
  const headerUserId = (req.headers && (req.headers["x-user-id"] || req.headers["x-user-id".toLowerCase()])) || null;
  if (headerUserId) {
    console.debug("resolveUserId: using x-user-id header", headerUserId);
    return String(headerUserId);
  }

  // 1. Get username from header or body
  const usernameRaw = (
    req.headers["x-username"] ||
    (req.body && req.body.username) ||
    ""
  ).trim();
  if (!usernameRaw) return null;

  const usernameNormalized = normalizeUsernameCandidate(usernameRaw);

  // 2. Try username_normalized-index (GSI) — you have this index
  if (usernameNormalized) {
    try {
      const out = await ddbDocClient.send(new QueryCommand({
        TableName: USERS_TABLE,
        IndexName: "username_normalized-index",
        KeyConditionExpression: "username_normalized = :v",
        ExpressionAttributeValues: { ":v": usernameNormalized },
        Limit: 1
      }));
      if (out && out.Items && out.Items.length) {
        console.debug("resolveUserId: found by username_normalized-index", out.Items[0].id);
        return out.Items[0].id;
      }
      console.debug("resolveUserId: username_normalized-index returned no items for", usernameNormalized);
    } catch (err) {
      console.debug("resolveUserId: username_normalized-index query failed:", err && err.message);
    }
  }

  // 3. Try email-index (GSI) — you have this index (allow email-as-username)
  try {
    const out = await ddbDocClient.send(new QueryCommand({
      TableName: USERS_TABLE,
      IndexName: "email-index",
      KeyConditionExpression: "email = :v",
      ExpressionAttributeValues: { ":v": usernameRaw },
      Limit: 1
    }));
    if (out && out.Items && out.Items.length) {
      console.debug("resolveUserId: found by email-index", out.Items[0].id);
      return out.Items[0].id;
    }
    console.debug("resolveUserId: email-index returned no items for", usernameRaw);
  } catch (err) {
    console.debug("resolveUserId: email-index query failed:", err && err.message);
  }

  // 4. Final fallback: safe Scan (DEV only)
  try {
    const scanOut = await ddbDocClient.send(new ScanCommand({
      TableName: USERS_TABLE,
      FilterExpression: "#un = :nn OR email = :n",
      ExpressionAttributeNames: { "#un": "username_normalized" },
      ExpressionAttributeValues: { ":nn": usernameNormalized, ":n": usernameRaw },
      Limit: 1
    }));
    if (scanOut && scanOut.Items && scanOut.Items.length && scanOut.Items[0].id) {
      console.debug("resolveUserId: found by fallback scan", scanOut.Items[0].id);
      return scanOut.Items[0].id;
    }
    console.debug("resolveUserId: fallback scan returned no items for", usernameRaw);
  } catch (err) {
    console.debug("resolveUserId: fallback scan failed:", err && err.message);
  }

  // Not found
  return null;
}

/* getMoods */
async function getMoods(req, res) {
  try {
    const year = req.query.year ? parseInt(req.query.year, 10) : null;
    const month = req.query.month ? parseInt(req.query.month, 10) : null;

    const userId = await resolveUserIdFromReq(req);
    if (!userId) {
      return res.status(400).json({ message: "user required" });
    }

    // Preferred: Query on userId-index
    try {
      const qParams = {
        TableName: MOODS_TABLE,
        IndexName: "userId-index",
        KeyConditionExpression: "userId = :u",
        ExpressionAttributeValues: { ":u": String(userId) },
        ScanIndexForward: false
      };

      if (year && month) {
        const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

        qParams.FilterExpression = "#d BETWEEN :start AND :end";
        qParams.ExpressionAttributeNames = { "#d": "date" };
        qParams.ExpressionAttributeValues[":start"] = startDate;
        qParams.ExpressionAttributeValues[":end"] = endDate;
      }

      const out = await ddbDocClient.send(new QueryCommand(qParams));
      const list = (out.Items || []).map(formatMoodItem);
      return res.json(list);
    } catch (err) {
      console.debug("getMoods: userId-index query failed, will fallback to scan:", err && err.message);
    }

    // Fallback: Scan the Moods table (dev only)
    const scanParams = {
      TableName: MOODS_TABLE,
      FilterExpression: "userId = :u",
      ExpressionAttributeValues: { ":u": String(userId) }
    };

    if (year && month) {
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

      scanParams.FilterExpression = "userId = :u AND #d BETWEEN :start AND :end";
      scanParams.ExpressionAttributeNames = { "#d": "date" };
      scanParams.ExpressionAttributeValues = {
        ":u": String(userId),
        ":start": startDate,
        ":end": endDate
      };
    }

    const outScan = await ddbDocClient.send(new ScanCommand(scanParams));
    const list = (outScan.Items || []).map(formatMoodItem);
    return res.json(list);
  } catch (err) {
    console.error("getMoods (dynamo) error", err && (err.stack || err.message || err));
    return res.status(500).json({ message: "Server error fetching moods" });
  }
}

/* upsertMood */
async function upsertMood(req, res) {
  try {
    const userId = await resolveUserIdFromReq(req);
    if (!userId) return res.status(400).json({ message: "user required" });

    const { date, mood, note } = req.body || {};
    if (!date || !mood) {
      return res.status(400).json({ message: "date and mood required" });
    }

    const dateISO = fmtISODateFromInput(date);
    if (!dateISO) return res.status(400).json({ message: "invalid date" });

    const ts = new Date(dateISO).getTime();
    const id = `m-${String(userId)}-${dateISO}`;

    const item = {
      id,
      userId: String(userId),
      timestamp: ts,
      date: dateISO,
      mood,
      note: note || "",
      createdAt: new Date().toISOString()
    };

    await ddbDocClient.send(new PutCommand({
      TableName: MOODS_TABLE,
      Item: item
    }));

    return res.status(201).json({ ok: true, id, record: item });
  } catch (err) {
    console.error("upsertMood (dynamo) error", err && (err.stack || err.message || err));
    return res.status(500).json({ message: "Server error saving mood" });
  }
}

module.exports = { getMoods, upsertMood };
