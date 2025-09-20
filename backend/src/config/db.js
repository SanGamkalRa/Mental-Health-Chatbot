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

// models (adjust filenames if your models live elsewhere)
const User = require('../models/user.model')(sequelize, DataTypes);
const Message = require('../models/message.model')(sequelize, DataTypes);
const Mood = require('../models/mood.model')(sequelize, DataTypes);
// Fix: import wellness tip model (ensure file is src/models/wellnessTip.model.js)
const WellnessTip = require('../models/wellnessTip.model')(sequelize, DataTypes);

// relations
User.hasMany(Message, { foreignKey: 'userId' });
Message.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(Mood, { foreignKey: 'userId' });
Mood.belongsTo(User, { foreignKey: 'userId' });

// (No direct user relation needed for WellnessTip — tips are global)
module.exports = {
  sequelize,
  Sequelize,
  User,
  Message,
  Mood,
  WellnessTip,
  init: async (opts = { alter: true }) => {
    try {
      await sequelize.authenticate();
      console.log('MySQL connected.');
      // for dev use { alter: true } (safe-ish). Change in production.
      await sequelize.sync({ alter: !!opts.alter });
      console.log('Models synchronized.');
    } catch (err) {
      console.error('DB init error:', err);
      // rethrow so callers (seed script) can handle the error
      throw err;
    }
  }
};
