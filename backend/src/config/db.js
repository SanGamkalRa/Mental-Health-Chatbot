// src/config/db.js
// Supports two modes:
// - DB_TYPE=dynamo -> skip Sequelize init and export a minimal stub
// - otherwise     -> run Sequelize init (MySQL) and export models + init()

const DB_TYPE = (process.env.DB_TYPE || 'mysql').toLowerCase();

if (DB_TYPE === 'dynamo') {
  console.log('DB_TYPE=dynamo — skipping Sequelize init');
  module.exports = {
    DB_TYPE,
    sequelize: null,
    Sequelize: null,
    User: null,
    Message: null,
    Mood: null,
    WellnessTip: null,
    Conversation: null,
    // init is a no-op in dynamo mode so callers can still await it
    init: async (opts = {}) => {
      return;
    }
  };
  return;
}

// === SQL mode (Sequelize) ===
// Only reached when DB_TYPE !== 'dynamo'
const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

let config;
try {
  // try to reuse user's db.config.js if present
  config = require(path.resolve(__dirname, '../../db.config.js'));
} catch (err) {
  config = {};
}

const host = process.env.DB_HOST || config.HOST || '127.0.0.1';
const user = process.env.DB_USER || config.USER || 'root';
const password = process.env.DB_PASS || config.PASSWORD || '';
const database = process.env.DB_NAME || config.DB || 'booksdb';
const port = process.env.DB_PORT || 3306;

const sequelize = new Sequelize(database, user, password, {
  host,
  port,
  dialect: 'mysql',
  logging: false
});

// load models (ensure filenames below match your src/models/ files)
const User = require('../models/user.model')(sequelize, DataTypes);
const Message = require('../models/message.model')(sequelize, DataTypes);
const Mood = require('../models/mood.model')(sequelize, DataTypes);
const WellnessTip = require('../models/wellnessTip.model')(sequelize, DataTypes);

// Conversation model (if present)
let Conversation = null;
try {
  Conversation = require('../models/conversation.model')(sequelize, DataTypes);
} catch (e) {
  // If conversation model missing, keep it null but don't crash startup
  console.warn('Conversation model not found or failed to load:', e.message || e);
}

// === Associations ===
// NOTE: models use underscored: true, so DB columns are `user_id`, `conversation_id`, etc.

try {
  // User <-> Message
  if (User && Message) {
    User.hasMany(Message, { foreignKey: 'user_id', as: 'messages' });
    Message.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
  }

  // Conversation <-> Message
  if (Conversation && Message) {
    Conversation.hasMany(Message, { foreignKey: 'conversation_id', as: 'messages', onDelete: 'CASCADE' });
    Message.belongsTo(Conversation, { foreignKey: 'conversation_id', as: 'conversation' });
  }

  // Conversation <-> User (optional owner)
  if (Conversation && User) {
    Conversation.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
    User.hasMany(Conversation, { foreignKey: 'user_id', as: 'conversations' });
  }

  // User <-> Mood
  if (User && Mood) {
    User.hasMany(Mood, { foreignKey: 'user_id', as: 'moods' });
    Mood.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
  }
} catch (assocErr) {
  console.warn('Error setting up Sequelize associations:', assocErr && (assocErr.message || assocErr));
}

module.exports = {
  sequelize,
  Sequelize,
  User,
  Message,
  Mood,
  WellnessTip,
  Conversation,
  /**
   * Initialize DB (auth + sync). By default uses alter: true for dev.
   * In production prefer migrations and set opts.alter = false
   */
  init: async (opts = { alter: true }) => {
    try {
      await sequelize.authenticate();
      console.log('MySQL connected.');

      // use alter only in dev; override by calling init({ alter:false }) or run migrations in production
      const syncOpts = {};
      if (opts.alter) syncOpts.alter = true;
      if (opts.force) syncOpts.force = true;

      await sequelize.sync(syncOpts);
      console.log('Models synchronized.');
    } catch (err) {
      console.error('DB init error:', err);
      throw err;
    }
  }
};
