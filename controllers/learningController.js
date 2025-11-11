const mongoose = require('mongoose');
const LearningProgress = require('../models/LearningProgress');
const { calculateNextReview } = require('../utils/spacedRepetition');

  exports.startLearning = async (req, res) => {
    try {
      const { vocabId, quality } = req.body;
      const userId = req.user.id;

      let progress = new LearningProgress({
          userId,
          vocabId,
          repetitionCount: 0,
          correctCount: 0,
          incorrectCount: 0,
          status: 'learning'
        });
        await progress.save();


      const {
        nextInterval,
        newEasinessFactor
      } = calculateNextReview(quality, progress.easinessFactor, progress.interval);

      progress.interval = nextInterval;
      progress.easinessFactor = newEasinessFactor;
      await progress.save();
      res.json(progress);
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  };

exports.getStats = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Thống kê tổng quan
    const stats = await LearningProgress.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
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

    // Phân loại theo mức độ (1-5) dựa trên easinessFactor
    const levelStats = await LearningProgress.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      {
        $project: {
          level: {
            $switch: {
              branches: [
                { case: { $lt: ["$easinessFactor", 1.5] }, then: 1 }, // Rất khó
                { case: { $lt: ["$easinessFactor", 2.0] }, then: 2 }, // Khó
                { case: { $lt: ["$easinessFactor", 2.5] }, then: 3 }, // Trung bình
                { case: { $lt: ["$easinessFactor", 3.0] }, then: 4 }, // Dễ
                { case: { $gte: ["$easinessFactor", 3.0] }, then: 5 }  // Rất dễ/Đã thuộc
              ],
              default: 3
            }
          }
        }
      },
      {
        $group: {
          _id: "$level",
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Chuyển đổi levelStats thành object dễ sử dụng
    const levels = [1, 2, 3, 4, 5].map(level => {
      const found = levelStats.find(l => l._id === level);
      return {
        level,
        count: found ? found.count : 0,
        label: ['Rất khó', 'Khó', 'Trung bình', 'Dễ', 'Đã thuộc'][level - 1]
      };
    });

    // Phân loại theo status
    const statusStats = await LearningProgress.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    // Từ cần ôn tập (nextReviewDate <= hôm nay)
    const dueForReview = await LearningProgress.countDocuments({
      userId: new mongoose.Types.ObjectId(userId),
      nextReviewDate: { $lte: new Date() },
      status: { $in: ['learning', 'review'] }
    });

    const basicStats = stats[0] || { 
      totalWords: 0, 
      wordsLearned: 0, 
      totalCorrect: 0, 
      totalIncorrect: 0 
    };

    // Tạo object status với giá trị mặc định
    const statusObj = {
      new: 0,
      learning: 0,
      review: 0,
      mastered: 0
    };
    statusStats.forEach(s => {
      statusObj[s._id] = s.count;
    });

    res.json({
      ...basicStats,
      levels, // Mảng 5 mức độ
      statusBreakdown: statusObj,
      dueForReview
    });
  } catch (error) {
    console.error('Error in getStats:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.updateProgress = async (req, res) => {
  try {
    const { vocabId, isCorrect } = req.body;
    const userId = req.user.id;
    if (!mongoose.Types.ObjectId.isValid(vocabId)) {
      return res.status(400).json({ message: 'Invalid vocabId format' });
    }
    let progress = await LearningProgress.findOne({ userId, vocabId });
    if (!progress) {
      return res.status(404).json({ message: 'Learning progress not found. Please start learning first.' });
    }

    // Tự động xác định quality dựa trên kết quả
    // isCorrect = true => quality = 5 (hoàn hảo)
    // isCorrect = false => quality = 2 (khó nhớ)
    const quality = isCorrect ? 5 : 2;

    const {
      nextInterval,
      newEasinessFactor
    } = calculateNextReview(quality, progress.easinessFactor, progress.interval);

    progress.interval = nextInterval;
    progress.easinessFactor = newEasinessFactor;
    progress.nextReviewDate = new Date(Date.now() + nextInterval * 24 * 60 * 60 * 1000);
    progress.lastReviewDate = new Date();
    progress.repetitionCount += 1;

    if (progress.easinessFactor >= 2.5 && progress.repetitionCount >= 3) {
      progress.status = 'review';
    } else if (progress.repetitionCount > 0) {
      progress.status = 'learning';
    }

    if (quality >= 4) {
      progress.correctCount += 1;
    } else {
      progress.incorrectCount += 1;
    }

    await progress.save();
    res.json(progress);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};