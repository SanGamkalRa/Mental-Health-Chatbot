// src/config/db.js
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

// New: Conversation model
// Create src/models/conversation.model.js as described previously if not already present
const Conversation = require('../models/conversation.model')(sequelize, DataTypes);

// === Associations ===
// NOTE: models use underscored: true, so DB columns are `user_id`, `conversation_id`, etc.
// Use underscored foreignKey names to match model definitions and avoid Sequelize creating extra fields.

// User <-> Message
User.hasMany(Message, { foreignKey: 'user_id', as: 'messages' });
Message.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Conversation <-> Message
Conversation.hasMany(Message, { foreignKey: 'conversation_id', as: 'messages', onDelete: 'CASCADE' });
Message.belongsTo(Conversation, { foreignKey: 'conversation_id', as: 'conversation' });

// Conversation <-> User (optional owner)
Conversation.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(Conversation, { foreignKey: 'user_id', as: 'conversations' });

// User <-> Mood
User.hasMany(Mood, { foreignKey: 'user_id', as: 'moods' });
Mood.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// WellnessTip is global/static; no user relations required (but you can add if needed)

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
