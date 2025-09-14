// src/controllers/chat.controller.js
const { Message } = require('../config/db');

// simple reply stub - replace with AI integration later
async function getBotReply(text) {
  if (/help|suicid|harm|kill/i.test(text)) {
    return "If you're in immediate danger or thinking about harming yourself, please contact local emergency services or a suicide prevention hotline immediately.";
  }
  return `I hear you — you said: "${text}". (placeholder)`;
}

exports.sendMessage = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ message: 'Text required' });

    const userMsg = await Message.create({ userId: req.user.id, direction: 'user', text });
    const botText = await getBotReply(text);
    const botMsg = await Message.create({ userId: req.user.id, direction: 'bot', text: botText });

    res.json({ user: userMsg, bot: botMsg });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getHistory = async (req, res) => {
  try {
    const msgs = await Message.findAll({ where: { userId: req.user.id }, order: [['createdAt','ASC']] });
    res.json({ messages: msgs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
