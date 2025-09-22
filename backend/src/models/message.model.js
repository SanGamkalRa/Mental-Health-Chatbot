// src/models/message.model.js
module.exports = (sequelize, DataTypes) => {
  const Message = sequelize.define('Message', {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    conversation_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    direction: { type: DataTypes.ENUM('user','bot','system'), allowNull: false, defaultValue: 'user' },
    text: { type: DataTypes.TEXT, allowNull: false },
    meta: { type: DataTypes.JSON, allowNull: true }
  }, {
    tableName: 'messages',
    underscored: true,
    timestamps: true
  });

  Message.associate = (models) => {
    Message.belongsTo(models.Conversation, { foreignKey: 'conversation_id', as: 'conversation' });
    Message.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return Message;
};
