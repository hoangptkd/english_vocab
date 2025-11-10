const Vocabulary = require('../models/Vocabulary');
const LearningProgress = require('../models/LearningProgress');
const mongoose = require('mongoose');
const User = require("../models/User");

exports.getNewVocabs = async (req, res) => {
  try {
    const { topicId, limit = 10 } = req.query;
    const userId = req.user.id;

    // Lấy danh sách vocabId mà user đã học
    const learnedVocabs = await LearningProgress.find({
      userId: new mongoose.Types.ObjectId(userId)
    }).distinct('vocabId');

    // Query để lấy từ mới
    const query = {
      _id: { $nin: learnedVocabs } // Loại bỏ từ đã học
    };

    // Thêm filter theo topic nếu có
    if (topicId) {
      query.topics = { $in: [new mongoose.Types.ObjectId(topicId)] };
    }

    // Đếm tổng số từ mới
    const totalNewWords = await Vocabulary.countDocuments(query);

    // Lấy random từ mới
    const newWords = await Vocabulary.aggregate([
      { $match: query },
      { $sample: { size: parseInt(limit) } }, // Random
      {
        $lookup: {
          from: 'topics',
          localField: 'topicId',
          foreignField: '_id',
          as: 'topic'
        }
      },
      { $unwind: { path: '$topic', preserveNullAndEmptyArrays: true } }
    ]);

    res.json({
      total: totalNewWords,
      count: newWords.length,
      words: newWords
    });
  } catch (error) {
    console.error('Error in getNewWords:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getReviewVocabs = async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();

    const reviewVocabs = await LearningProgress.find({
      userId,
      nextReviewDate: { $lte: now },
      status: { $in: ['learning', 'review'] }
    })
    .populate({
      path: 'vocabId',
      populate: {
        path: 'topics',
        select: 'name slug'
      }
    })
    .limit(10);

    res.json(reviewVocabs);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.searchVocabs = async (req, res) => {
  try {
    const { query, page = 1, limit = 10 } = req.query;

    let vocabs;

    // Nếu query rỗng, trả về tất cả vocabularies
    if (!query || query.trim() === '') {
      vocabs = await Vocabulary.find()
          .populate('topics', 'name slug')
          .sort({ word: 1 }) // Sort alphabetically
          .limit(parseInt(limit));
    } else {
      // Tìm kiếm với full-text search
      vocabs = await Vocabulary.find(
          { $text: { $search: query } },
          { score: { $meta: "textScore" } }
      )
          .populate('topics', 'name slug')
          .sort({ score: { $meta: "textScore" } })
          .limit(parseInt(limit));
    }

    const total = await Vocabulary.countDocuments(query);

    res.json({
      vocabs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getVocabsByTopic = async (req, res) => {
  try {
    const { topicId, level, limit = 10 } = req.query;
    const query = { topics: topicId };
    
    if (level) query.level = level;

    const vocabs = await Vocabulary.find(query)
      .populate('topics', 'name slug')
      .limit(parseInt(limit));

    res.json(vocabs);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getVocabDetails = async (req, res) => {
  try {
    const { id } = req.params;
    
    const vocab = await Vocabulary.findById(id)
      .populate('topics', 'name slug');
    
    if (!vocab) {
      return res.status(404).json({ message: 'Vocabulary not found' });
    }

    res.json(vocab);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// CREATE vocabulary (admin only)
exports.createVocabulary = async (req, res) => {
  try {
    const { word, pronunciation, meaning, example, level, topicId } = req.body;

    // Verify topic exists
    const topic = await Topic.findById(topicId);
    if (!topic) {
      return res.status(404).json({ message: 'Topic not found' });
    }

    const vocabulary = new Vocabulary({
      word,
      pronunciation,
      meaning,
      example,
      level: level || 'beginner',
      topicId,
      topics: [topicId]
    });

    await vocabulary.save();
    await vocabulary.populate('topics', 'name slug');

    res.status(201).json({
      message: 'Vocabulary created successfully',
      vocabulary
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// UPDATE vocabulary (admin only)
exports.updateVocabulary = async (req, res) => {
  try {
    const { word, pronunciation, meaning, example, level, topicId } = req.body;

    // Verify topic exists if provided
    if (topicId) {
      const topic = await Topic.findById(topicId);
      if (!topic) {
        return res.status(404).json({ message: 'Topic not found' });
      }
    }

    const updateData = {};
    if (word) updateData.word = word;
    if (pronunciation) updateData.pronunciation = pronunciation;
    if (meaning) updateData.meaning = meaning;
    if (example !== undefined) updateData.example = example;
    if (level) updateData.level = level;
    if (topicId) {
      updateData.topicId = topicId;
      updateData.topics = [topicId];
    }

    const vocabulary = await Vocabulary.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
    ).populate('topics', 'name slug');

    if (!vocabulary) {
      return res.status(404).json({ message: 'Vocabulary not found' });
    }

    res.json({
      message: 'Vocabulary updated successfully',
      vocabulary
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// DELETE vocabulary (admin only)
exports.deleteVocabulary = async (req, res) => {
  try {
    const vocabulary = await Vocabulary.findByIdAndDelete(req.params.id);

    if (!vocabulary) {
      return res.status(404).json({ message: 'Vocabulary not found' });
    }

    res.json({ message: 'Vocabulary deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};