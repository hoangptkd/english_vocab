const mongoose = require('mongoose');

const topicSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },   // ví dụ: "technology-IT"
  slug: { type: String, required: true, unique: true },   // ví dụ: "technology-it"
  description: { type: String, default: '' }
}, { timestamps: true });

topicSchema.index({ slug: 1 }, { unique: true });

module.exports = mongoose.model('Topic', topicSchema);
