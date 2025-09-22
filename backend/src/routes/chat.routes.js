const express = require('express');
const router = express.Router();
const chatCtrl = require('../controllers/chat.controller');
const { requireAuth } = require('../middleware/auth.middleware');

// list conversations
router.get('/', requireAuth, chatCtrl.listConversations);

// create new conversation
router.post('/', requireAuth, chatCtrl.createConversation);

// get single conversation
router.get('/:id', requireAuth, chatCtrl.getConversation);

// add message to conversation
router.post('/:id/messages', requireAuth, chatCtrl.addMessage);

// delete conversation
router.delete('/:id', requireAuth, chatCtrl.deleteConversation);

module.exports = router;