const mongoose = require('mongoose');

const vocabularySchema = new mongoose.Schema({
  word: { 
    type: String, 
    required: true,
    unique: true,
    index: true
  },
  
  // partOfSpeech giờ là mảng các object
  partOfSpeech: [{
    type: {
      type: String,
      enum: ['noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'pronoun', 'interjection', 'phrase'],
      required: true
    },
    pronunciation: String,
    meaning: { type: String, required: true },
    examples: [{
      sentence: String,
      translation: String
    }],
    _id: false // Không tạo _id cho subdocument
  }],
  
  imageUrl: String,
  
  cefrLevel: {
    type: String,
    enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
    default: 'A1',
    index: true
  },
  
  popularityScore: { 
    type: Number, 
    default: 0, 
    index: true 
  },
  
  topics: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Topic' 
  }]

}, { timestamps: true });

// Indexes
vocabularySchema.index({ cefrLevel: 1 });
vocabularySchema.index({ word: 'text', 'partOfSpeech.meaning': 'text', 'partOfSpeech.examples.sentence': 'text' });

const Vocabulary = mongoose.model('Vocabulary', vocabularySchema);
module.exports = Vocabulary;