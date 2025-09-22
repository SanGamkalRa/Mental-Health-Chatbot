// src/routes/moods.js
const express = require('express');
const router = express.Router();
const { getMoods, upsertMood } = require('../controllers/mood.controller');

router.get('/', getMoods);
router.post('/', upsertMood);

module.exports = router;
