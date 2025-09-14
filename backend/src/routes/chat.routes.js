const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth.middleware');
const ctrl = require('../controllers/chat.controller');

router.post('/message', auth, ctrl.sendMessage);
router.get('/history', auth, ctrl.getHistory);

module.exports = router;
