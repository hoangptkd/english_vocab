// models/Room.js
const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
    roomCode: {
        type: String,
        required: true,
        unique: true,
        uppercase: true
    },
    host: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    guest: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    status: {
        type: String,
        enum: ['waiting', 'preparing', 'playing', 'finished'],
        default: 'waiting'
    },
    vocabularies: [{
        vocabId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Vocabulary'
        },
        options: [String] // 4 đáp án
    }],
    scores: {
        host: { type: Number, default: 0 },
        guest: { type: Number, default: 0 }
    },
    answers: [{
        userId: mongoose.Schema.Types.ObjectId,
        vocabId: mongoose.Schema.Types.ObjectId,
        answer: String,
        isCorrect: Boolean,
        timeSpent: Number, // milliseconds
        points: Number
    }],
    currentQuestion: {
        type: Number,
        default: 0
    },
    settings: {
        prepareTime: { type: Number, default: 10 }, // seconds
        questionsCount: { type: Number, default: 10 },
        timePerQuestion: { type: Number, default: 15 } // seconds
    },
    winner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }
}, {
    timestamps: true
});

// Index để tìm room nhanh
roomSchema.index({ roomCode: 1 });
roomSchema.index({ status: 1 });
roomSchema.index({ createdAt: 1 });

// Method để generate room code
roomSchema.statics.generateRoomCode = function() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
};

// Method để tính điểm dựa trên thời gian
roomSchema.methods.calculatePoints = function(timeSpent, timeLimit) {
    const maxPoints = 100;
    const minPoints = 20;

    // Trả lời càng nhanh càng nhiều điểm
    const timeRatio = timeSpent / (timeLimit * 1000);
    const points = Math.max(minPoints, Math.round(maxPoints * (1 - timeRatio * 0.8)));

    return points;
};

const Room = mongoose.model('Room', roomSchema);
module.exports = Room;