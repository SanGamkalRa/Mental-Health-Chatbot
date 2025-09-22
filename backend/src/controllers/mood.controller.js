// src/controllers/mood.controller.js
const { Op } = require('sequelize');
const db = require('../models');
const Mood = db.Mood;
const User = db.User;
const sequelize = db.sequelize;

// in src/controllers/mood.controller.js
async function resolveUserIdFromReq(req) {
  if (req.user && req.user.id) return req.user.id;

  const usernameHeader = (req.headers['x-username'] || (req.body && req.body.username) || '').trim();
  if (!usernameHeader) return null;

  if (!User) {
    console.warn('resolveUserIdFromReq: User model not found in models export. Skipping lookup.');
    return null;
  }

  try {
    const usernameNormalized = usernameHeader.toLowerCase();

    // Only query columns that exist in your users table.
    const candidateCols = [
      { username_normalized: usernameNormalized },
      { email: usernameHeader },
      { name: usernameHeader }
    ];

    const user = await User.findOne({
      where: {
        [Op.or]: candidateCols
      }
    });
    return user ? user.id : null;
  } catch (err) {
    console.error('resolveUserIdFromReq error:', err);
    return null;
  }
}


async function getMoods(req, res) {
  try {
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10);
    if (!year || !month || month < 1 || month > 12) {
      return res.status(400).json({ success: false, message: "Provide valid year and month query params" });
    }

    const start = `${year}-${String(month).padStart(2,'0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;

    const userId = await resolveUserIdFromReq(req);

    const where = { date: { [Op.between]: [start, end] } };
    if (userId) where.userId = userId;
    else where.userId = null; // change if you want shared/anonymous listing

    const rows = await Mood.findAll({
      where,
      order: [['date','ASC']],
      attributes: ['id','userId','date','mood','note','createdAt','updatedAt']
    });

    return res.json(rows);
  } catch (err) {
    console.error('mood.getMoods error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

async function upsertMood(req, res) {
  const t = await sequelize.transaction();
  try {
    const { date, mood, note } = req.body;
    if (!date || !mood) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'date and mood required' });
    }

    const userId = await resolveUserIdFromReq(req);

    const existing = await Mood.findOne({ where: { userId: userId || null, date }, transaction: t });

    let saved;
    if (existing) {
      existing.mood = mood;
      existing.note = note || null;
      await existing.save({ transaction: t });
      saved = existing;
    } else {
      saved = await Mood.create({
        userId: userId || null,
        date,
        mood,
        note: note || null,
      }, { transaction: t });
    }

    await t.commit();
    const returnRow = await Mood.findOne({ where: { id: saved.id } });
    return res.json({ success: true, record: returnRow });
  } catch (err) {
    await t.rollback();
    console.error('mood.upsert error', err);
    if (err && err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ success: false, message: 'Duplicate entry' });
    }
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}


module.exports = { getMoods, upsertMood };
