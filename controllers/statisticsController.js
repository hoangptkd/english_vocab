// controllers/statisticsController.js
const User = require('../models/User');
const Vocabulary = require('../models/Vocabulary');
const LearningProgress = require('../models/LearningProgress');
const Room = require('../models/Room');
const Topic = require('../models/Topic');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

// GET overall system statistics
exports.getSystemStatistics = async (req, res) => {
    try {
        const { period = 'week' } = req.query; // week, month, year

        // 1. User Statistics
        const totalUsers = await User.countDocuments();
        const activeUsers = await User.countDocuments({ isActive: true });
        const premiumUsers = await User.countDocuments({ role: 'premium' });
        const adminUsers = await User.countDocuments({ role: 'admin' });

        // 2. Vocabulary Statistics
        const totalVocabs = await Vocabulary.countDocuments();
        const vocabsByLevel = await Vocabulary.aggregate([
            {
                $group: {
                    _id: '$level',
                    count: { $sum: 1 }
                }
            }
        ]);

        // 3. Learning Statistics
        const learningStats = await LearningProgress.aggregate([
            {
                $group: {
                    _id: null,
                    totalSessions: { $sum: '$repetitionCount' },
                    totalCorrect: { $sum: '$correctCount' },
                    totalIncorrect: { $sum: '$incorrectCount' },
                    avgEasinessFactor: { $avg: '$easinessFactor' }
                }
            }
        ]);

        const learning = learningStats[0] || {
            totalSessions: 0,
            totalCorrect: 0,
            totalIncorrect: 0,
            avgEasinessFactor: 2.5
        };

        // Calculate completion rate
        const totalAttempts = learning.totalCorrect + learning.totalIncorrect;
        const completionRate = totalAttempts > 0
            ? ((learning.totalCorrect / totalAttempts) * 100).toFixed(1)
            : 0;

        // 4. Battle Statistics
        const totalBattles = await Room.countDocuments();
        const completedBattles = await Room.countDocuments({ status: 'finished' });

        res.json({
            users: {
                totalUsers,
                activeUsers,
                premiumUsers,
                adminUsers
            },
            vocabularies: {
                total: totalVocabs,
                byLevel: {
                    beginner: vocabsByLevel.find(v => v._id === 'beginner')?.count || 0,
                    intermediate: vocabsByLevel.find(v => v._id === 'intermediate')?.count || 0,
                    advanced: vocabsByLevel.find(v => v._id === 'advanced')?.count || 0
                }
            },
            learning: {
                totalSessions: learning.totalSessions,
                avgSessionTime: 15.5, // Mock - bạn có thể tracking thật
                completionRate: parseFloat(completionRate),
                totalCorrect: learning.totalCorrect,
                totalIncorrect: learning.totalIncorrect
            },
            battles: {
                total: totalBattles,
                completed: completedBattles
            }
        });
    } catch (error) {
        logger.error('Error getting system statistics:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// GET user growth data
exports.getUserGrowth = async (req, res) => {
    try {
        const { period = 'week' } = req.query;

        let dateFormat, daysBack;
        switch (period) {
            case 'week':
                dateFormat = '%Y-%m-%d';
                daysBack = 7;
                break;
            case 'month':
                dateFormat = '%Y-%m-%d';
                daysBack = 30;
                break;
            case 'year':
                dateFormat = '%Y-%m';
                daysBack = 365;
                break;
            default:
                dateFormat = '%Y-%m-%d';
                daysBack = 7;
        }

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysBack);

        const userGrowth = await User.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: dateFormat, date: '$createdAt' } },
                    newUsers: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Get active users per period
        const activeUsersByDate = await User.aggregate([
            {
                $match: {
                    lastLogin: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: dateFormat, date: '$lastLogin' } },
                    activeUsers: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Merge data
        const growthMap = new Map();
        userGrowth.forEach(item => {
            growthMap.set(item._id, { date: item._id, newUsers: item.newUsers, activeUsers: 0 });
        });
        activeUsersByDate.forEach(item => {
            if (growthMap.has(item._id)) {
                growthMap.get(item._id).activeUsers = item.activeUsers;
            } else {
                growthMap.set(item._id, { date: item._id, newUsers: 0, activeUsers: item.activeUsers });
            }
        });

        const result = Array.from(growthMap.values()).sort((a, b) =>
            a.date.localeCompare(b.date)
        );

        res.json(result);
    } catch (error) {
        logger.error('Error getting user growth:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// GET learning activity distribution
exports.getLearningActivity = async (req, res) => {
    try {
        // Activity by status
        const activityByStatus = await LearningProgress.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Battle activity
        const battleCount = await Room.countDocuments({ status: 'finished' });

        const activities = [
            {
                name: 'Học mới',
                value: activityByStatus.find(a => a._id === 'new')?.count || 0,
                color: '#10B981'
            },
            {
                name: 'Ôn tập',
                value: activityByStatus.find(a => a._id === 'review')?.count || 0,
                color: '#3B82F6'
            },
            {
                name: 'Đối kháng',
                value: battleCount,
                color: '#F59E0B'
            }
        ];

        res.json(activities);
    } catch (error) {
        logger.error('Error getting learning activity:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// GET top topics by vocabulary count
exports.getTopTopics = async (req, res) => {
    try {
        const { limit = 5 } = req.query;

        const topTopics = await Vocabulary.aggregate([
            { $unwind: '$topics' },
            {
                $group: {
                    _id: '$topics',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } },
            { $limit: parseInt(limit) },
            {
                $lookup: {
                    from: 'topics',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'topicInfo'
                }
            },
            {
                $project: {
                    name: { $arrayElemAt: ['$topicInfo.name', 0] },
                    count: 1
                }
            }
        ]);

        res.json(topTopics);
    } catch (error) {
        logger.error('Error getting top topics:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// GET learning progress distribution
exports.getLearningDistribution = async (req, res) => {
    try {
        const distribution = await LearningProgress.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        const result = {
            new: 0,
            learning: 0,
            review: 0,
            mastered: 0
        };

        distribution.forEach(item => {
            result[item._id] = item.count;
        });

        res.json(result);
    } catch (error) {
        logger.error('Error getting learning distribution:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// GET daily active users trend (last 30 days)
exports.getDailyActiveUsers = async (req, res) => {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const dailyActive = await User.aggregate([
            {
                $match: {
                    lastLogin: { $gte: thirtyDaysAgo }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$lastLogin' } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        res.json(dailyActive);
    } catch (error) {
        logger.error('Error getting daily active users:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// GET advanced learning metrics
exports.getAdvancedMetrics = async (req, res) => {
    try {
        // Average study time per user (based on repetition count)
        const avgRepetitions = await LearningProgress.aggregate([
            {
                $group: {
                    _id: '$userId',
                    totalRepetitions: { $sum: '$repetitionCount' }
                }
            },
            {
                $group: {
                    _id: null,
                    avgRepetitions: { $avg: '$totalRepetitions' }
                }
            }
        ]);

        // Retention rate (users who came back after 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const fourteenDaysAgo = new Date();
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

        const newUsersWeek1 = await User.countDocuments({
            createdAt: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo }
        });

        const returnedUsers = await User.countDocuments({
            createdAt: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo },
            lastLogin: { $gte: sevenDaysAgo }
        });

        const retentionRate = newUsersWeek1 > 0
            ? ((returnedUsers / newUsersWeek1) * 100).toFixed(1)
            : 0;

        // Most improved users (biggest increase in easiness factor)
        const topImprovers = await LearningProgress.aggregate([
            {
                $group: {
                    _id: '$userId',
                    avgEasiness: { $avg: '$easinessFactor' },
                    totalWords: { $sum: 1 }
                }
            },
            { $sort: { avgEasiness: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'userInfo'
                }
            },
            {
                $project: {
                    userName: { $arrayElemAt: ['$userInfo.name', 0] },
                    avgEasiness: { $round: ['$avgEasiness', 2] },
                    totalWords: 1
                }
            }
        ]);

        res.json({
            avgRepetitionsPerUser: avgRepetitions[0]?.avgRepetitions || 0,
            retentionRate: parseFloat(retentionRate),
            topImprovers
        });
    } catch (error) {
        logger.error('Error getting advanced metrics:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

module.exports = exports;