// src/routes/auth.routes.js
const express = require('express');
const router = express.Router();

const authCtrl = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { User } = require('../config/db'); // make sure db.js exports User

// sanity check to fail fast if controller is not wired up correctly
if (
  !authCtrl ||
  typeof authCtrl.register !== 'function' ||
  typeof authCtrl.login !== 'function'
) {
  throw new Error('auth.controller.js must export register and login functions');
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

    const count = await User.count({ where: { username_normalized: name } });
    return res.json({ count });
  } catch (err) {
    console.error('check-name error:', err);
    return res.status(500).json({ message: 'Could not check username' });
  }
});

/**
 * Protected routes (require valid JWT)
 */
router.post('/logout', requireAuth, authCtrl.logout);   // POST /api/auth/logout
router.patch('/update', requireAuth, authCtrl.update); // PATCH /api/auth/update

module.exports = router;
