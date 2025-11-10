const express = require('express');
const router = express.Router();
const vocabularyController = require('../controllers/vocabularyController');
const auth = require('../middleware/auth');
const checkRole = require('../middleware/checkRole');
const { vocabularyValidation } = require('../middleware/validation');
// Existing routes
router.get('/new', auth, vocabularyController.getNewVocabs);
router.get('/review', auth, vocabularyController.getReviewVocabs);

// New routes
router.get('/search', auth, vocabularyController.searchVocabs);
router.get('/by-topic', auth, vocabularyController.getVocabsByTopic);
router.get('/:id', auth, vocabularyController.getVocabDetails);

// Admin only routes
router.post('/',
    auth,
    checkRole('admin'),
    vocabularyValidation.create,
    vocabularyController.createVocabulary
);

router.put('/:id',
    auth,
    checkRole('admin'),
    vocabularyValidation.update,
    vocabularyController.updateVocabulary
);

router.delete('/:id',
    auth,
    checkRole('admin'),
    vocabularyValidation.delete,
    vocabularyController.deleteVocabulary
);

module.exports = router;