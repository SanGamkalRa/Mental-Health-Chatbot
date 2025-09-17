// src/controllers/auth.controller.js
const jwt = require('jsonwebtoken');
const { User, sequelize } = require('../config/db'); // ensure db exports sequelize & User
const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '7d';

function signToken(user) {
  // create a small payload, include id and email
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

async function register(req, res) {
  try {
    const { name, email } = req.body || {};
    if (!name || !email) return res.status(400).json({ message: 'Name and email required' });

    if (!sequelize) {
      console.error('Sequelize instance not found in src/config/db.js');
      return res.status(500).json({ message: 'DB not configured' });
    }

    let user = await User.findOne({ where: { email } });
    if (user) {
      user.name = name;
      user.is_registered = true;
      await user.save();
    } else {
      user = await User.create({ name, email, is_registered: true });
    }

    user.last_login_at = new Date();
    await user.save();

    const token = signToken(user);
    return res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email, is_registered: user.is_registered }
    });
  } catch (err) {
    console.error('REGISTER ERROR:', err);
    const body = { message: 'Server error during register' };
    if (process.env.NODE_ENV !== 'production') body.error = err.message || String(err);
    return res.status(500).json(body);
  }
}

async function login(req, res) {
  try {
    const { email, name } = req.body || {};
    if (!email && !name) return res.status(400).json({ message: 'Email or name required' });

    const user = email ? await User.findOne({ where: { email } }) : await User.findOne({ where: { name } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.last_login_at = new Date();
    if (!user.is_registered) user.is_registered = true;
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

/**
 * Logout
 * - protected route (requireAuth must set req.user.id)
 * - updates last_logout_at for audit and returns success: true
 * - NOTE: client must still remove token locally (JWTs are stateless)
 */
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

/**
 * Update user profile (name and/or email)
 * - protected route
 * - accepts { name?, email? } in body (at least one required)
 * - validates email format if provided
 * - ensures email uniqueness (another user cannot have it)
 * - returns updated user and a fresh token
 */
async function update(req, res) {
  const t = await sequelize.transaction();
  try {
    const userId = req.user && req.user.id;
    if (!userId) {
      await t.rollback();
      return res.status(400).json({ message: 'Invalid request' });
    }

    const { name, email } = req.body || {};
    if (!name && !email) {
      await t.rollback();
      return res.status(400).json({ message: 'At least one of name or email must be provided' });
    }

    // fetch fresh user
    const user = await User.findByPk(userId, { transaction: t });
    if (!user) {
      await t.rollback();
      return res.status(404).json({ message: 'User not found' });
    }

    // if updating email, validate and check uniqueness
    if (email) {
      const normalized = String(email).trim().toLowerCase();
      // basic email validation
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRe.test(normalized)) {
        await t.rollback();
        return res.status(400).json({ message: 'Invalid email format' });
      }

      // ensure no other user has this email
      const existing = await User.findOne({ where: { email: normalized }, transaction: t });
      if (existing && existing.id !== user.id) {
        await t.rollback();
        return res.status(409).json({ message: 'Email already in use' });
      }

      user.email = normalized;
    }

    if (name) {
      user.name = String(name).trim();
    }

    // mark registered if email now present
    if (user.email) user.is_registered = true;

    await user.save({ transaction: t });
    await t.commit();

    // optionally: issue a new token reflecting updated email
    const token = signToken(user);

    return res.json({
      success: true,
      token,
      user: { id: user.id, name: user.name, email: user.email, is_registered: user.is_registered }
    });
  } catch (err) {
    await t.rollback();
    console.error('UPDATE ERROR:', err);
    const body = { message: 'Server error during update' };
    if (process.env.NODE_ENV !== 'production') body.error = err.message || String(err);
    return res.status(500).json(body);
  }
}

module.exports = { register, login, logout, update };
