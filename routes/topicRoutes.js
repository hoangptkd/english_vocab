const express = require('express');
const router = express.Router();
const topicController = require('../controllers/topicController');
const auth = require('../middleware/auth');
const checkRole = require('../middleware/checkRole');
const { topicValidation } = require('../middleware/validation');
router.get('/', auth, topicController.getAllTopics);
router.get('/:id', auth, topicController.getTopicById);

// Admin only routes
router.post('/',
    auth,
    checkRole('admin'),
    topicValidation.create,
    topicController.createTopic
);

router.put('/:id',
    auth,
    checkRole('admin'),
    topicValidation.update,
    topicController.updateTopic
);

router.delete('/:id',
    auth,
    checkRole('admin'),
    topicValidation.delete,
    topicController.deleteTopic
);
module.exports = router;