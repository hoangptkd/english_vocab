// routes/statisticsRoutes.js
const express = require('express');
const router = express.Router();
const statisticsController = require('../controllers/statisticsController');
const  auth = require('../middleware/auth');

// Protect all routes and require admin
router.use(auth);

// @route   GET /api/statistics/system
// @desc    Get overall system statistics
// @access  Admin
router.get('/system', statisticsController.getSystemStatistics);

// @route   GET /api/statistics/user-growth
// @desc    Get user growth data by period
// @access  Admin
router.get('/user-growth', statisticsController.getUserGrowth);

// @route   GET /api/statistics/learning-activity
// @desc    Get learning activity distribution
// @access  Admin
router.get('/learning-activity', statisticsController.getLearningActivity);

// @route   GET /api/statistics/top-topics
// @desc    Get top topics by vocabulary count
// @access  Admin
router.get('/top-topics', statisticsController.getTopTopics);

// @route   GET /api/statistics/learning-distribution
// @desc    Get learning progress distribution
// @access  Admin
router.get('/learning-distribution', statisticsController.getLearningDistribution);

// @route   GET /api/statistics/daily-active
// @desc    Get daily active users trend
// @access  Admin
router.get('/daily-active', statisticsController.getDailyActiveUsers);

// @route   GET /api/statistics/advanced-metrics
// @desc    Get advanced learning metrics
// @access  Admin
router.get('/advanced-metrics', statisticsController.getAdvancedMetrics);

module.exports = router;