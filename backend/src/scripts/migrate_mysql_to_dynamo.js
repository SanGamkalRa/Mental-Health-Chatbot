// src/scripts/migrate_mysql_to_dynamo.js
require('dotenv').config();
const mysql = require('mysql2/promise');
const { ddbDocClient } = require('../lib/dynamoClient');
const { BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');

const BATCH = 25;

async function batchWrite(table, items) {
  if (!items.length) return;
  const requests = items.map(it => ({ PutRequest: { Item: it } }));
  const chunks = [];
  for (let i=0;i<requests.length;i+=BATCH) chunks.push(requests.slice(i,i+BATCH));
  for (const c of chunks) {
    await ddbDocClient.send(new BatchWriteCommand({ RequestItems: { [table]: c } }));
  }
}

async function migrate() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || ''
  });

  // USERS
  const [users] = await conn.execute('SELECT id, name, email, is_registered, last_login_at, created_at FROM users');
  const userItems = users.map(u => ({
    id: String(u.id),
    name: u.name,
    email: u.email,
    is_registered: !!u.is_registered,
    last_login_at: u.last_login_at ? new Date(u.last_login_at).toISOString() : null,
    created_at: u.created_at ? new Date(u.created_at).toISOString() : new Date().toISOString()
  }));
  await batchWrite('Users', userItems);

  // CONVERSATIONS
  const [convs] = await conn.execute('SELECT id, title, user_id, created_at, updated_at FROM conversations');
  const convItems = convs.map(c => ({
    id: String(c.id),
    title: c.title,
    user_id: c.user_id ? String(c.user_id) : null,
    created_at: c.created_at ? new Date(c.created_at).toISOString() : new Date().toISOString(),
    updated_at: c.updated_at ? new Date(c.updated_at).getTime() : Date.now(),
    lastMessage: null
  }));
  await batchWrite('Conversations', convItems);

  // MESSAGES
  const [messages] = await conn.execute('SELECT id, conversation_id, user_id, direction, text, meta, created_at FROM messages');
  const msgItems = messages.map(m => ({
    conversationId: String(m.conversation_id),
    createdAt: m.created_at ? new Date(m.created_at).getTime() : Date.now(),
    messageId: String(m.id),
    direction: m.direction,
    text: m.text,
    meta: m.meta ? JSON.parse(JSON.stringify(m.meta)) : null,
    userId: m.user_id ? String(m.user_id) : null,
    created_at: m.created_at ? new Date(m.created_at).toISOString() : new Date().toISOString()
  }));
  await batchWrite('Messages', msgItems);

  // MOODS
  const [moods] = await conn.execute('SELECT id, user_id, date, mood_value, note, created_at FROM moods');
  const moodItems = moods.map(m => ({
    id: String(m.id),
    userId: String(m.user_id),
    timestamp: m.created_at ? new Date(m.created_at).getTime() : Date.now(),
    date: m.date ? m.date.toISOString().slice(0,10) : (m.created_at ? new Date(m.created_at).toISOString().slice(0,10) : new Date().toISOString().slice(0,10)),
    mood: m.mood_value,
    note: m.note || '',
    createdAt: m.created_at ? new Date(m.created_at).toISOString() : new Date().toISOString()
  }));
  await batchWrite('Moods', moodItems);

  console.log('Migration finished');
  await conn.end();
}

migrate().catch(err => { console.error(err); process.exit(1); });
