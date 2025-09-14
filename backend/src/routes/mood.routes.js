const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth.middleware');
const ctrl = require('../controllers/mood.controller');

router.post('/', auth, ctrl.addMood);
router.get('/', auth, ctrl.getMoods);

module.exports = router;
