// const { User } = require('../config/db');

// async function getAllUsers(req, res) {
//   try {
//     const users = await User.findAll({
//       attributes: ['id', 'name', 'email', 'is_registered', 'last_login_at']
//     });
//     return res.json(users);
//   } catch (err) {
//     console.error('GET USERS ERROR:', err);
//     return res.status(500).json({ message: 'Error fetching users' });
//   }
// }

// module.exports = { getAllUsers };

// src/controllers/user.controller.js
const { ddbDocClient } = require('../lib/dynamoClient');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

const USERS_TABLE = process.env.USERS_TABLE || 'Users';

/**
 * GET /api/users
 * Return all users (for testing/admin use)
 */
// src/controllers/user.controller.js (getAllUsers)
async function getAllUsers(req, res) {
  try {
    const out = await ddbDocClient.send(new ScanCommand({
      TableName: USERS_TABLE,
      // only items where the email attribute exists and is not null
      FilterExpression: 'attribute_exists(email)'
    }));
    const items = (out.Items || []).map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      is_registered: u.is_registered || false,
      last_login_at: u.last_login_at || null,
    }));
    return res.json(items);
  } catch (err) {
    console.error('getAllUsers (dynamo) error', err);
    return res.status(500).json({ message: 'Error fetching users' });
  }
}


/**
 * GET /api/auth/check-name?name=<normalized>
 * Count how many users share a normalized username
 */
async function checkName(req, res) {
  try {
    const name = (req.query.name || '').trim();
    if (!name) return res.json({ count: 0 });

    const out = await ddbDocClient.send(
      new ScanCommand({
        TableName: USERS_TABLE,
        FilterExpression: 'username_normalized = :u',
        ExpressionAttributeValues: { ':u': name },
        Select: 'COUNT',
      })
    );

    return res.json({ count: out.Count || 0 });
  } catch (err) {
    console.error('checkName (dynamo) error', err);
    return res.status(500).json({ message: 'Could not check username' });
  }
}

module.exports = { getAllUsers, checkName };


  