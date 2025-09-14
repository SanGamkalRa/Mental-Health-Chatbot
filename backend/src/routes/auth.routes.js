// src/routes/auth.routes.js
const express = require('express');
const router = express.Router();
const authCtrl = require('../controllers/auth.controller');

// Ensure functions exist before using them
if (!authCtrl || typeof authCtrl.register !== 'function' || typeof authCtrl.login !== 'function') {
  throw new Error('auth.controller.js must export register and login functions');
}

router.post('/register', authCtrl.register);
router.post('/login', authCtrl.login);

module.exports = router;
