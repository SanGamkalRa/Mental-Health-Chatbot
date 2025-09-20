// models/Mood.js
module.exports = (sequelize, DataTypes) => {
  const Mood = sequelize.define('Mood', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true }, // <-- ALLOW NULL
    date: { type: DataTypes.DATEONLY, allowNull: false },
    mood: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
    note: { type: DataTypes.TEXT, allowNull: true },
  }, {
    tableName: 'moods',
    timestamps: true,
    indexes: [{ unique: true, fields: ['userId', 'date'], name: 'ux_user_date' }],
  });

  Mood.associate = function(models) {
    if (models.User) {
      Mood.belongsTo(models.User, {
        foreignKey: { name: 'userId', allowNull: true },
        as: 'user',
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      });
    }
  };

  return Mood;
};
