// src/controllers/auth.dynamo.controller.js
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const { ddbDocClient } = require('../lib/dynamoClient');
const {
  QueryCommand,
  PutCommand,
  UpdateCommand,
  GetCommand,
  ScanCommand,
  DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');

const USERS_TABLE = process.env.USERS_TABLE || 'Users';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '7d';
const MAX_USERNAME_ATTEMPTS = 6;
const CREATE_PUT_RETRIES = 3;

function signToken(user) {
  // sign minimal info
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
 * Defensive helpers: Try Query on GSI, fallback to Scan.
 */

async function usernameExists(candidate) {
  if (!candidate) return false;
  // try Query on GSI 'username_normalized-index' if it exists
  try {
    const out = await ddbDocClient.send(new QueryCommand({
      TableName: USERS_TABLE,
      IndexName: 'username_normalized-index',
      KeyConditionExpression: 'username_normalized = :u',
      ExpressionAttributeValues: { ':u': candidate },
      Select: 'COUNT'
    }));
    return (out.Count || 0) > 0;
  } catch (err) {
    // fallback to Scan
    try {
      const scanOut = await ddbDocClient.send(new ScanCommand({
        TableName: USERS_TABLE,
        FilterExpression: 'username_normalized = :u',
        ExpressionAttributeValues: { ':u': candidate },
        Select: 'COUNT'
      }));
      return (scanOut.Count || 0) > 0;
    } catch (scanErr) {
      console.error('usernameExists fallback scan failed:', scanErr && scanErr.message);
      // be conservative on error to avoid duplicate username allocation
      return true;
    }
  }
}

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
    const item = (out.Items && out.Items[0]) || null;
    // ensure item actually has non-empty email attribute
    if (!item || !item.email) return null;
    return item;
  } catch (err) {
    // fallback to Scan (small tables only — prefer GSI in production)
    try {
      const scanOut = await ddbDocClient.send(new ScanCommand({
        TableName: USERS_TABLE,
        FilterExpression: 'email = :e',
        ExpressionAttributeValues: { ':e': email },
        Limit: 1
      }));
      const item = (scanOut.Items && scanOut.Items[0]) || null;
      if (!item || !item.email) return null;
      return item;
    } catch (scanErr) {
      console.error('findUserByEmail fallback scan failed:', scanErr && scanErr.message);
      return null;
    }
  }
}

async function findUsersByNormalizedName(normalized) {
  if (!normalized) return [];
  // First try GSI
  try {
    const out = await ddbDocClient.send(new QueryCommand({
      TableName: USERS_TABLE,
      IndexName: 'username_normalized-index',
      KeyConditionExpression: 'username_normalized = :u',
      ExpressionAttributeValues: { ':u': normalized }
    }));
    return (out.Items || []).filter(i => i && i.email); // require email if needed
  } catch (err) {
    console.warn('findUsersByNormalizedName: GSI query failed, falling back to scan:', err && err.message);
    try {
      const scanOut = await ddbDocClient.send(new ScanCommand({
        TableName: USERS_TABLE,
        FilterExpression: 'username_normalized = :u AND attribute_exists(email)',
        ExpressionAttributeValues: { ':u': normalized }
      }));
      return scanOut.Items || [];
    } catch (scanErr) {
      console.error('findUsersByNormalizedName: fallback scan failed:', scanErr && scanErr.message);
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
 * Enforces item.email presence and uses a conditional Put (id) to avoid overwrite.
 */
async function createUserWithUniqueUsername(item) {
  if (!item || !item.email) {
    const err = new Error('missing_email');
    err.code = 'MissingEmail';
    throw err;
  }

  // check email uniqueness first
  const existing = await findUserByEmail(item.email);
  if (existing) {
    const err = new Error('email_exists');
    err.code = 'EmailExists';
    throw err;
  }

  // check username existence
  const unameExists = await usernameExists(item.username_normalized);
  if (unameExists) {
    const err = new Error('username_exists');
    err.code = 'UsernameExists';
    throw err;
  }

  const putParams = {
    TableName: USERS_TABLE,
    Item: item,
    ConditionExpression: 'attribute_not_exists(id)' // ensure id not present
  };

  for (let attempt = 1; attempt <= CREATE_PUT_RETRIES; attempt++) {
    try {
      await ddbDocClient.send(new PutCommand(putParams));
      return;
    } catch (err) {
      // Conditional failure: try again (very unlikely unless id collision)
      if (err.name === 'ConditionalCheckFailedException') {
        console.warn('createUserWithUniqueUsername: ConditionalCheckFailedException attempt', attempt);
        if (attempt === CREATE_PUT_RETRIES) throw err;
        // small delay and retry
        await new Promise(resolve => setTimeout(resolve, 50 * attempt));
        continue;
      }
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

    // If a user exists with this email -> update and ensure username_normalized exists
    const existing = await findUserByEmail(email);
    if (existing) {
      // create a deterministic username if missing
      let usernameNormalized = existing.username_normalized;
      if (!usernameNormalized) {
        const candidateFromName = normalizeName(nameRaw) || normalizeName(email.split('@')[0]);
        usernameNormalized = await reserveUniqueUsername(candidateFromName);
      }

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
      // ensure email present — if not, re-check
      if (!user.email) {
        // unexpected — but fail safely
        return res.status(500).json({ message: 'Existing user record missing email' });
      }
      const token = signToken(user);
      return res.status(200).json({ token, user: { id: user.id, name: user.name, email: user.email, is_registered: user.is_registered } });
    }

    // No existing user -> create new
    let attempts = 0;
    let created = null;
    let lastErr = null;
    const baseFromName = normalizeName(nameRaw);
    const emailLocal = email.split('@')[0];
    const baseCandidate = baseFromName && baseFromName.length ? baseFromName : normalizeName(emailLocal) || `user${Date.now().toString().slice(-6)}`;

    while (attempts < MAX_USERNAME_ATTEMPTS) {
      attempts += 1;
      const candidate = attempts === 1 ? baseCandidate : await reserveUniqueUsername(baseCandidate);
const id = randomUUID();      const now = Date.now();

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
        // If email somehow exists -> return conflict
        if (err && (err.code === 'EmailExists' || (err.name === 'ConditionalCheckFailedException' && String(err.message).toLowerCase().includes('email')))) {
          console.warn('Register failed due to existing email:', err.message || err);
          return res.status(409).json({ message: 'Email already in use' });
        }
        // username collisions -> retry
        if (err && (err.code === 'UsernameExists' || (err.message && String(err.message).toLowerCase().includes('username')))) {
          console.warn('username collision, retrying with new candidate');
          continue;
        }
        // other unexpected errors -> bubble up
        console.warn('Register attempt error (will retry username candidate):', err && err.message);
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

      // Defensive: if matched user has no email, treat as not found -> forces registration with email
      if (!user.email) {
        return res.status(404).json({ message: 'User not found' });
      }
    } else {
      // email login
      if (!isValidEmail(email)) return res.status(400).json({ message: 'Invalid email' });
      const found = await findUserByEmail(email);
      if (!found) return res.status(404).json({ message: 'User not found' });
      user = found;
    }

    // Update last_login_at and is_registered (if they have a valid email we can mark registered)
    const now = Date.now();
    const updateParams = {
      TableName: USERS_TABLE,
      Key: { id: user.id },
      UpdateExpression: 'SET last_login_at = :lla, is_registered = :ir',
      ExpressionAttributeValues: { ':lla': now, ':ir': (user.is_registered || !!user.email) },
      ReturnValues: 'NONE'
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
