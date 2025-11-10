const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: {
    type: String,
    enum: ['admin', 'user', 'premium'],
    default: 'user'
  },
  avatarUrl: { type: String, default: '' }, // Avatar URL
  isActive: { type: Boolean, default: true }, // Whether the account is active
  subscriptionExpiry: { type: Date, default: null }, // For premium users
  lastLogin: { type: Date, default: Date.now }, // Time of last login
  totalPoints: { type: Number, default: 0 }, // Points earned through the system
  preferences: {
    language: { type: String, default: 'en' }, // User's preferred language
    favoriteTopics: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Topic' }] // Topics the user is interested in
  },
  resetToken: String,
  resetTokenExpiry: Date,
  passwordResetRequests: { type: Number, default: 0 }, // Track reset requests
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

module.exports = User;
