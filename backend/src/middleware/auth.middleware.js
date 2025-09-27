const jwt = require('jsonwebtoken');
const { ddbDocClient } = require('../lib/dynamoClient');
const { GetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const USERS_TABLE = process.env.USERS_TABLE || 'Users';
const JWT_SECRET = process.env.JWT_SECRET;

async function getUserByIdDynamo(id) {
  if (!id) return null;
  try {
    const key = { id: String(id) };
    const out = await ddbDocClient.send(new GetCommand({ TableName: USERS_TABLE, Key: key }));
    return out.Item || null;
  } catch (err) {
    console.error('[getUserByIdDynamo] GetCommand error', err && err.message);
    throw err;
  }
}

// dev helper (temporary): find by email via Scan (costly — only use for debugging)
async function findUserByEmailDynamo(email) {
  try {
    const params = {
      TableName: USERS_TABLE,
      FilterExpression: '#e = :e',
      ExpressionAttributeNames: { '#e': 'email' },
      ExpressionAttributeValues: { ':e': email }
    };
    const out = await ddbDocClient.send(new ScanCommand(params));
    return (out.Items && out.Items[0]) || null;
  } catch (err) {
    console.error('[findUserByEmailDynamo] Scan error', err && err.message);
    return null;
  }
}

async function requireAuth(req, res, next) {
  console.log('=== requireAuth debug ===');
  console.log('[requireAuth] incoming Authorization =', req.headers.authorization);

  if (!JWT_SECRET) {
    console.error('[requireAuth] MISSING JWT_SECRET in process.env - server misconfigured');
    // 500 indicates server misconfiguration rather than user auth failure
    return res.status(500).json({ message: 'Server misconfigured: JWT secret not set' });
  }

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return res.status(401).json({ message: 'No token' });

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (jwtErr) {
      console.warn('[requireAuth] jwt.verify failed:', jwtErr && jwtErr.message);
      return res.status(401).json({ message: 'Unauthorized', error: jwtErr.message });
    }

    console.log('[requireAuth] jwt verify ok payload=', payload);

    if (process.env.DB_TYPE === 'dynamo') {
      const candidateId = payload.id;
      console.log('[requireAuth] candidateId =', candidateId);

      const userItem = await getUserByIdDynamo(candidateId);
      console.log('[requireAuth] userItem from GetCommand =', !!userItem, userItem && { id: userItem.id, email: userItem.email });

      if (!userItem) {
        // dev fallback: try email scan to see if user exists under different id (temporary)
        const fallback = payload.email ? await findUserByEmailDynamo(payload.email) : null;
        if (fallback) {
          console.warn('[requireAuth] user not found by id but found by email (dev fallback):', fallback.id);
        } else {
          console.warn('[requireAuth] User not found for id:', candidateId);
        }
        return res.status(401).json({ message: 'User not found' });
      }

      req.user = {
        id: String(userItem.id),
        name: userItem.name || userItem.username || null,
        email: userItem.email || null
      };
      return next();
    }

    // fallback: if not using dynamo, try to use Sequelize User model if present
    // (optional - keep your original logic here)
    return res.status(401).json({ message: 'Unauthorized - DB handler not configured' });

  } catch (err) {
    console.error('[requireAuth] unexpected error', err && err.message);
    return res.status(500).json({ message: 'Server error', error: err && err.message });
  }
}

module.exports = { requireAuth };
