// src/controllers/mood.controller.js
const { Mood } = require('../config/db');

exports.addMood = async (req, res) => {
  try {
    const { mood, note } = req.body;
    if (mood == null) return res.status(400).json({ message: 'Mood is required' });
    const entry = await Mood.create({ userId: req.user.id, mood, note });
    res.status(201).json({ entry });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getMoods = async (req, res) => {
  try {
    const entries = await Mood.findAll({ where: { userId: req.user.id }, order: [['createdAt','DESC']], limit: 200 });
    res.json({ entries });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
