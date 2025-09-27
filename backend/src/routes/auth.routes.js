// src/routes/auth.routes.js
const express = require('express');
const router = express.Router();

const authCtrl = require('../controllers/auth.controller'); // use dynamo controller
const { requireAuth } = require('../middleware/auth.middleware');
const { ddbDocClient } = require('../lib/dynamoClient');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

const USERS_TABLE = process.env.USERS_TABLE || 'Users';

// sanity check to ensure controller has expected functions
if (!authCtrl || typeof authCtrl.register !== 'function' || typeof authCtrl.login !== 'function') {
  throw new Error('auth.dynamo.controller.js must export register and login functions');
}

/**
 * Public routes
 */
router.post('/register', authCtrl.register);   // POST /api/auth/register
router.post('/login', authCtrl.login);         // POST /api/auth/login

/**
 * Extra public route for frontend username ambiguity checks
 * GET /api/auth/check-name?name=<normalized>
 * Returns { count: N }
 */
router.get('/check-name', async (req, res) => {
  try {
    const name = (req.query.name || '').trim();
    if (!name) return res.json({ count: 0 });

    const params = {
      TableName: USERS_TABLE,
      FilterExpression: 'username_normalized = :u',
      ExpressionAttributeValues: { ':u': name },
      Select: 'COUNT'
    };

    const out = await ddbDocClient.send(new ScanCommand(params));
    return res.json({ count: out.Count || 0 });
  } catch (err) {
    console.error('check-name (dynamo) error:', err);
    return res.status(500).json({ message: 'Could not check username' });
  }
});

/**
 * Protected routes (require valid JWT)
 */
router.post('/logout', requireAuth, authCtrl.logout);   // POST /api/auth/logout
router.patch('/update', requireAuth, authCtrl.update); // PATCH /api/auth/update

module.exports = router;
