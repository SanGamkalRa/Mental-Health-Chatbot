// src/models/wellnessTip.model.js
module.exports = (sequelize, DataTypes) => {
  const WellnessTip = sequelize.define('WellnessTip', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true
    },
    tip: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    category: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    source: {
      type: DataTypes.STRING(255),
      allowNull: true
    }
  }, {
    tableName: 'wellness_tips',
    underscored: true,
    timestamps: true
  });

  return WellnessTip;
};
