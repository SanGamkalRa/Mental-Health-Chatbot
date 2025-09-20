// src/routes/wellness.routes.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth.middleware'); // optional protection
const wellnessCtrl = require('../controllers/wellness.controller');

// Public daily tip (no auth required); change to requireAuth if you want protected
router.get('/daily', wellnessCtrl.getDailyTip);

// List all tips (protected — optional)
router.get('/', requireAuth, wellnessCtrl.getAllTips);

module.exports = router;
