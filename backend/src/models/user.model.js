// src/models/user.model.js
module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true
    },

    // Public display username (keep short)
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: { len: [2, 100] }
    },

    // Normalized lowercase username used for uniqueness checks
    // Make it nullable and remove unique here — add unique later by migration.
    username_normalized: {
      type: DataTypes.STRING(100),
      allowNull: true,    // <- allowNull true to avoid ALTER failing on existing rows
      unique: false       // <- remove unique: true for now
    },

    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: { isEmail: true }
    },

    password: {
      type: DataTypes.STRING,
      allowNull: true
    },

    is_registered: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },

    last_login_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'users',
    underscored: true,
    timestamps: true,
    indexes: [
      // remove the explicit unique index here; add via migration when safe
      // { unique: true, fields: ['username_normalized'] }
    ]
  });

  // Hook: keep username_normalized in sync with name
  User.addHook('beforeValidate', (user) => {
    if (user.name != null) {
      const trimmed = String(user.name).trim();
      if (trimmed.length > 0) {
        user.name = trimmed;
        user.username_normalized = trimmed.toLowerCase();
      }
    }
  });

  User.prototype.getPublicProfile = function () {
    return {
      id: this.id,
      name: this.name,
      email: this.email,
      is_registered: this.is_registered
    };
  };

  return User;
};
