// src/models/message.model.js
module.exports = (sequelize, DataTypes) => {
  const Message = sequelize.define('Message', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    direction: { type: DataTypes.ENUM('user','bot'), allowNull: false },
    text: { type: DataTypes.TEXT, allowNull: false },
    meta: { type: DataTypes.JSON }
  }, {
    timestamps: true,
    tableName: 'messages'
  });
  return Message;
};
