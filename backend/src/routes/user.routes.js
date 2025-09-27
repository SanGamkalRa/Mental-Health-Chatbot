const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth.middleware');
const userCtrl = require('../controllers/user.controller');

// GET /api/users (protected)
router.get('/', requireAuth, userCtrl.getAllUsers);

module.exports = router;


