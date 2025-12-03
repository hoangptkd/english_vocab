const express = require('express');
const router = express.Router();
const learningController = require('../controllers/learningController');
const auth = require('../middleware/auth');
const vocabularyController = require("../controllers/vocabularyController");

router.post('/start', auth, learningController.startLearning);
router.post('/update', auth, learningController.updateProgress);
router.get('/stats', auth, learningController.getStats);
router.get('/review', auth, learningController.getReviewVocabs);
router.get('/all', auth, learningController.getAllLearning);

module.exports = router;