// src/controllers/auth.controller.js
const jwt = require('jsonwebtoken');
const { User, sequelize } = require('../config/db'); // ensure db exports sequelize & User
const { UniqueConstraintError } = require('sequelize');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '7d';
const MAX_USERNAME_ATTEMPTS = 6;

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function normalizeEmail(email) {
  if (!email) return null;
  return String(email).trim().toLowerCase();
}

/**
 * Normalize a display name into username_normalized form:
 * - trim
 * - lowercase
 * - replace non-alphanumeric with underscore
 * - collapse multiple underscores
 * - trim leading/trailing underscores
 * - truncate to 100 chars (DB column length)
 */
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

function isValidEmail(email) {
  if (!email) return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

/**
 * Try to produce a unique username_normalized candidate.
 * Strategy:
 *  - base from provided name (normalized)
 *  - fallback to email local-part if name absent
 *  - on collisions, append _<random4> or _<id-like> and retry up to MAX_USERNAME_ATTEMPTS
 */
async function reserveUniqueUsername(baseCandidate) {
  if (!baseCandidate) baseCandidate = `user${Date.now().toString().slice(-6)}`;

  let candidate = baseCandidate;
  for (let attempt = 0; attempt < MAX_USERNAME_ATTEMPTS; attempt++) {
    // check if candidate exists
    // using count is fine here; we still handle race with UniqueConstraintError on create
    const found = await User.count({ where: { username_normalized: candidate } });
    if (!found) return candidate;

    // generate new candidate: base + '_' + 4-digit random
    const suffix = Math.floor(Math.random() * 9000) + 1000;
    candidate = `${baseCandidate}_${suffix}`;
  }
  // fallback to time-based unique
  return `${baseCandidate}_${Date.now().toString().slice(-5)}`;
}

/**
 * REGISTER
 * - validate inputs
 * - attempt to create or update existing by email
 * - ensure username_normalized is created and unique (retry on UniqueConstraintError)
 */
async function register(req, res) {
  const t = await sequelize.transaction();
  try {
    const { name: rawName, email: rawEmail } = req.body || {};
    const nameRaw = rawName ? String(rawName).trim() : '';
    const email = normalizeEmail(rawEmail);

    if (!nameRaw || !email) {
      await t.rollback();
      return res.status(400).json({ message: 'Name and email required' });
    }
    if (!isValidEmail(email)) {
      await t.rollback();
      return res.status(400).json({ message: 'Invalid email format' });
    }

    // Check if user exists by email
    let user = await User.findOne({
      where: { email },
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    // Prepare username_normalized base
    const baseFromName = normalizeName(nameRaw);
    const emailLocal = email.split('@')[0];
    const baseCandidate = baseFromName && baseFromName.length ? baseFromName : normalizeName(emailLocal) || `user${Date.now().toString().slice(-6)}`;

    if (user) {
      // update existing user - ensure they have a username_normalized
      user.name = nameRaw;
      user.is_registered = true;
      user.last_login_at = new Date();

      // if username_normalized absent — create one deterministically (with reservation)
      if (!user.username_normalized) {
        const reserved = await reserveUniqueUsername(baseCandidate);
        user.username_normalized = reserved;
      }

      await user.save({ transaction: t });
      await t.commit();

      const token = signToken(user);
      return res.status(200).json({
        token,
        user: { id: user.id, name: user.name, email: user.email, is_registered: user.is_registered }
      });
    }

    // Create new user - attempt to reserve unique username and create
    let created = null;
    let attempts = 0;
    let lastErr = null;

    // Try a few times to create with different username candidates if needed
    while (attempts < MAX_USERNAME_ATTEMPTS) {
      attempts += 1;
      const candidate = attempts === 1 ? baseCandidate : await reserveUniqueUsername(baseCandidate);

      try {
        created = await User.create({
          name: nameRaw,
          email,
          is_registered: true,
          last_login_at: new Date(),
          username_normalized: candidate
        }, { transaction: t });

        // success
        await t.commit();
        const token = signToken(created);
        return res.status(201).json({
          token,
          user: { id: created.id, name: created.name, email: created.email, is_registered: created.is_registered }
        });
      } catch (err) {
        lastErr = err;
        // if unique constraint on username_normalized or email - retry (username collision) or fail (email)
        if (err instanceof UniqueConstraintError) {
          // if email conflict, bail out
          const fields = err?.fields || {};
          if (fields.email) {
            await t.rollback();
            return res.status(409).json({ message: 'Email already in use' });
          }
          // otherwise assume username collision and retry loop with a new candidate
          // continue to next attempt
        } else {
          // unknown error -> propagate
          await t.rollback();
          console.error('REGISTER ERROR (unknown):', err);
          const body = { message: 'Server error during register' };
          if (process.env.NODE_ENV !== 'production') body.error = err.message || String(err);
          return res.status(500).json(body);
        }
      }
    }

    // If we exit loop without return, we failed to create a unique username
    console.error('REGISTER: failed to create unique username after attempts', lastErr);
    await t.rollback();
    return res.status(409).json({ message: 'Username or email already in use' });
  } catch (err) {
    await t.rollback();
    console.error('REGISTER ERROR:', err);
    if (err instanceof UniqueConstraintError) {
      return res.status(409).json({ message: 'Username or email already in use' });
    }
    const body = { message: 'Server error during register' };
    if (process.env.NODE_ENV !== 'production') body.error = err.message || String(err);
    return res.status(500).json(body);
  }
}

/**
 * LOGIN
 * - Accepts { email } or { name } (normalized name)
 * - If login by name:
 *    - Normalize name and find all users with that username_normalized
 *    - If 0 -> 404
 *    - If >1 -> 409 (ambiguous)
 *    - If 1 -> success
 * - If login by email: find by email
 */
async function login(req, res) {
  try {
    const { email: rawEmail, name: rawName } = req.body || {};
    const email = normalizeEmail(rawEmail);
    const nameRaw = rawName ? String(rawName).trim() : null;

    if (!email && !nameRaw) return res.status(400).json({ message: 'Email or name required' });

    let user = null;

    if (nameRaw) {
      const normalized = normalizeName(nameRaw);
      if (!normalized) return res.status(400).json({ message: 'Invalid name' });

      // find all matches (ambiguity detection)
      const matches = await User.findAll({ where: { username_normalized: normalized } });

      if (!matches || matches.length === 0) {
        return res.status(404).json({ message: 'User not found' });
      }
      if (matches.length > 1) {
        // ambiguous username — require email to disambiguate
        return res.status(409).json({ message: 'Ambiguous username. Please login with your email.' });
      }

      user = matches[0];
    } else {
      // email login
      if (!isValidEmail(email)) return res.status(400).json({ message: 'Invalid email' });
      user = await User.findOne({ where: { email } });
      if (!user) return res.status(404).json({ message: 'User not found' });
    }

    // update login timestamp and ensure registered flag
    user.last_login_at = new Date();
    if (!user.is_registered && user.email) user.is_registered = true;
    await user.save();

    const token = signToken(user);
    return res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    console.error('LOGIN ERROR:', err);
    const body = { message: 'Server error during login' };
    if (process.env.NODE_ENV !== 'production') body.error = err.message || String(err);
    return res.status(500).json(body);
  }
}

async function logout(req, res) {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(400).json({ message: 'Invalid request' });

    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.last_logout_at = new Date();
    await user.save();

    return res.json({ success: true, message: 'Logged out' });
  } catch (err) {
    console.error('LOGOUT ERROR:', err);
    const body = { message: 'Server error during logout' };
    if (process.env.NODE_ENV !== 'production') body.error = err.message || String(err);
    return res.status(500).json(body);
  }
}

async function update(req, res) {
  const t = await sequelize.transaction();
  try {
    const userId = req.user && req.user.id;
    if (!userId) {
      await t.rollback();
      return res.status(400).json({ message: 'Invalid request' });
    }

    const { name: rawName, email: rawEmail } = req.body || {};
    if (!rawName && !rawEmail) {
      await t.rollback();
      return res.status(400).json({ message: 'At least one of name or email must be provided' });
    }

    const user = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!user) {
      await t.rollback();
      return res.status(404).json({ message: 'User not found' });
    }

    if (rawEmail) {
      const normalized = normalizeEmail(rawEmail);
      if (!isValidEmail(normalized)) {
        await t.rollback();
        return res.status(400).json({ message: 'Invalid email format' });
      }

      const existing = await User.findOne({ where: { email: normalized }, transaction: t });
      if (existing && existing.id !== user.id) {
        await t.rollback();
        return res.status(409).json({ message: 'Email already in use' });
      }
      user.email = normalized;
    }

    if (rawName) {
      user.name = String(rawName).trim();

      // ensure username_normalized exists/keeps in sync (if you want this behavior)
      const candidate = normalizeName(rawName);
      if (candidate && (!user.username_normalized || user.username_normalized !== candidate)) {
        // try to reserve unique normalized username
        const reserved = await reserveUniqueUsername(candidate);
        user.username_normalized = reserved;
      }
    }

    if (user.email) user.is_registered = true;

    await user.save({ transaction: t });
    await t.commit();

    const token = signToken(user);
    return res.json({
      success: true,
      token,
      user: { id: user.id, name: user.name, email: user.email, is_registered: user.is_registered }
    });
  } catch (err) {
    await t.rollback();
    console.error('UPDATE ERROR:', err);

    if (err instanceof UniqueConstraintError) {
      return res.status(409).json({ message: 'Email or username already in use' });
    }

    const body = { message: 'Server error during update' };
    if (process.env.NODE_ENV !== 'production') body.error = err.message || String(err);
    return res.status(500).json(body);
  }
}

module.exports = { register, login, logout, update };
