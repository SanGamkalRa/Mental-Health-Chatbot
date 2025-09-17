// src/routes/auth.routes.js
const express = require('express');
const router = express.Router();
const authCtrl = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth.middleware');

// Ensure functions exist before using them
if (!authCtrl || typeof authCtrl.register !== 'function' || typeof authCtrl.login !== 'function') {
  throw new Error('auth.controller.js must export register and login functions');
}

router.post('/register', authCtrl.register);
router.post('/login', authCtrl.login);

// Protected endpoints
router.post('/logout', requireAuth, authCtrl.logout);      // POST /api/auth/logout
router.patch('/update', requireAuth, authCtrl.update);    // PATCH /api/auth/update


module.exports = router;
