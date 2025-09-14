// src/controllers/auth.controller.js
const jwt = require('jsonwebtoken');
const { User, sequelize } = require('../config/db'); // ensure db exports sequelize & User
const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '7d';

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

async function register(req, res) {
  try {
    const { name, email } = req.body || {};
    if (!name || !email) return res.status(400).json({ message: 'Name and email required' });

    // sanity: make sure DB connection is up
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
    // detailed logging for dev
    console.error('REGISTER ERROR:', err);
    // send stack in dev only
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

module.exports = { register, login };
