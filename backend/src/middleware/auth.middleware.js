const jwt = require('jsonwebtoken');
const { ddbDocClient } = require('../lib/dynamoClient');
const { GetCommand } = require('@aws-sdk/lib-dynamodb');
const USERS_TABLE = process.env.USERS_TABLE || 'Users';
// If you also have Sequelize User model, import it conditionally:
let User;
try { User = require('../models').User; } catch (e) { User = null; }

async function getUserByIdDynamo(id) {
  if (!id) return null;
  const key = { id: String(id) }; // ensure string key
  try {
    const out = await ddbDocClient.send(new GetCommand({ TableName: USERS_TABLE, Key: key }));
    return out.Item || null;
  } catch (err) {
    console.error('[getUserByIdDynamo] GetCommand error', err);
    throw err;
  }
}

async function requireAuth(req, res, next) {
  console.log('=== requireAuth debug ===');
  console.log('[requireAuth] incoming headers.authorization =', req.headers.authorization);
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    console.log('[requireAuth] token present?', !!token, token);
    if (!token) return res.status(401).json({ message: 'No token' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    console.log('[requireAuth] jwt.verify OK payload =', payload);

    // prefer Dynamo when DB_TYPE=dynamo
    if (process.env.DB_TYPE === 'dynamo') {
      const candidateId = payload.id;
      console.log('[requireAuth] candidateId =', candidateId, 'type=', typeof candidateId);
      const userItem = await getUserByIdDynamo(candidateId);
      console.log('[requireAuth] getUserByIdDynamo =>', !!userItem, userItem && { id: userItem.id, email: userItem.email });
      if (!userItem) {
        console.warn('[requireAuth] User not found for id:', candidateId);
        return res.status(401).json({ message: 'User not found' });
      }
      // normalize user to shape expected by handlers
      req.user = {
        id: String(userItem.id),
        name: userItem.name || userItem.username || null,
        email: userItem.email || null
      };
      return next();
    }

    // fallback to Sequelize if present
    if (User) {
      const user = await User.findByPk(payload.id);
      if (!user) {
        console.warn('[requireAuth] User.findByPk returned no user for id:', payload.id);
        return res.status(401).json({ message: 'User not found' });
      }
      req.user = user;
      return next();
    }

    // if no DB info, fail safe
    return res.status(401).json({ message: 'Unauthorized - no DB handler available' });
  } catch (err) {
    console.error('requireAuth error', err && err.message);
    return res.status(401).json({ message: 'Unauthorized', error: err && err.message });
  }
}

module.exports = { requireAuth, getUserByIdDynamo };
