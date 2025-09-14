// src/models/mood.model.js
module.exports = (sequelize, DataTypes) => {
  const Mood = sequelize.define('Mood', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    mood: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    note: { type: DataTypes.TEXT }
  }, {
    timestamps: true,
    tableName: 'moods'
  });
  return Mood;
};
