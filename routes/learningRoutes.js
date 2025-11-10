const express = require('express');
const router = express.Router();
const learningController = require('../controllers/learningController');
const auth = require('../middleware/auth');

router.post('/start', auth, learningController.startLearning);
router.post('/update', auth, learningController.updateProgress);
router.get('/stats', auth, learningController.getStats);

module.exports = router;