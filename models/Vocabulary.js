const mongoose = require('mongoose');

const vocabularySchema = new mongoose.Schema({
  word: { type: String, required: true },
  pronunciation: String,
  meaning: { type: String, required: true },
  example: String,
  imageUrl: String,
  level: { 
    type: String, 
    enum: ['beginner', 'intermediate', 'advanced'], 
    default: 'beginner' 
  },
  // 🔊 NEW: Audio URL
  audioUrl: {
    type: String,
    default: null
  },
  audioSource: {
    type: String,
    enum: ['pre-recorded', 'tts', null],
    default: null
  },
  topics: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Topic' }]

}, { timestamps: true });
vocabularySchema.index({ topics: 1, level: 1, word: 1 });
vocabularySchema.index({ word: 'text', meaning: 'text', example: 'text' });
const Vocabulary = mongoose.model('Vocabulary', vocabularySchema);
module.exports = Vocabulary;