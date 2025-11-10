const { body, param, validationResult } = require('express-validator');

const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            message: 'Validation error',
            errors: errors.array()
        });
    }
    next();
};

const topicValidation = {
    create: [
        body('name')
            .trim()
            .notEmpty().withMessage('Topic name is required')
            .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
        body('slug')
            .trim()
            .notEmpty().withMessage('Slug is required')
            .matches(/^[a-z0-9-]+$/).withMessage('Slug must contain only lowercase letters, numbers and hyphens'),
        body('description')
            .optional()
            .trim()
            .isLength({ max: 500 }).withMessage('Description max 500 characters'),
        validate
    ],
    update: [
        param('id').isMongoId().withMessage('Invalid topic ID'),
        body('name')
            .optional()
            .trim()
            .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
        body('slug')
            .optional()
            .trim()
            .matches(/^[a-z0-9-]+$/).withMessage('Slug must contain only lowercase letters, numbers and hyphens'),
        body('description')
            .optional()
            .trim()
            .isLength({ max: 500 }).withMessage('Description max 500 characters'),
        validate
    ],
    delete: [
        param('id').isMongoId().withMessage('Invalid topic ID'),
        validate
    ]
};

const vocabularyValidation = {
    create: [
        body('word')
            .trim()
            .notEmpty().withMessage('Word is required')
            .isLength({ min: 1, max: 100 }).withMessage('Word must be 1-100 characters'),
        body('pronunciation')
            .optional()
            .trim()
            .isLength({ max: 100 }).withMessage('Pronunciation max 100 characters'),
        body('meaning')
            .trim()
            .notEmpty().withMessage('Meaning is required')
            .isLength({ min: 1, max: 500 }).withMessage('Meaning must be 1-500 characters'),
        body('example')
            .optional()
            .trim()
            .isLength({ max: 500 }).withMessage('Example max 500 characters'),
        body('level')
            .optional()
            .isIn(['beginner', 'intermediate', 'advanced']).withMessage('Invalid level'),
        body('topicId')
            .isMongoId().withMessage('Invalid topic ID'),
        validate
    ],
    update: [
        param('id').isMongoId().withMessage('Invalid vocabulary ID'),
        body('word')
            .optional()
            .trim()
            .isLength({ min: 1, max: 100 }).withMessage('Word must be 1-100 characters'),
        body('pronunciation')
            .optional()
            .trim()
            .isLength({ max: 100 }).withMessage('Pronunciation max 100 characters'),
        body('meaning')
            .optional()
            .trim()
            .isLength({ min: 1, max: 500 }).withMessage('Meaning must be 1-500 characters'),
        body('example')
            .optional()
            .trim()
            .isLength({ max: 500 }).withMessage('Example max 500 characters'),
        body('level')
            .optional()
            .isIn(['beginner', 'intermediate', 'advanced']).withMessage('Invalid level'),
        body('topicId')
            .optional()
            .isMongoId().withMessage('Invalid topic ID'),
        validate
    ],
    delete: [
        param('id').isMongoId().withMessage('Invalid vocabulary ID'),
        validate
    ]
};

const userValidation = {
    update: [
        param('id').isMongoId().withMessage('Invalid user ID'),
        body('name')
            .optional()
            .trim()
            .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
        body('email')
            .optional()
            .isEmail().withMessage('Invalid email format'),
        body('role')
            .optional()
            .isIn(['admin', 'user', 'premium']).withMessage('Invalid role'),
        body('isActive')
            .optional()
            .isBoolean().withMessage('isActive must be boolean'),
        validate
    ],
    delete: [
        param('id').isMongoId().withMessage('Invalid user ID'),
        validate
    ],
    get: [
        param('id').isMongoId().withMessage('Invalid user ID'),
        validate
    ]
};

module.exports = {
    topicValidation,
    vocabularyValidation,
    userValidation
};