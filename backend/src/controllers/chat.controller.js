// backend/src/controllers/chat.controller.js
const { Conversation, Message, User, sequelize } = require('../config/db');
const { getResponse } = require('../services/intentMatcher'); // server matcher

async function createConversation(req, res) {
  const t = await sequelize.transaction();
  try {
    const userId = req.user && req.user.id ? req.user.id : null;
    const { title } = req.body || {};

    const conv = await Conversation.create({
      title: title || 'New conversation',
      user_id: userId
    }, { transaction: t });

    const welcomeText = "👋 Hi! I’m your Mental Health Companion. How are you feeling today?";
    await Message.create({
      conversation_id: conv.id,
      direction: 'bot',
      text: welcomeText,
      user_id: null
    }, { transaction: t });

    await t.commit();

    const withMessages = await Conversation.findByPk(conv.id, {
      include: [{ model: Message, as: 'messages', order: [['created_at','ASC']] }]
    });
    return res.status(201).json(withMessages);
  } catch (err) {
    await t.rollback();
    console.error('createConversation error', err);
    return res.status(500).json({ message: 'Server error creating conversation', error: err.message });
  }
}

async function listConversations(req, res) {
  try {
    const userId = req.user && req.user.id ? req.user.id : null;
    const where = userId ? { user_id: userId } : {};
    const convs = await Conversation.findAll({
      where,
      order: [['updated_at', 'DESC']],
      include: [{ model: Message, as: 'messages', limit: 1, order: [['created_at','DESC']] }]
    });
    return res.json(convs);
  } catch (err) {
    console.error('listConversations', err);
    return res.status(500).json({ message: 'Server error listing conversations' });
  }
}

async function getConversation(req, res) {
  try {
    const { id } = req.params;
    const conv = await Conversation.findByPk(id, {
      include: [{ model: Message, as: 'messages', order: [['created_at','ASC']] }],
    });
    if (!conv) return res.status(404).json({ message: 'Conversation not found' });
    return res.json(conv);
  } catch (err) {
    console.error('getConversation', err);
    return res.status(500).json({ message: 'Server error fetching conversation' });
  }
}

/**
 * Add a message. body: { direction: 'user'|'bot'|'system', text: '...', meta: {...} }
 */
async function addMessage(req, res) {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params; // conversation id
    const { direction = 'user', text, meta } = req.body || {};
    if (!text || !text.trim()) {
      await t.rollback();
      return res.status(400).json({ message: 'Text is required' });
    }

    const conv = await Conversation.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!conv) {
      await t.rollback();
      return res.status(404).json({ message: 'Conversation not found' });
    }

    const created = await Message.create({
      conversation_id: conv.id,
      direction,
      text,
      meta: meta || null,
      user_id: req.user && req.user.id ? req.user.id : null
    }, { transaction: t });

    await conv.update({ updated_at: new Date() }, { transaction: t });

    // If user message, produce bot reply
    let botMessage = null;
    if (direction === 'user') {
      const botResult = getResponse(text, { fallbackThreshold: 0.25 });
      const replyText = botResult.response || "Sorry, I didn't understand that.";

      botMessage = await Message.create({
        conversation_id: conv.id,
        direction: 'bot',
        text: replyText,
        meta: { intent: botResult.tag, score: botResult.score },
        user_id: null
      }, { transaction: t });

      await conv.update({ updated_at: new Date() }, { transaction: t });
    }

    await t.commit();

    return res.status(201).json({ message: created, bot: botMessage });
  } catch (err) {
    await t.rollback();
    console.error('addMessage error', err);
    return res.status(500).json({ message: 'Server error adding message', error: err.message });
  }
}

async function deleteConversation(req, res) {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const conv = await Conversation.findByPk(id);
    if (!conv) {
      await t.rollback();
      return res.status(404).json({ message: 'Conversation not found' });
    }
    await conv.destroy({ transaction: t });
    await t.commit();
    return res.json({ success: true });
  } catch (err) {
    await t.rollback();
    console.error('deleteConversation error', err);
    return res.status(500).json({ message: 'Server error deleting conversation' });
  }
}

module.exports = {
  createConversation,
  listConversations,
  getConversation,
  addMessage,
  deleteConversation
};
