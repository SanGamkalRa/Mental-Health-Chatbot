// src/models/conversation.model.js
module.exports = (sequelize, DataTypes) => {
  const Conversation = sequelize.define('Conversation', {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: false,
      defaultValue: 'New conversation',
    },
    // optional owner
    user_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    }
  }, {
    tableName: 'conversations',
    underscored: true,
    timestamps: true,
  });

  Conversation.associate = (models) => {
    Conversation.hasMany(models.Message, { foreignKey: 'conversation_id', as: 'messages', onDelete: 'CASCADE' });
    Conversation.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return Conversation;
};
