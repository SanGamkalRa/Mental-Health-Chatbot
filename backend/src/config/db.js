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

// models
const User = require('../models/user.model')(sequelize, DataTypes);
const Message = require('../models/message.model')(sequelize, DataTypes);
const Mood = require('../models/mood.model')(sequelize, DataTypes);

// relations
User.hasMany(Message, { foreignKey: 'userId' });
Message.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(Mood, { foreignKey: 'userId' });
Mood.belongsTo(User, { foreignKey: 'userId' });

module.exports = {
  sequelize,
  Sequelize,
  User,
  Message,
  Mood,
  init: async () => {
    try {
      await sequelize.authenticate();
      console.log('MySQL connected.');
      await sequelize.sync({ alter: true }); // for dev; change to { force: false } in prod
      console.log('Models synchronized.');
    } catch (err) {
      console.error('DB init error:', err);
      process.exit(1);
    }
  }
};
