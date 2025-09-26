// // src/controllers/auth.controller.js
// const jwt = require('jsonwebtoken');
// const { User, sequelize } = require('../config/db'); // ensure db exports sequelize & User
// const { UniqueConstraintError } = require('sequelize');

// const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
// const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '7d';
// const MAX_USERNAME_ATTEMPTS = 6;

// function signToken(user) {
//   return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
// }

// function normalizeEmail(email) {
//   if (!email) return null;
//   return String(email).trim().toLowerCase();
// }

// /**
//  * Normalize a display name into username_normalized form:
//  * - trim
//  * - lowercase
//  * - replace non-alphanumeric with underscore
//  * - collapse multiple underscores
//  * - trim leading/trailing underscores
//  * - truncate to 100 chars (DB column length)
//  */
// function normalizeName(name) {
//   if (!name) return null;
//   return String(name)
//     .trim()
//     .toLowerCase()
//     .replace(/[^a-z0-9]+/g, '_')
//     .replace(/^_+|_+$/g, '')
//     .replace(/_+/g, '_')
//     .slice(0, 100);
// }

// function isValidEmail(email) {
//   if (!email) return false;
//   const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//   return re.test(email);
// }

// /**
//  * Try to produce a unique username_normalized candidate.
//  * Strategy:
//  *  - base from provided name (normalized)
//  *  - fallback to email local-part if name absent
//  *  - on collisions, append _<random4> or _<id-like> and retry up to MAX_USERNAME_ATTEMPTS
//  */
// async function reserveUniqueUsername(baseCandidate) {
//   if (!baseCandidate) baseCandidate = `user${Date.now().toString().slice(-6)}`;

//   let candidate = baseCandidate;
//   for (let attempt = 0; attempt < MAX_USERNAME_ATTEMPTS; attempt++) {
//     // check if candidate exists
//     // using count is fine here; we still handle race with UniqueConstraintError on create
//     const found = await User.count({ where: { username_normalized: candidate } });
//     if (!found) return candidate;

//     // generate new candidate: base + '_' + 4-digit random
//     const suffix = Math.floor(Math.random() * 9000) + 1000;
//     candidate = `${baseCandidate}_${suffix}`;
//   }
//   // fallback to time-based unique
//   return `${baseCandidate}_${Date.now().toString().slice(-5)}`;
// }

// /**
//  * REGISTER
//  * - validate inputs
//  * - attempt to create or update existing by email
//  * - ensure username_normalized is created and unique (retry on UniqueConstraintError)
//  */
// async function register(req, res) {
//   const t = await sequelize.transaction();
//   try {
//     const { name: rawName, email: rawEmail } = req.body || {};
//     const nameRaw = rawName ? String(rawName).trim() : '';
//     const email = normalizeEmail(rawEmail);

//     if (!nameRaw || !email) {
//       await t.rollback();
//       return res.status(400).json({ message: 'Name and email required' });
//     }
//     if (!isValidEmail(email)) {
//       await t.rollback();
//       return res.status(400).json({ message: 'Invalid email format' });
//     }

//     // Check if user exists by email
//     let user = await User.findOne({
//       where: { email },
//       transaction: t,
//       lock: t.LOCK.UPDATE
//     });

//     // Prepare username_normalized base
//     const baseFromName = normalizeName(nameRaw);
//     const emailLocal = email.split('@')[0];
//     const baseCandidate = baseFromName && baseFromName.length ? baseFromName : normalizeName(emailLocal) || `user${Date.now().toString().slice(-6)}`;

//     if (user) {
//       // update existing user - ensure they have a username_normalized
//       user.name = nameRaw;
//       user.is_registered = true;
//       user.last_login_at = new Date();

//       // if username_normalized absent — create one deterministically (with reservation)
//       if (!user.username_normalized) {
//         const reserved = await reserveUniqueUsername(baseCandidate);
//         user.username_normalized = reserved;
//       }

//       await user.save({ transaction: t });
//       await t.commit();

//       const token = signToken(user);
//       return res.status(200).json({
//         token,
//         user: { id: user.id, name: user.name, email: user.email, is_registered: user.is_registered }
//       });
//     }

//     // Create new user - attempt to reserve unique username and create
//     let created = null;
//     let attempts = 0;
//     let lastErr = null;

//     // Try a few times to create with different username candidates if needed
//     while (attempts < MAX_USERNAME_ATTEMPTS) {
//       attempts += 1;
//       const candidate = attempts === 1 ? baseCandidate : await reserveUniqueUsername(baseCandidate);

//       try {
//         created = await User.create({
//           name: nameRaw,
//           email,
//           is_registered: true,
//           last_login_at: new Date(),
//           username_normalized: candidate
//         }, { transaction: t });

//         // success
//         await t.commit();
//         const token = signToken(created);
//         return res.status(201).json({
//           token,
//           user: { id: created.id, name: created.name, email: created.email, is_registered: created.is_registered }
//         });
//       } catch (err) {
//         lastErr = err;
//         // if unique constraint on username_normalized or email - retry (username collision) or fail (email)
//         if (err instanceof UniqueConstraintError) {
//           // if email conflict, bail out
//           const fields = err?.fields || {};
//           if (fields.email) {
//             await t.rollback();
//             return res.status(409).json({ message: 'Email already in use' });
//           }
//           // otherwise assume username collision and retry loop with a new candidate
//           // continue to next attempt
//         } else {
//           // unknown error -> propagate
//           await t.rollback();
//           console.error('REGISTER ERROR (unknown):', err);
//           const body = { message: 'Server error during register' };
//           if (process.env.NODE_ENV !== 'production') body.error = err.message || String(err);
//           return res.status(500).json(body);
//         }
//       }
//     }

//     // If we exit loop without return, we failed to create a unique username
//     console.error('REGISTER: failed to create unique username after attempts', lastErr);
//     await t.rollback();
//     return res.status(409).json({ message: 'Username or email already in use' });
//   } catch (err) {
//     await t.rollback();
//     console.error('REGISTER ERROR:', err);
//     if (err instanceof UniqueConstraintError) {
//       return res.status(409).json({ message: 'Username or email already in use' });
//     }
//     const body = { message: 'Server error during register' };
//     if (process.env.NODE_ENV !== 'production') body.error = err.message || String(err);
//     return res.status(500).json(body);
//   }
// }

// /**
//  * LOGIN
//  * - Accepts { email } or { name } (normalized name)
//  * - If login by name:
//  *    - Normalize name and find all users with that username_normalized
//  *    - If 0 -> 404
//  *    - If >1 -> 409 (ambiguous)
//  *    - If 1 -> success
//  * - If login by email: find by email
//  */
// async function login(req, res) {
//   try {
//     const { email: rawEmail, name: rawName } = req.body || {};
//     const email = normalizeEmail(rawEmail);
//     const nameRaw = rawName ? String(rawName).trim() : null;

//     if (!email && !nameRaw) return res.status(400).json({ message: 'Email or name required' });

//     let user = null;

//     if (nameRaw) {
//       const normalized = normalizeName(nameRaw);
//       if (!normalized) return res.status(400).json({ message: 'Invalid name' });

//       // find all matches (ambiguity detection)
//       const matches = await User.findAll({ where: { username_normalized: normalized } });

//       if (!matches || matches.length === 0) {
//         return res.status(404).json({ message: 'User not found' });
//       }
//       if (matches.length > 1) {
//         // ambiguous username — require email to disambiguate
//         return res.status(409).json({ message: 'Ambiguous username. Please login with your email.' });
//       }

//       user = matches[0];
//     } else {
//       // email login
//       if (!isValidEmail(email)) return res.status(400).json({ message: 'Invalid email' });
//       user = await User.findOne({ where: { email } });
//       if (!user) return res.status(404).json({ message: 'User not found' });
//     }

//     // update login timestamp and ensure registered flag
//     user.last_login_at = new Date();
//     if (!user.is_registered && user.email) user.is_registered = true;
//     await user.save();

//     const token = signToken(user);
//     return res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
//   } catch (err) {
//     console.error('LOGIN ERROR:', err);
//     const body = { message: 'Server error during login' };
//     if (process.env.NODE_ENV !== 'production') body.error = err.message || String(err);
//     return res.status(500).json(body);
//   }
// }

// async function logout(req, res) {
//   try {
//     const userId = req.user && req.user.id;
//     if (!userId) return res.status(400).json({ message: 'Invalid request' });

//     const user = await User.findByPk(userId);
//     if (!user) return res.status(404).json({ message: 'User not found' });

//     user.last_logout_at = new Date();
//     await user.save();

//     return res.json({ success: true, message: 'Logged out' });
//   } catch (err) {
//     console.error('LOGOUT ERROR:', err);
//     const body = { message: 'Server error during logout' };
//     if (process.env.NODE_ENV !== 'production') body.error = err.message || String(err);
//     return res.status(500).json(body);
//   }
// }

// async function update(req, res) {
//   const t = await sequelize.transaction();
//   try {
//     const userId = req.user && req.user.id;
//     if (!userId) {
//       await t.rollback();
//       return res.status(400).json({ message: 'Invalid request' });
//     }

//     const { name: rawName, email: rawEmail } = req.body || {};
//     if (!rawName && !rawEmail) {
//       await t.rollback();
//       return res.status(400).json({ message: 'At least one of name or email must be provided' });
//     }

//     const user = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
//     if (!user) {
//       await t.rollback();
//       return res.status(404).json({ message: 'User not found' });
//     }

//     if (rawEmail) {
//       const normalized = normalizeEmail(rawEmail);
//       if (!isValidEmail(normalized)) {
//         await t.rollback();
//         return res.status(400).json({ message: 'Invalid email format' });
//       }

//       const existing = await User.findOne({ where: { email: normalized }, transaction: t });
//       if (existing && existing.id !== user.id) {
//         await t.rollback();
//         return res.status(409).json({ message: 'Email already in use' });
//       }
//       user.email = normalized;
//     }

//     if (rawName) {
//       user.name = String(rawName).trim();

//       // ensure username_normalized exists/keeps in sync (if you want this behavior)
//       const candidate = normalizeName(rawName);
//       if (candidate && (!user.username_normalized || user.username_normalized !== candidate)) {
//         // try to reserve unique normalized username
//         const reserved = await reserveUniqueUsername(candidate);
//         user.username_normalized = reserved;
//       }
//     }

//     if (user.email) user.is_registered = true;

//     await user.save({ transaction: t });
//     await t.commit();

//     const token = signToken(user);
//     return res.json({
//       success: true,
//       token,
//       user: { id: user.id, name: user.name, email: user.email, is_registered: user.is_registered }
//     });
//   } catch (err) {
//     await t.rollback();
//     console.error('UPDATE ERROR:', err);

//     if (err instanceof UniqueConstraintError) {
//       return res.status(409).json({ message: 'Email or username already in use' });
//     }

//     const body = { message: 'Server error during update' };
//     if (process.env.NODE_ENV !== 'production') body.error = err.message || String(err);
//     return res.status(500).json(body);
//   }
// }

// module.exports = { register, login, logout, update };

// src/controllers/auth.dynamo.controller.js
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { ddbDocClient } = require('../lib/dynamoClient');
const { QueryCommand, PutCommand, UpdateCommand, GetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const USERS_TABLE = process.env.USERS_TABLE || 'Users';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '7d';
const MAX_USERNAME_ATTEMPTS = 6;
const CREATE_PUT_RETRIES = 3;

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function normalizeEmail(email) {
  if (!email) return null;
  return String(email).trim().toLowerCase();
}

function isValidEmail(email) {
  if (!email) return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function normalizeName(name) {
  if (!name) return null;
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .slice(0, 100);
}

/**
 * Try to check username existence:
 * - Prefer Query against username_normalized-index (if present)
 * - If Query fails (index missing, wrong schema), fall back to Scan
 */
async function usernameExists(candidate) {
  if (!candidate) return false;

  // Prefer Query against index if it exists; but be defensive
  try {
    const out = await ddbDocClient.send(new QueryCommand({
      TableName: USERS_TABLE,
      IndexName: 'username_normalized-index', // if you have this GSI
      KeyConditionExpression: 'username_normalized = :u',
      ExpressionAttributeValues: { ':u': candidate },
      Select: 'COUNT'
    }));
    return (out.Count || 0) > 0;
  } catch (err) {
    // fallback: index probably doesn't exist or schema mismatch — use a Scan
    console.warn('usernameExists: Query on GSI failed, falling back to Scan.', err && err.message);
    try {
      const scanOut = await ddbDocClient.send(new ScanCommand({
        TableName: USERS_TABLE,
        FilterExpression: 'username_normalized = :u',
        ExpressionAttributeValues: { ':u': candidate },
        Select: 'COUNT'
      }));
      return (scanOut.Count || 0) > 0;
    } catch (scanErr) {
      console.error('usernameExists: Scan failed', scanErr && scanErr.message);
      // Be conservative: say it exists on DB error to avoid collisions
      return true;
    }
  }
}

/**
 * Find single user by email.
 * Try Query on email-index then fallback to Scan.
 */
async function findUserByEmail(email) {
  if (!email) return null;

  try {
    const out = await ddbDocClient.send(new QueryCommand({
      TableName: USERS_TABLE,
      IndexName: 'email-index',
      KeyConditionExpression: 'email = :e',
      ExpressionAttributeValues: { ':e': email },
      Limit: 1
    }));
    return (out.Items && out.Items[0]) || null;
  } catch (err) {
    console.warn('findUserByEmail: Query failed, falling back to Scan.', err && err.message);
    try {
      const scanOut = await ddbDocClient.send(new ScanCommand({
        TableName: USERS_TABLE,
        FilterExpression: 'email = :e',
        ExpressionAttributeValues: { ':e': email },
        Limit: 1
      }));
      return (scanOut.Items && scanOut.Items[0]) || null;
    } catch (scanErr) {
      console.error('findUserByEmail: Scan failed', scanErr && scanErr.message);
      return null;
    }
  }
}

/**
 * Find users by normalized username (may return multiple).
 * Same defensive Query -> Scan approach.
 */
async function findUsersByNormalizedName(normalized) {
  if (!normalized) return [];
  try {
    const out = await ddbDocClient.send(new QueryCommand({
      TableName: USERS_TABLE,
      IndexName: 'username_normalized-index',
      KeyConditionExpression: 'username_normalized = :u',
      ExpressionAttributeValues: { ':u': normalized }
    }));
    return out.Items || [];
  } catch (err) {
    console.warn('findUsersByNormalizedName: Query failed, falling back to Scan.', err && err.message);
    try {
      const scanOut = await ddbDocClient.send(new ScanCommand({
        TableName: USERS_TABLE,
        FilterExpression: 'username_normalized = :u',
        ExpressionAttributeValues: { ':u': normalized }
      }));
      return scanOut.Items || [];
    } catch (scanErr) {
      console.error('findUsersByNormalizedName: Scan failed', scanErr && scanErr.message);
      return [];
    }
  }
}

/**
 * Reserve a unique username candidate (best-effort)
 */
async function reserveUniqueUsername(baseCandidate) {
  if (!baseCandidate) baseCandidate = `user${Date.now().toString().slice(-6)}`;
  let candidate = baseCandidate;

  for (let attempt = 0; attempt < MAX_USERNAME_ATTEMPTS; attempt++) {
    const exists = await usernameExists(candidate);
    if (!exists) return candidate;
    const suffix = Math.floor(Math.random() * 9000) + 1000;
    candidate = `${baseCandidate}_${suffix}`;
  }
  return `${baseCandidate}_${Date.now().toString().slice(-5)}`;
}

/**
 * Helper to create user item in Users table after pre-checks.
 * - Pre-checks: ensure no existing email and username (best-effort)
 * - Put the item. If Put fails due to conditional (rare locally), we bubble up and let caller retry.
 */
async function createUserWithUniqueUsername(item) {
  // Pre-check: ensure no user exists with this email
  const existing = await findUserByEmail(item.email);
  if (existing) {
    const err = new Error('email_exists');
    err.code = 'EmailExists';
    throw err;
  }

  // Pre-check username
  const unameExists = await usernameExists(item.username_normalized);
  if (unameExists) {
    const err = new Error('username_exists');
    err.code = 'UsernameExists';
    throw err;
  }

  // Attempt to put item - use a conditional to avoid accidental overwrite of same id
  const putParams = {
    TableName: USERS_TABLE,
    Item: item,
    ConditionExpression: 'attribute_not_exists(id)'
  };

  // Retry a few times if Put fails (possible race)
  for (let attempt = 1; attempt <= CREATE_PUT_RETRIES; attempt++) {
    try {
      await ddbDocClient.send(new PutCommand(putParams));
      return; // success
    } catch (err) {
      // ConditionalCheckFailed -> somebody created same PK (very unlikely for uuid)
      if (err.name === 'ConditionalCheckFailedException') {
        console.warn('createUserWithUniqueUsername: ConditionalCheckFailedException on attempt', attempt);
        if (attempt === CREATE_PUT_RETRIES) throw err;
        // slight jitter before retry
        await new Promise(resolve => setTimeout(resolve, 50 * attempt));
        continue;
      }
      // Other errors: bubble up
      throw err;
    }
  }
}

/**
 * REGISTER
 */
async function register(req, res) {
  try {
    const { name: rawName, email: rawEmail } = req.body || {};
    const nameRaw = rawName ? String(rawName).trim() : '';
    const email = normalizeEmail(rawEmail);

    if (!nameRaw || !email) {
      return res.status(400).json({ message: 'Name and email required' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    // If a user with this email exists -> update it
    const existing = await findUserByEmail(email);
    if (existing) {
      const usernameNormalized = existing.username_normalized || await reserveUniqueUsername(normalizeName(nameRaw) || normalizeName(email.split('@')[0]));
      const updateParams = {
        TableName: USERS_TABLE,
        Key: { id: existing.id },
        UpdateExpression: 'SET #n = :name, is_registered = :is_registered, last_login_at = :last_login_at, username_normalized = :username_normalized',
        ExpressionAttributeNames: { '#n': 'name' },
        ExpressionAttributeValues: {
          ':name': nameRaw,
          ':is_registered': true,
          ':last_login_at': Date.now(),
          ':username_normalized': usernameNormalized
        },
        ReturnValues: 'ALL_NEW'
      };

      const updated = await ddbDocClient.send(new UpdateCommand(updateParams));
      const user = updated.Attributes;
      const token = signToken(user);
      return res.status(200).json({ token, user: { id: user.id, name: user.name, email: user.email, is_registered: user.is_registered } });
    }

    // Create new user: try a few username candidates
    let attempts = 0;
    let created = null;
    let lastErr = null;
    const baseFromName = normalizeName(nameRaw);
    const emailLocal = email.split('@')[0];
    const baseCandidate = baseFromName && baseFromName.length ? baseFromName : normalizeName(emailLocal) || `user${Date.now().toString().slice(-6)}`;

    while (attempts < MAX_USERNAME_ATTEMPTS) {
      attempts += 1;
      const candidate = attempts === 1 ? baseCandidate : await reserveUniqueUsername(baseCandidate);
      const id = uuidv4();
      const now = Date.now();

      const item = {
        id,
        name: nameRaw,
        email,
        is_registered: true,
        last_login_at: now,
        username_normalized: candidate,
        created_at: now
      };

      try {
        await createUserWithUniqueUsername(item);
        created = item;
        break;
      } catch (err) {
        lastErr = err;
        // If the error is clearly about email existing, bail out
        if (err && (err.code === 'EmailExists' || (err.name === 'ConditionalCheckFailedException' && String(err.message).toLowerCase().includes('email')))) {
          console.warn('Register failed due to existing email:', err.message || err);
          return res.status(409).json({ message: 'Email already in use' });
        }
        // If username existed, try next candidate
        if (err && (err.code === 'UsernameExists' || (err.message && String(err.message).toLowerCase().includes('username')))) {
          console.warn('username collision, retrying with new candidate');
          continue;
        }

        // Unexpected error - log and then retry loop (or fail after attempts)
        console.warn('Register attempt failed, retrying with a new username candidate:', err && err.message);
      }
    }

    if (!created) {
      console.error('REGISTER: failed to create unique username', lastErr && lastErr.message);
      return res.status(409).json({ message: 'Username or email already in use' });
    }

    const token = signToken(created);
    return res.status(201).json({
      token,
      user: { id: created.id, name: created.name, email: created.email, is_registered: created.is_registered }
    });

  } catch (err) {
    console.error('REGISTER ERROR:', err && (err.stack || err.message || err));
    return res.status(500).json({ message: 'Server error during register', error: err.message || String(err) });
  }
}

/**
 * LOGIN
 */
async function login(req, res) {
  try {
    const { email: rawEmail, name: rawName } = req.body || {};
    const email = normalizeEmail(rawEmail);
    const nameTrim = rawName ? String(rawName).trim() : null;

    if (!email && !nameTrim) return res.status(400).json({ message: 'Email or name required' });

    let user = null;

    if (nameTrim) {
      const normalized = normalizeName(nameTrim);
      if (!normalized) return res.status(400).json({ message: 'Invalid name' });

      const matches = await findUsersByNormalizedName(normalized);

      if (!matches || matches.length === 0) {
        return res.status(404).json({ message: 'User not found' });
      }
      if (matches.length > 1) {
        return res.status(409).json({ message: 'Ambiguous username. Please login with your email.' });
      }
      user = matches[0];
    } else {
      if (!isValidEmail(email)) return res.status(400).json({ message: 'Invalid email' });
      const found = await findUserByEmail(email);
      if (!found) return res.status(404).json({ message: 'User not found' });
      user = found;
    }

    // Update last_login_at and is_registered
    const now = Date.now();
    const updateParams = {
      TableName: USERS_TABLE,
      Key: { id: user.id },
      UpdateExpression: 'SET last_login_at = :lla, is_registered = :ir',
      ExpressionAttributeValues: { ':lla': now, ':ir': (user.is_registered || !!user.email) }
    };
    await ddbDocClient.send(new UpdateCommand(updateParams));

    const token = signToken(user);
    return res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    console.error('LOGIN ERROR:', err && (err.stack || err.message || err));
    return res.status(500).json({ message: 'Server error during login', error: err.message || String(err) });
  }
}

/**
 * LOGOUT
 */
async function logout(req, res) {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(400).json({ message: 'Invalid request' });

    const params = {
      TableName: USERS_TABLE,
      Key: { id: userId },
      UpdateExpression: 'SET last_logout_at = :t',
      ExpressionAttributeValues: { ':t': Date.now() }
    };

    await ddbDocClient.send(new UpdateCommand(params));
    return res.json({ success: true, message: 'Logged out' });
  } catch (err) {
    console.error('LOGOUT ERROR:', err && (err.stack || err.message || err));
    return res.status(500).json({ message: 'Server error during logout', error: err.message || String(err) });
  }
}

/**
 * UPDATE user (name/email)
 */
async function update(req, res) {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(400).json({ message: 'Invalid request' });

    const { name: rawName, email: rawEmail } = req.body || {};
    if (!rawName && !rawEmail) return res.status(400).json({ message: 'At least one of name or email must be provided' });

    const getRes = await ddbDocClient.send(new GetCommand({ TableName: USERS_TABLE, Key: { id: userId } }));
    const user = getRes.Item;
    if (!user) return res.status(404).json({ message: 'User not found' });

    const updates = [];
    const exprAttrValues = {};
    const exprAttrNames = {};

    if (rawEmail) {
      const normalized = normalizeEmail(rawEmail);
      if (!isValidEmail(normalized)) return res.status(400).json({ message: 'Invalid email format' });

      const existing = await findUserByEmail(normalized);
      if (existing && existing.id !== user.id) return res.status(409).json({ message: 'Email already in use' });

      updates.push('email = :email');
      exprAttrValues[':email'] = normalized;
    }

    if (rawName) {
      const candidate = normalizeName(rawName);
      if (candidate && (!user.username_normalized || user.username_normalized !== candidate)) {
        const reserved = await reserveUniqueUsername(candidate);
        updates.push('username_normalized = :uname');
        exprAttrValues[':uname'] = reserved;
      }
      updates.push('#n = :name');
      exprAttrNames['#n'] = 'name';
      exprAttrValues[':name'] = rawName;
    }

    if (updates.length === 0) return res.status(400).json({ message: 'Nothing to update' });

    const updateParams = {
      TableName: USERS_TABLE,
      Key: { id: userId },
      UpdateExpression: 'SET ' + updates.join(', '),
      ExpressionAttributeNames: exprAttrNames,
      ExpressionAttributeValues: exprAttrValues,
      ReturnValues: 'ALL_NEW'
    };

    const updated = await ddbDocClient.send(new UpdateCommand(updateParams));
    const newUser = updated.Attributes;
    const token = signToken(newUser);

    return res.json({ success: true, token, user: { id: newUser.id, name: newUser.name, email: newUser.email, is_registered: newUser.is_registered } });
  } catch (err) {
    console.error('UPDATE ERROR:', err && (err.stack || err.message || err));
    return res.status(500).json({ message: 'Server error during update', error: err.message || String(err) });
  }
}

module.exports = { register, login, logout, update };
