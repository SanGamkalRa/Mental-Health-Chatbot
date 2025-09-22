// src/models/index.js
'use strict';

const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');

const basename = path.basename(__filename);
const env = process.env.NODE_ENV || 'development';

// Helper to try multiple config locations and return an object for the current env (or null)
function loadConfig() {
  const tryPaths = [
    path.join(__dirname, '..', 'config', 'config.js'),
    path.join(__dirname, '..', '..', 'config', 'config.js'),
    path.join(__dirname, '..', '..', 'db.config.js'),
    path.join(__dirname, '..', 'config.js'),
    path.join(__dirname, '..', '..', 'config.js'),
  ];

  for (const p of tryPaths) {
    try {
      // require may export either { development: {...}, production: {...} } or a plain object
      const mod = require(p);
      if (mod && typeof mod === 'object') {
        if (mod[env]) return mod[env];
        // If the file exports config directly (not keyed by env), return it
        return mod;
      }
    } catch (e) {
      // ignore and continue
    }
  }
  return null;
}

let config = loadConfig();

// DEBUG: show raw loaded config and which file was found
// (modify loadConfig to console.warn when it successfully requires a file if you want file path.
// For now we print the object so we can tell what keys exist)
console.warn('Raw DB config loaded (keys):', config ? Object.keys(config) : config);
console.warn('Raw DB config (preview):', JSON.stringify(config && (Object.keys(config).length > 0 ? config : {}), null, 2).slice(0, 1000));

// Normalize old/legacy config shapes (e.g. { HOST, USER, PASSWORD, DB })
function normalizeLoadedConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return cfg;

  // If the loader returned an environment-keyed object (e.g. { development: { ... } }),
  // we assume that case was already handled in loadConfig() which returns the env object.
  // Detect legacy keys and map them to Sequelize's expected names.
  const legacy = !!(cfg.USER || cfg.HOST || cfg.DB || cfg.PASSWORD || cfg.DATABASE);
  if (!legacy) return cfg;

  return {
    username: cfg.USER || cfg.USERNAME || cfg.username || cfg.user,
    password: cfg.PASSWORD || cfg.PASS || cfg.password,
    database: cfg.DB || cfg.DATABASE || cfg.database || cfg.name,
    host: cfg.HOST || cfg.HOSTNAME || cfg.host || '127.0.0.1',
    port: cfg.PORT || cfg.port || 3306,
    dialect: cfg.DIALECT || cfg.dialect || 'mysql',
    logging: cfg.logging === true || cfg.LOGGING === true ? true : false,
    pool: cfg.pool || undefined,
    dialectOptions: cfg.dialectOptions || undefined
  };
}

config = normalizeLoadedConfig(config);
console.warn('Normalized DB config (keys):', config ? Object.keys(config) : config);

// create sequelize instance: support both URL-style and separate config fields
let sequelize;
if (config.use_env_variable && process.env[config.use_env_variable]) {
  sequelize = new Sequelize(process.env[config.use_env_variable], config);
} else {
  // ensure we pass dialect explicitly in options
  const sequelizeOpts = {
    host: config.host,
    port: config.port,
    dialect: config.dialect,
    logging: config.logging === true ? console.log : (config.logging || false),
    pool: config.pool || undefined,
    dialectOptions: config.dialectOptions || undefined,
  };

  sequelize = new Sequelize(config.database, config.username, config.password, sequelizeOpts);
}

const db = {};

// load model files that end with .model.js or .js (exclude this index.js)
fs.readdirSync(__dirname)
  .filter(file => {
    return (
      file.indexOf('.') !== 0 &&
      file !== basename &&
      (file.endsWith('.model.js') || (file !== basename && file.endsWith('.js')))
    );
  })
  .forEach(file => {
    try {
      const modelPath = path.join(__dirname, file);
      const model = require(modelPath)(sequelize, Sequelize.DataTypes);
      if (!model || !model.name) {
        console.warn(`Model file ${file} did not return a named model.`);
      } else {
        db[model.name] = model;
      }
    } catch (err) {
      console.error(`Failed loading model file ${file}:`, err && err.stack ? err.stack : err);
    }
  });

// run associate hooks if present
Object.keys(db).forEach(modelName => {
  if (db[modelName] && typeof db[modelName].associate === 'function') {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
