const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../middleware/auth');
const authController = require("../controllers/authController");
const checkRole = require('../middleware/checkRole');
const { userValidation } = require('../middleware/validation');
const { body } = require('express-validator');

router.post('/changePassword',auth, userController.changePassword);
router.get('/profile/update', auth, userController.updateProfile);
router.get('/profile/me', auth, userController.getMe);

// Admin only routes
router.get('/admin/users',
    auth,
    checkRole('admin'),
    userController.getAllUsers
);

router.get('/admin/users/statistics',
    auth,
    checkRole('admin'),
    userController.getUserStatistics
);

router.get('/admin/users/:id',
    auth,
    checkRole('admin'),
    userValidation.get,
    userController.getUserById
);

router.post('/admin/users',
    auth,
    checkRole('admin'),
    [
        body('email').isEmail().withMessage('Invalid email'),
        body('password').isLength({ min: 6 }).withMessage('Password min 6 characters'),
        body('name').trim().notEmpty().withMessage('Name is required'),
        body('role').optional().isIn(['admin', 'user', 'premium']).withMessage('Invalid role')
    ],
    userController.createUser
);

router.put('/admin/users/:id',
    auth,
    checkRole('admin'),
    userValidation.update,
    userController.updateUser
);

router.put('/updatePremium', auth, userController.updateRoleUser);

router.delete('/admin/users/:id',
    auth,
    checkRole('admin'),
    userValidation.delete,
    userController.deleteUser
);

router.post('/admin/users/:id/reset-password',
    auth,
    checkRole('admin'),
    [
        body('newPassword').isLength({ min: 6 }).withMessage('Password min 6 characters')
    ],
    userController.resetUserPassword
);
module.exports = router;