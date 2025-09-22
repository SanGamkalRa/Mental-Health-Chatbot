// src/models/mood.model.js
module.exports = (sequelize, DataTypes) => {
  const Mood = sequelize.define('Mood', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      field: 'user_id',
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
 mood: {
  type: DataTypes.STRING,
  allowNull: false
},
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  }, // in your Mood model define options
{
  tableName: 'moods',
  underscored: true,
  indexes: [
    { unique: true, fields: ['user_id', 'date'], name: 'ux_user_date' }
  ]
}
);

  Mood.associate = function(models) {
    if (models.User) {
      Mood.belongsTo(models.User, {
        foreignKey: { name: 'userId', field: 'user_id', allowNull: true },
        as: 'user',
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      });
    }
  };

  return Mood;
};
