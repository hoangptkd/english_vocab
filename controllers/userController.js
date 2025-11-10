const User = require('../models/User');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');
const LearningProgress = require('../models/LearningProgress');

exports.getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        const formatUser = {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            avatarUrl: user.avatarUrl,
            isActive: user.isActive,
            subscriptionExpiry: user.subscriptionExpiry,
            lastLogin: user.lastLogin,
            totalPoints: user.totalPoints,
            preferences: {
                language: user.preferences.language, favoriteTopics: user.preferences.favoriteTopics
            },
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
        }
        res.json(formatUser);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Đổi mật khẩu
exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        // Lấy thông tin người dùng từ token
        const user = await User.findById(req.user.id);
        // Kiểm tra mật khẩu cũ
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Current password is incorrect' });
        }

        // Hash mật khẩu mới
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // Cập nhật mật khẩu mới
        user.password = hashedPassword;
        await user.save();

        logger.info('Password updated successfully', { userId: user._id });

        res.status(200).json({ message: 'Password updated successfully' });
    } catch (error) {
        logger.error('Error updating password:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Cập nhật thông tin profile (tên)
exports.updateProfile = async (req, res) => {
    try {
        const { name } = req.body;

        // Lấy thông tin người dùng từ token
        const user = await User.findById(req.user.id);

        // Cập nhật thông tin tên
        user.name = name || user.name;

        await user.save();

        logger.info('User profile updated', { userId: user._id });

        res.status(200).json({
            message: 'Profile updated successfully',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                createdAt: user.createdAt,
            }
        });
    } catch (error) {
        logger.error('Error updating profile:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// GET all users (admin only)
exports.getAllUsers = async (req, res) => {
    try {
        const { page = 1, limit = 10, role, isActive, search } = req.query;

        const query = {};

        if (role) query.role = role;
        if (isActive !== undefined) query.isActive = isActive === 'true';
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        const users = await User.find(query)
            .select('-password')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit));

        const total = await User.countDocuments(query);

        res.json({
            users,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        logger.error('Error getting users:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// GET user by ID (admin only)
exports.getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .select('-password')
            .populate('preferences.favoriteTopics', 'name slug');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Get learning stats
        const learningStats = await LearningProgress.aggregate([
            { $match: { userId: user._id } },
            {
                $group: {
                    _id: null,
                    totalWords: { $sum: 1 },
                    wordsLearned: { $sum: { $cond: [{ $gt: ["$repetitionCount", 0] }, 1, 0] } },
                    totalCorrect: { $sum: "$correctCount" },
                    totalIncorrect: { $sum: "$incorrectCount" }
                }
            }
        ]);

        res.json({
            user,
            learningStats: learningStats[0] || {
                totalWords: 0,
                wordsLearned: 0,
                totalCorrect: 0,
                totalIncorrect: 0
            }
        });
    } catch (error) {
        logger.error('Error getting user:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// CREATE user (admin only)
exports.createUser = async (req, res) => {
    try {
        const { email, password, name, role } = req.body;

        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'Email already exists' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = new User({
            email,
            password: hashedPassword,
            name,
            role: role || 'user'
        });

        await user.save();

        logger.info('User created by admin', {
            adminId: req.user.id,
            newUserId: user._id
        });

        res.status(201).json({
            message: 'User created successfully',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                createdAt: user.createdAt
            }
        });
    } catch (error) {
        logger.error('Error creating user:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// UPDATE user (admin only)
exports.updateUser = async (req, res) => {
    try {
        const { name, email, isActive, totalPoints, subscriptionExpiry } = req.body;

        // Check if email is being changed and already exists
        if (email) {
            const existingUser = await User.findOne({
                email,
                _id: { $ne: req.params.id }
            });
            if (existingUser) {
                return res.status(400).json({ message: 'Email already exists' });
            }
        }

        const updateData = {};
        if (name) updateData.name = name;
        if (email) updateData.email = email;
        if (isActive !== undefined) updateData.isActive = isActive;
        if (totalPoints !== undefined) updateData.totalPoints = totalPoints;
        if (subscriptionExpiry) updateData.subscriptionExpiry = new Date(subscriptionExpiry);
        updateData.updatedAt = Date.now();

        const user = await User.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        logger.info('User updated by admin', {
            adminId: req.user.id,
            targetUserId: user._id
        });

        res.json({
            message: 'User updated successfully',
            user
        });
    } catch (error) {
        logger.error('Error updating user:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.updateRoleUser = async (req, res) => {
    try {
        const { role, durationMonths } = req.body;

        // Validate role
        if (!['premium'].includes(role)) {
            return res.status(400).json({ message: 'Invalid role specified' });
        }

        // Validate duration
        if (!durationMonths || durationMonths <= 0) {
            return res.status(400).json({ message: 'Invalid duration specified' });
        }

        // Premium package pricing (VND per month)
        const PREMIUM_PRICE_PER_MONTH = 50000; // 50,000 VND per month
        const totalPrice = PREMIUM_PRICE_PER_MONTH * durationMonths;

        // Get current user
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if user has enough points
        if (user.totalPoints < totalPrice) {
            return res.status(400).json({
                message: 'Insufficient points',
                required: totalPrice,
                available: user.totalPoints,
                shortage: totalPrice - user.totalPoints
            });
        }

        // Calculate subscription expiry date
        let subscriptionExpiry;
        if (user.subscriptionExpiry && user.subscriptionExpiry > new Date()) {
            // Extend existing subscription
            subscriptionExpiry = new Date(user.subscriptionExpiry);
            subscriptionExpiry.setMonth(subscriptionExpiry.getMonth() + durationMonths);
        } else {
            // New subscription
            subscriptionExpiry = new Date();
            subscriptionExpiry.setMonth(subscriptionExpiry.getMonth() + durationMonths);
        }

        // Update user
        user.role = role;
        user.subscriptionExpiry = subscriptionExpiry;
        user.totalPoints -= totalPrice;
        user.updatedAt = new Date();
        await user.save();

        logger.info('User upgraded to premium', {
            userId: user._id,
            durationMonths,
            pointsSpent: totalPrice,
            remainingPoints: user.totalPoints,
            expiryDate: subscriptionExpiry
        });

        res.json({
            message: 'User role updated successfully',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                totalPoints: user.totalPoints,
                subscriptionExpiry: user.subscriptionExpiry
            },
            transaction: {
                pointsSpent: totalPrice,
                durationMonths,
                expiryDate: subscriptionExpiry
            }
        });
    } catch (error) {
        logger.error('Error updating user role:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// DELETE user (admin only)
exports.deleteUser = async (req, res) => {
    try {
        const targetUserId = req.params.id;

        // Prevent admin from deleting themselves
        if (req.user.id === targetUserId) {
            return res.status(400).json({ message: 'Cannot delete your own account' });
        }

        const user = await User.findById(targetUserId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Delete user's learning progress
        await LearningProgress.deleteMany({ userId: targetUserId });

        // Delete user
        await User.findByIdAndDelete(targetUserId);

        logger.info('User deleted by admin', {
            adminId: req.user.id,
            deletedUserId: targetUserId
        });

        res.json({ message: 'User and associated data deleted successfully' });
    } catch (error) {
        logger.error('Error deleting user:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// RESET user password (admin only)
exports.resetUserPassword = async (req, res) => {
    try {
        const { newPassword } = req.body;

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({
                message: 'Password must be at least 6 characters'
            });
        }

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        user.password = hashedPassword;
        user.passwordResetRequests = 0;
        user.resetToken = undefined;
        user.resetTokenExpiry = undefined;
        await user.save();

        logger.info('User password reset by admin', {
            adminId: req.user.id,
            targetUserId: user._id
        });

        res.json({ message: 'Password reset successfully' });
    } catch (error) {
        logger.error('Error resetting password:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// GET user statistics (admin only)
exports.getUserStatistics = async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const activeUsers = await User.countDocuments({ isActive: true });
        const premiumUsers = await User.countDocuments({ role: 'premium' });
        const adminUsers = await User.countDocuments({ role: 'admin' });

        // Users by role
        const usersByRole = await User.aggregate([
            {
                $group: {
                    _id: '$role',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Recent registrations (last 30 days)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const recentRegistrations = await User.countDocuments({
            createdAt: { $gte: thirtyDaysAgo }
        });

        res.json({
            totalUsers,
            activeUsers,
            premiumUsers,
            adminUsers,
            usersByRole,
            recentRegistrations
        });
    } catch (error) {
        logger.error('Error getting statistics:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
