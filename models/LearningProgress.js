const mongoose = require('mongoose');

const learningProgressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  vocabId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vocabulary',
    required: true
  },
  status: {
    type: String,
    enum: ['new', 'learning', 'review', 'mastered'],
    default: 'new'
  },
  easinessFactor: {
    type: Number,
    default: 2.5
  },
  interval: {
    type: Number,
    default: 0
  },
  repetitionCount: {
    type: Number,
    default: 0
  },
  correctCount: {
    type: Number,
    default: 0
  },
  incorrectCount: {
    type: Number,
    default: 0
  },
  lastReviewDate: {
    type: Date,
    default: Date.now
  },
  nextReviewDate: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Create compound index for faster queries
learningProgressSchema.index({ userId: 1, vocabId: 1 }, { unique: true });

const LearningProgress = mongoose.model('LearningProgress', learningProgressSchema);
module.exports = LearningProgress;