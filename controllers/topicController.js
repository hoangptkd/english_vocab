const Topic = require('../models/Topic');
const logger = require("../utils/logger");

exports.getAllTopics = async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;

    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
      ];
    }

    const topics = await Topic.find(query)
        .sort({ name: 1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Topic.countDocuments(query);

    res.json({
      topics,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Error getting topics:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getTopicById = async (req, res) => {
  try {
    const topic = await Topic.findById(req.params.id);
    if (!topic) {
      return res.status(404).json({message: 'Topic not found'});
    }
    res.json(topic);
  } catch (error) {
    res.status(500).json({message: 'Server error', error: error.message});
  }
}
// CREATE topic (admin only)
exports.createTopic = async (req, res) => {
  try {
    const { name, slug, description } = req.body;

    // Check if slug already exists
    const existingTopic = await Topic.findOne({ slug });
    if (existingTopic) {
      return res.status(400).json({ message: 'Topic slug already exists' });
    }

    const topic = new Topic({
      name,
      slug,
      description
    });

    await topic.save();
    res.status(201).json({ message: 'Topic created successfully', topic });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// UPDATE topic (admin only)
exports.updateTopic = async (req, res) => {
  try {
    const { name, slug, description } = req.body;

    // Check if new slug conflicts with existing
    if (slug) {
      const existingTopic = await Topic.findOne({
        slug,
        _id: { $ne: req.params.id }
      });
      if (existingTopic) {
        return res.status(400).json({ message: 'Topic slug already exists' });
      }
    }

    const topic = await Topic.findByIdAndUpdate(
        req.params.id,
        { name, slug, description },
        { new: true, runValidators: true }
    );

    if (!topic) {
      return res.status(404).json({ message: 'Topic not found' });
    }

    res.json({ message: 'Topic updated successfully', topic });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// DELETE topic (admin only)
exports.deleteTopic = async (req, res) => {
  try {
    // Check if topic has vocabularies
    const vocabCount = await Vocabulary.countDocuments({
      topicId: req.params.id
    });

    if (vocabCount > 0) {
      return res.status(400).json({
        message: `Cannot delete topic. It has ${vocabCount} vocabularies associated with it.`
      });
    }

    const topic = await Topic.findByIdAndDelete(req.params.id);

    if (!topic) {
      return res.status(404).json({ message: 'Topic not found' });
    }

    res.json({ message: 'Topic deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
