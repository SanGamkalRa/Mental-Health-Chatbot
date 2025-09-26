// // backend/src/controllers/chat.controller.js
// const { Conversation, Message, User, sequelize } = require('../config/db');
// const { getResponse } = require('../services/intentMatcher'); // server matcher

// async function createConversation(req, res) {
//   const t = await sequelize.transaction();
//   try {
//     const userId = req.user && req.user.id ? req.user.id : null;
//     const { title } = req.body || {};

//     const conv = await Conversation.create({
//       title: title || 'New conversation',
//       user_id: userId
//     }, { transaction: t });

//     const welcomeText = "👋 Hi! I’m your Mental Health Companion. How are you feeling today?";
//     await Message.create({
//       conversation_id: conv.id,
//       direction: 'bot',
//       text: welcomeText,
//       user_id: null
//     }, { transaction: t });

//     await t.commit();

//     const withMessages = await Conversation.findByPk(conv.id, {
//       include: [{ model: Message, as: 'messages', order: [['created_at','ASC']] }]
//     });
//     return res.status(201).json(withMessages);
//   } catch (err) {
//     await t.rollback();
//     console.error('createConversation error', err);
//     return res.status(500).json({ message: 'Server error creating conversation', error: err.message });
//   }
// }

// async function listConversations(req, res) {
//   try {
//     const userId = req.user && req.user.id ? req.user.id : null;
//     const where = userId ? { user_id: userId } : {};
//     const convs = await Conversation.findAll({
//       where,
//       order: [['updated_at', 'DESC']],
//       include: [{ model: Message, as: 'messages', limit: 1, order: [['created_at','DESC']] }]
//     });
//     return res.json(convs);
//   } catch (err) {
//     console.error('listConversations', err);
//     return res.status(500).json({ message: 'Server error listing conversations' });
//   }
// }

// async function getConversation(req, res) {
//   try {
//     const { id } = req.params;
//     const conv = await Conversation.findByPk(id, {
//       include: [{ model: Message, as: 'messages', order: [['created_at','ASC']] }],
//     });
//     if (!conv) return res.status(404).json({ message: 'Conversation not found' });
//     return res.json(conv);
//   } catch (err) {
//     console.error('getConversation', err);
//     return res.status(500).json({ message: 'Server error fetching conversation' });
//   }
// }

// /**
//  * Add a message. body: { direction: 'user'|'bot'|'system', text: '...', meta: {...} }
//  */
// async function addMessage(req, res) {
//   const t = await sequelize.transaction();
//   try {
//     const { id } = req.params; // conversation id
//     const { direction = 'user', text, meta } = req.body || {};
//     if (!text || !text.trim()) {
//       await t.rollback();
//       return res.status(400).json({ message: 'Text is required' });
//     }

//     const conv = await Conversation.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
//     if (!conv) {
//       await t.rollback();
//       return res.status(404).json({ message: 'Conversation not found' });
//     }

//     const created = await Message.create({
//       conversation_id: conv.id,
//       direction,
//       text,
//       meta: meta || null,
//       user_id: req.user && req.user.id ? req.user.id : null
//     }, { transaction: t });

//     await conv.update({ updated_at: new Date() }, { transaction: t });

//     // If user message, produce bot reply
//     let botMessage = null;
//     if (direction === 'user') {
//       const botResult = getResponse(text, { fallbackThreshold: 0.25 });
//       const replyText = botResult.response || "Sorry, I didn't understand that.";

//       botMessage = await Message.create({
//         conversation_id: conv.id,
//         direction: 'bot',
//         text: replyText,
//         meta: { intent: botResult.tag, score: botResult.score },
//         user_id: null
//       }, { transaction: t });

//       await conv.update({ updated_at: new Date() }, { transaction: t });
//     }

//     await t.commit();

//     return res.status(201).json({ message: created, bot: botMessage });
//   } catch (err) {
//     await t.rollback();
//     console.error('addMessage error', err);
//     return res.status(500).json({ message: 'Server error adding message', error: err.message });
//   }
// }

// async function deleteConversation(req, res) {
//   const t = await sequelize.transaction();
//   try {
//     const { id } = req.params;
//     const conv = await Conversation.findByPk(id);
//     if (!conv) {
//       await t.rollback();
//       return res.status(404).json({ message: 'Conversation not found' });
//     }
//     await conv.destroy({ transaction: t });
//     await t.commit();
//     return res.json({ success: true });
//   } catch (err) {
//     await t.rollback();
//     console.error('deleteConversation error', err);
//     return res.status(500).json({ message: 'Server error deleting conversation' });
//   }
// }

// module.exports = {
//   createConversation,
//   listConversations,
//   getConversation,
//   addMessage,
//   deleteConversation
// };
// src/controllers/chat.controller.js

// src/controllers/chat.controller.js
const { ddbDocClient } = require('../lib/dynamoClient');
const {
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  BatchWriteCommand,
  DeleteCommand,
  ScanCommand
} = require('@aws-sdk/lib-dynamodb');
const { getResponse } = require('../services/intentMatcher');

const CONVERSATIONS_TABLE = process.env.CONVERSATIONS_TABLE || 'Conversations';
const MESSAGES_TABLE = process.env.MESSAGES_TABLE || 'Messages';

// helper to isoify a numeric ts
function toISO(ts) {
  if (!ts) return null;
  return new Date(Number(ts)).toISOString();
}

async function createConversation(req, res) {
  try {
    const userId = req.user && req.user.id ? String(req.user.id) : null;
    const { title } = req.body || {};
    const now = Date.now();
    const id = String(now); // simple unique id based on timestamp

    // create conversation item
    await ddbDocClient.send(new PutCommand({
      TableName: CONVERSATIONS_TABLE,
      Item: {
        id,
        title: title || 'New conversation',
        user_id: userId,
        created_at: new Date(now).toISOString(), // ISO for display
        updated_at: now, // numeric for sorting
        lastMessage: null
      }
    }));

    // welcome bot message
    const welcomeText = "👋 Hi! I’m your Mental Health Companion. How are you feeling today?";
    const msg = {
      conversationId: id,
      createdAt: now,
      messageId: `msg-${now}`,
      direction: 'bot',
      text: welcomeText,
      userId: null,
      meta: null,
      created_at: new Date(now).toISOString()
    };

    await ddbDocClient.send(new PutCommand({
      TableName: MESSAGES_TABLE,
      Item: {
        conversationId: msg.conversationId,
        createdAt: msg.createdAt, // numeric sort key
        messageId: msg.messageId,
        direction: msg.direction,
        text: msg.text,
        userId: msg.userId,
        meta: msg.meta,
        created_at: msg.created_at
      }
    }));

    // update conversation lastMessage & updated_at
    await ddbDocClient.send(new UpdateCommand({
      TableName: CONVERSATIONS_TABLE,
      Key: { id },
      UpdateExpression: "SET lastMessage = :lm, updated_at = :u",
      ExpressionAttributeValues: { ":lm": welcomeText, ":u": now }
    }));

    // return shape similar to old Sequelize response: conversation with messages[]
    const convResponse = {
      id,
      title: title || 'New conversation',
      user_id: userId,
      created_at: new Date(now).toISOString(),
      updated_at: new Date(now).toISOString(),
      messages: [ { id: msg.messageId, direction: msg.direction, text: msg.text, meta: null, created_at: msg.created_at } ]
    };

    return res.status(201).json(convResponse);
  } catch (err) {
    console.error('createConversation (dynamo) error', err);
    return res.status(500).json({ message: 'Server error creating conversation', error: err.message });
  }
}

async function listConversations(req, res) {
  try {
    const userId = req.user && req.user.id ? String(req.user.id) : null;

    if (userId) {
      // Query the Conversations GSI by user_id (ConversationsByUser) if present
      const params = {
        TableName: CONVERSATIONS_TABLE,
        IndexName: "ConversationsByUser",
        KeyConditionExpression: "user_id = :uid",
        ExpressionAttributeValues: { ":uid": userId },
        ScanIndexForward: false // newest first by updated_at (assuming updated_at is sort key)
      };

      try {
        const out = await ddbDocClient.send(new QueryCommand(params));
        const items = (out.Items || []).map(it => ({
          id: it.id,
          title: it.title,
          user_id: it.user_id,
          created_at: it.created_at,
          updated_at: toISO(it.updated_at),
          lastMessage: it.lastMessage || null
        }));
        return res.json(items);
      } catch (err) {
        // If GSI not present or Query fails, fallback to Scan and filter
        console.warn('listConversations: Query on ConversationsByUser failed, falling back to Scan.', err && err.message);
      }
    }

    // no user filter or Query fallback -> full scan (small project ok)
    const scanResp = await ddbDocClient.send(new ScanCommand({ TableName: CONVERSATIONS_TABLE }));
    const items = (scanResp.Items || []).map(it => ({
      id: it.id,
      title: it.title,
      user_id: it.user_id,
      created_at: it.created_at,
      updated_at: toISO(it.updated_at),
      lastMessage: it.lastMessage || null
    }));
    return res.json(items);
  } catch (err) {
    console.error('listConversations (dynamo) error', err);
    return res.status(500).json({ message: 'Server error listing conversations' });
  }
}

async function getConversation(req, res) {
  try {
    const id = req.params.id;
    // get conversation item
    const conv = await ddbDocClient.send(new GetCommand({ TableName: CONVERSATIONS_TABLE, Key: { id } }));
    if (!conv.Item) return res.status(404).json({ message: 'Conversation not found' });

    // get messages (oldest->newest) - assumes MESSAGES_TABLE PK: conversationId, SK: createdAt (number)
    const msgResp = await ddbDocClient.send(new QueryCommand({
      TableName: MESSAGES_TABLE,
      KeyConditionExpression: "conversationId = :cid",
      ExpressionAttributeValues: { ":cid": id },
      ScanIndexForward: true
    }));

    const messages = (msgResp.Items || []).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).map(m => ({
      id: m.messageId,
      direction: m.direction,
      text: m.text,
      meta: m.meta || null,
      user_id: m.userId || null,
      created_at: m.created_at || new Date(Number(m.createdAt)).toISOString()
    }));

    const out = {
      id: conv.Item.id,
      title: conv.Item.title,
      user_id: conv.Item.user_id || null,
      created_at: conv.Item.created_at,
      updated_at: toISO(conv.Item.updated_at),
      messages
    };

    return res.json(out);
  } catch (err) {
    console.error('getConversation (dynamo) error', err);
    return res.status(500).json({ message: 'Server error fetching conversation' });
  }
}

async function addMessage(req, res) {
  try {
    const id = req.params.id; // conversation id
    const { direction = 'user', text, meta } = req.body || {};
    if (!text || !text.trim()) return res.status(400).json({ message: 'Text is required' });

    // ensure conversation exists
    const conv = await ddbDocClient.send(new GetCommand({ TableName: CONVERSATIONS_TABLE, Key: { id } }));
    if (!conv.Item) return res.status(404).json({ message: 'Conversation not found' });

    const now = Date.now();
    const messageId = `msg-${now}-${Math.random().toString(36).slice(2,6)}`;

    const messageItem = {
      conversationId: id,
      createdAt: now, // numeric sort key
      messageId,
      direction,
      text,
      meta: meta || null,
      userId: req.user && req.user.id ? String(req.user.id) : null,
      created_at: new Date(now).toISOString()
    };

    // write user message
    await ddbDocClient.send(new PutCommand({
      TableName: MESSAGES_TABLE,
      Item: messageItem
    }));

    // update conversation lastMessage + updated_at
    await ddbDocClient.send(new UpdateCommand({
      TableName: CONVERSATIONS_TABLE,
      Key: { id },
      UpdateExpression: "SET lastMessage = :lm, updated_at = :u",
      ExpressionAttributeValues: { ":lm": text, ":u": now }
    }));

    // if user message, produce bot reply via intent matcher
    let botMessage = null;
    if (direction === 'user') {
      const botResult = getResponse(text, { fallbackThreshold: 0.25 });
      const replyText = botResult.response || "Sorry, I didn't understand that.";

      const botNow = Date.now();
      const botMsgId = `msg-${botNow}-${Math.random().toString(36).slice(2,6)}`;
      const botItem = {
        conversationId: id,
        createdAt: botNow,
        messageId: botMsgId,
        direction: 'bot',
        text: replyText,
        meta: { intent: botResult.tag, score: botResult.score },
        userId: null,
        created_at: new Date(botNow).toISOString()
      };

      await ddbDocClient.send(new PutCommand({
        TableName: MESSAGES_TABLE,
        Item: botItem
      }));

      // update conversation lastMessage again
      await ddbDocClient.send(new UpdateCommand({
        TableName: CONVERSATIONS_TABLE,
        Key: { id },
        UpdateExpression: "SET lastMessage = :lm, updated_at = :u",
        ExpressionAttributeValues: { ":lm": replyText, ":u": botItem.createdAt }
      }));

      botMessage = {
        id: botItem.messageId,
        direction: 'bot',
        text: botItem.text,
        meta: botItem.meta,
        created_at: botItem.created_at
      };
    }

    return res.status(201).json({
      message: {
        id: messageItem.messageId,
        direction: messageItem.direction,
        text: messageItem.text,
        meta: messageItem.meta,
        created_at: messageItem.created_at,
        user_id: messageItem.userId
      },
      bot: botMessage
    });

  } catch (err) {
    console.error('addMessage (dynamo) error', err);
    return res.status(500).json({ message: 'Server error adding message', error: err.message });
  }
}

async function deleteConversation(req, res) {
  try {
    const id = req.params.id;
    // get messages for conversation
    const msgs = await ddbDocClient.send(new QueryCommand({
      TableName: MESSAGES_TABLE,
      KeyConditionExpression: "conversationId = :cid",
      ExpressionAttributeValues: { ":cid": id },
    }));

    const items = msgs.Items || [];
    const BATCH = 25;
    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH);
      const reqs = batch.map(m => ({ DeleteRequest: { Key: { conversationId: m.conversationId, createdAt: m.createdAt } } }));
      await ddbDocClient.send(new BatchWriteCommand({ RequestItems: { [MESSAGES_TABLE]: reqs } }));
    }

    // delete conversation item
    await ddbDocClient.send(new DeleteCommand({
      TableName: CONVERSATIONS_TABLE,
      Key: { id }
    }));

    return res.json({ ok: true });
  } catch (err) {
    console.error('deleteConversation (dynamo) error', err);
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
