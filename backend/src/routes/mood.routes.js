// routes/moods.js
const express = require('express');
const router = express.Router();
const { Mood, User } = require('../models'); // adjust to your models export
const requireAuth = require('../middleware/auth.middleware'); // optional

// helper to get user identification from request:
// if you have auth middleware that sets req.user.id, prefer that.
// else accept username header 'x-username' for compatibility.
async function resolveUserId(req) {
  if (req.user && req.user.id) return req.user.id;
  const usernameHeader = req.headers['x-username'] || req.body.username;
  if (!usernameHeader) return null;
  // try to find user by username
  const user = await User.findOne({ where: { username: usernameHeader } });
  return user ? user.id : null;
}

// GET moods for a month: ?year=YYYY&month=MM
router.get('/', /* requireAuth, */ async (req, res) => {
  try {
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10); // 1..12
    if (!year || !month) {
      return res.status(400).json({ message: "Provide year and month query params" });
    }

    const start = `${year}-${String(month).padStart(2,'0')}-01`;
    // compute last day properly
    const m = new Date(year, month, 0);
    const lastDay = m.getDate();
    const end = `${year}-${String(month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;

    const userId = await resolveUserId(req);

    const where = {
      date: { [require('sequelize').Op.between]: [start, end] }
    };
    if (userId) where.userId = userId;

    const rows = await Mood.findAll({ where, order: [['date','ASC']] });

    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// POST upsert mood
router.post('/', /* requireAuth, */ async (req, res) => {
  try {
    const { date, mood, note } = req.body;
    if (!date || !mood) return res.status(400).json({ message: "date and mood required" });

    const userId = await resolveUserId(req); // may be null

    // Upsert (create or update existing)
    const [record, created] = await Mood.upsert({
      userId: userId || null,
      date,
      mood,
      note: note || null,
    }, { returning: true });

    // Mood.upsert returns [instance, created?] depending on dialect.
    // To be consistent, fetch the saved record:
    const saved = await Mood.findOne({ where: { userId: userId || null, date } });

    return res.json({ success: true, record: saved });
  } catch (err) {
    console.error("Save mood error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
