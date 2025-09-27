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
const crypto = require('crypto');

const CONVERSATIONS_TABLE = process.env.CONVERSATIONS_TABLE || 'Conversations';
const MESSAGES_TABLE = process.env.MESSAGES_TABLE || 'Messages';
const USER_CONVERSATIONS_INDEX = process.env.CONVERSATIONS_BY_USER_INDEX || 'ConversationsByUserId';

// helper to isoify a numeric ts
function toISO(ts) {
  if (!ts && ts !== 0) return null;
  return new Date(Number(ts)).toISOString();
}

/**
 * Create conversation
 */
// add/use existing: const crypto = require('crypto');
// make sure ddbDocClient is imported as before

// Replace existing createConversation with this implementation
// Replace existing createConversation with this implementation
// Replace your current createConversation with this
async function createConversation(req, res) {
  try {
    const userId = req.user && req.user.id ? String(req.user.id) : null;
    const { title } = req.body || {};
    const now = Date.now();

    // ensure id exists and is a string
    const id = (crypto.randomUUID && crypto.randomUUID()) || `conv-${now}-${Math.random().toString(36).slice(2,6)}`;
    if (!id) {
      console.error('[createConversation] failed to generate id');
      return res.status(500).json({ message: 'Server error creating conversation', error: 'Could not generate id' });
    }

    // Build conversation item (DocumentClient style)
    const convItem = {
      id: String(id),
      title: title || 'New conversation',
      user_id: userId || '',
      created_at: new Date(now).toISOString(),
      updated_at: now,
      lastMessage: null
    };

    console.info('[createConversation] convItem prepared:', convItem);

    // Put conversation item
    await ddbDocClient.send(new PutCommand({
      TableName: CONVERSATIONS_TABLE,
      Item: convItem
    }));

    // Create and put welcome message (ensure Messages PK 'id' is provided)
    const welcomeText = "👋 Hi! I’m your Mental Health Companion. How are you feeling today?";
    const botNow = Date.now();
    const botMsgId = `msg-${botNow}-${Math.random().toString(36).slice(2,6)}`;

    const botItem = {
      id: botMsgId,               // Messages table primary key (required)
      conversationId: convItem.id,
      createdAt: botNow,
      created_at: new Date(botNow).toISOString(),
      messageId: botMsgId,
      direction: 'bot',
      text: welcomeText,
      meta: { intent: 'welcome', score: 1 },
      userId: null
    };

    console.info('[createConversation] botItem prepared:', botItem);

    await ddbDocClient.send(new PutCommand({
      TableName: MESSAGES_TABLE,
      Item: botItem
    }));

    // Update conversation lastMessage + updated_at
    try {
      await ddbDocClient.send(new UpdateCommand({
        TableName: CONVERSATIONS_TABLE,
        Key: { id: convItem.id },
        UpdateExpression: "SET lastMessage = :lm, updated_at = :u",
        ExpressionAttributeValues: { ":lm": welcomeText, ":u": botNow }
      }));
    } catch (upErr) {
      console.warn('[createConversation] warning updating conversation lastMessage', upErr && (upErr.message || upErr));
    }

    // Return created conversation (shape front-end expects)
    return res.status(201).json({
      id: convItem.id,
      title: convItem.title,
      created_at: convItem.created_at,
      updated_at: convItem.updated_at,
      messages: [{
        id: botItem.messageId,
        direction: botItem.direction,
        text: botItem.text,
        created_at: botItem.created_at,
        meta: botItem.meta
      }]
    });
  } catch (err) {
    // log full error for debugging
    console.error('createConversation error', err && (err.stack || err.message || err));
    // Provide useful response body
    return res.status(500).json({
      message: 'Server error creating conversation',
      error: err && (err.message || JSON.stringify(err, Object.getOwnPropertyNames(err)))
    });
  }
}






/**
 * List conversations (by user if authenticated)
 */
async function listConversations(req, res) {
  try {
    const userId = req.user && req.user.id ? String(req.user.id) : null;

    if (userId) {
      // Query the Conversations GSI by user_id (ConversationsByUserId)
      const params = {
        TableName: CONVERSATIONS_TABLE,
        IndexName: USER_CONVERSATIONS_INDEX,
        KeyConditionExpression: "user_id = :uid",
        ExpressionAttributeValues: { ":uid": userId },
        // no sort key here in your GSI; if you add updated_at as sort key later, you can set ScanIndexForward:false
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
        console.warn('listConversations: Query on ConversationsByUserId failed, falling back to Scan.', err && err.message);
      }
    }

    // fallback to Scan for small dataset / dev
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
    console.error('listConversations (dynamo) error', err && err.message ? err.message : err);
    return res.status(500).json({ message: 'Server error listing conversations', error: err && err.message });
  }
}

/**
 * Get conversation and its messages (oldest->newest)
 */
// Robust getConversation (replace existing function in src/controllers/chat.controller.js)
async function getConversation(req, res) {
  const id = req.params.id;
  if (!id) return res.status(400).json({ message: 'Conversation id required' });

  try {
    console.info(`[getConversation] id=${id} CONVERSATIONS_TABLE=${CONVERSATIONS_TABLE} MESSAGES_TABLE=${MESSAGES_TABLE}`);

    // Try direct Get (correct when PK is 'id')
    try {
      console.info('[getConversation] attempting GetCommand with Key { id }');
      const convResp = await ddbDocClient.send(new GetCommand({
        TableName: CONVERSATIONS_TABLE,
        Key: { id }
      }));

      if (convResp && convResp.Item) {
        console.info('[getConversation] found conversation via GetCommand', { id });
        const convItem = convResp.Item;

        // Try Query for messages (fast path)
        let msgItems = [];
        try {
          console.info('[getConversation] querying messages by conversationId (QueryCommand)');
          const msgResp = await ddbDocClient.send(new QueryCommand({
            TableName: MESSAGES_TABLE,
            KeyConditionExpression: "conversationId = :cid",
            ExpressionAttributeValues: { ":cid": id },
            ScanIndexForward: true
          }));
          msgItems = msgResp.Items || [];
        } catch (qerr) {
          console.warn('[getConversation] QueryCommand for messages failed, will fallback to Scan. Error:', qerr && (qerr.message || qerr));
          // fallback: small scan for dev
          const scanResp = await ddbDocClient.send(new ScanCommand({
            TableName: MESSAGES_TABLE,
            FilterExpression: "conversationId = :cid",
            ExpressionAttributeValues: { ":cid": id }
          }));
          msgItems = scanResp.Items || [];
        }

        const messages = (msgItems || []).sort((a, b) => (a.createdAt || a.created_at || 0) - (b.createdAt || b.created_at || 0)).map(m => ({
          id: m.messageId || m.id || `${m.createdAt || m.created_at}-${Math.random()}`,
          direction: m.direction,
          text: m.text,
          meta: m.meta || null,
          user_id: m.userId || null,
          created_at: m.created_at || (m.createdAt ? new Date(Number(m.createdAt)).toISOString() : new Date().toISOString())
        }));

        const out = {
          id: convItem.id,
          title: convItem.title,
          user_id: convItem.user_id || null,
          created_at: convItem.created_at,
          updated_at: (typeof convItem.updated_at === 'number') ? new Date(Number(convItem.updated_at)).toISOString() : convItem.updated_at,
          messages
        };

        return res.json(out);
      } else {
        console.warn('[getConversation] GetCommand returned no item for id=', id);
      }
    } catch (getErr) {
      console.warn('[getConversation] GetCommand failed with error:', getErr && (getErr.message || getErr));
      // continue to fallback
    }

    // Fallback: Scan the Conversations table for matching id (DEV ONLY, slow but helpful)
    try {
      console.info('[getConversation] attempting Scan fallback on Conversations table to find id (dev fallback)');
      const scanResp = await ddbDocClient.send(new ScanCommand({
        TableName: CONVERSATIONS_TABLE,
        FilterExpression: "id = :id",
        ExpressionAttributeValues: { ":id": id }
      }));

      if (scanResp.Items && scanResp.Items.length) {
        const convItem = scanResp.Items[0];
        console.info('[getConversation] found conversation via Scan fallback', { id: convItem.id });

        // Try to get messages (Query then Scan fallback)
        let msgItems = [];
        try {
          const msgResp = await ddbDocClient.send(new QueryCommand({
            TableName: MESSAGES_TABLE,
            KeyConditionExpression: "conversationId = :cid",
            ExpressionAttributeValues: { ":cid": id },
            ScanIndexForward: true
          }));
          msgItems = msgResp.Items || [];
        } catch (qerr) {
          console.warn('[getConversation] messages Query fallback after conv Scan failed, performing messages Scan', qerr && (qerr.message || qerr));
          const msgScan = await ddbDocClient.send(new ScanCommand({
            TableName: MESSAGES_TABLE,
            FilterExpression: "conversationId = :cid",
            ExpressionAttributeValues: { ":cid": id }
          }));
          msgItems = msgScan.Items || [];
        }

        const messages = (msgItems || []).sort((a, b) => (a.createdAt || a.created_at || 0) - (b.createdAt || b.created_at || 0)).map(m => ({
          id: m.messageId || m.id || `${m.createdAt || m.created_at}-${Math.random()}`,
          direction: m.direction,
          text: m.text,
          meta: m.meta || null,
          user_id: m.userId || null,
          created_at: m.created_at || (m.createdAt ? new Date(Number(m.createdAt)).toISOString() : new Date().toISOString())
        }));

        const out = {
          id: convItem.id,
          title: convItem.title,
          user_id: convItem.user_id || null,
          created_at: convItem.created_at,
          updated_at: (typeof convItem.updated_at === 'number') ? new Date(Number(convItem.updated_at)).toISOString() : convItem.updated_at,
          messages
        };

        return res.json(out);
      } else {
        console.warn('[getConversation] Scan fallback found nothing for id=', id);
      }
    } catch (scanErr) {
      console.warn('[getConversation] Scan fallback failed:', scanErr && (scanErr.message || scanErr));
    }

    // nothing found
    return res.status(404).json({ message: 'Conversation not found' });
  } catch (err) {
    console.error('getConversation (dynamo) error', err && (err.stack || err.message || err));
    return res.status(500).json({ message: 'Server error fetching conversation', error: err && (err.message || err.toString()) });
  }
}


/**
 * Add message to existing conversation (and produce bot reply)
 */
async function addMessage(req, res) {
  try {
    const id = req.params.id; // conversation id (string)
    const { direction = 'user', text, meta } = req.body || {};
    if (!text || !text.trim()) return res.status(400).json({ message: 'Text is required' });

    console.info('[addMessage] start', { conversationId: id, direction });

    // ensure conversation exists
    let conv;
    try {
      conv = await ddbDocClient.send(new GetCommand({ TableName: CONVERSATIONS_TABLE, Key: { id } }));
      if (!conv || !conv.Item) {
        console.warn('[addMessage] conversation not found via GetCommand, will try Scan fallback');
        const scanResp = await ddbDocClient.send(new ScanCommand({
          TableName: CONVERSATIONS_TABLE,
          FilterExpression: "id = :id",
          ExpressionAttributeValues: { ":id": id }
        }));
        conv = (scanResp.Items && scanResp.Items[0]) ? { Item: scanResp.Items[0] } : null;
      }
    } catch (err) {
      console.warn('[addMessage] GetCommand for Conversations failed, trying Scan fallback. Error:', err && (err.message || err));
      try {
        const scanResp = await ddbDocClient.send(new ScanCommand({
          TableName: CONVERSATIONS_TABLE,
          FilterExpression: "id = :id",
          ExpressionAttributeValues: { ":id": id }
        }));
        conv = (scanResp.Items && scanResp.Items[0]) ? { Item: scanResp.Items[0] } : null;
      } catch (sErr) {
        console.error('[addMessage] conversations Scan fallback failed:', sErr && (sErr.message || sErr));
      }
    }

    if (!conv || !conv.Item) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    const now = Date.now();
    const messageId = `msg-${now}-${Math.random().toString(36).slice(2,6)}`;

    // IMPORTANT: Ensure we include the Messages table's PK attr name `id` (per your table schema)
    // This avoids "Missing the key id in the item" error.
    const messageItem = {
      id: messageId,            // table PK for Messages table
      conversationId: id,       // use for filtering / GSI
      createdAt: now,           // numeric ordering key (if used)
      created_at: new Date(now).toISOString(), // human-readable
      messageId,
      direction,
      text,
      meta: meta || null,
      userId: req.user && req.user.id ? String(req.user.id) : null
    };

    console.info('[addMessage] putting user message', { messageId, conversationId: id });
    await ddbDocClient.send(new PutCommand({
      TableName: MESSAGES_TABLE,
      Item: messageItem
    }));

    // update conversation lastMessage + updated_at
    try {
      await ddbDocClient.send(new UpdateCommand({
        TableName: CONVERSATIONS_TABLE,
        Key: { id },
        UpdateExpression: "SET lastMessage = :lm, updated_at = :u",
        ExpressionAttributeValues: { ":lm": text, ":u": now }
      }));
    } catch (upErr) {
      console.warn('[addMessage] warning: failed to update conversation lastMessage', upErr && (upErr.message || upErr));
    }

    // if user message, produce bot reply via intent matcher
    let botMessage = null;
    if (direction === 'user') {
      const botResult = getResponse(text, { fallbackThreshold: 0.25 });
      const replyText = botResult && botResult.response ? botResult.response : "Sorry, I didn't understand that.";

      const botNow = Date.now();
      const botMsgId = `msg-${botNow}-${Math.random().toString(36).slice(2,6)}`;

      const botItem = {
        id: botMsgId,
        conversationId: id,
        createdAt: botNow,
        created_at: new Date(botNow).toISOString(),
        messageId: botMsgId,
        direction: 'bot',
        text: replyText,
        meta: { intent: botResult && botResult.tag, score: botResult && botResult.score },
        userId: null
      };

      console.info('[addMessage] putting bot reply', { botMsgId, conversationId: id });
      await ddbDocClient.send(new PutCommand({
        TableName: MESSAGES_TABLE,
        Item: botItem
      }));

      // update conversation lastMessage again
      try {
        await ddbDocClient.send(new UpdateCommand({
          TableName: CONVERSATIONS_TABLE,
          Key: { id },
          UpdateExpression: "SET lastMessage = :lm, updated_at = :u",
          ExpressionAttributeValues: { ":lm": replyText, ":u": botNow }
        }));
      } catch (upErr2) {
        console.warn('[addMessage] warning: failed to update conversation after bot reply', upErr2 && (upErr2.message || upErr2));
      }

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
    console.error('addMessage (dynamo) error', err && (err.stack || err.message || err));
    return res.status(500).json({ message: 'Server error adding message', error: err && (err.message || err.toString()) });
  }
}


/**
 * Delete conversation and its messages
 */
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
    console.error('deleteConversation (dynamo) error', err && err.message ? err.message : err);
    return res.status(500).json({ message: 'Server error deleting conversation', error: err && err.message });
  }
}

module.exports = {
  createConversation,
  listConversations,
  getConversation,
  addMessage,
  deleteConversation
};
