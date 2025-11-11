// controllers/battleController.js
const Room = require('../models/Room');
const Vocabulary = require('../models/Vocabulary');
const mongoose = require('mongoose');
const { getIO } = require('../config/socket');
const logger = require('../utils/logger');

// Tạo phòng mới
exports.createRoom = async (req, res) => {
    try {
        const userId = req.user.id;

        // Kiểm tra xem user có phòng đang chờ không
        const existingRoom = await Room.findOne({
            $or: [
                { host: userId, status: { $in: ['waiting', 'preparing', 'playing'] } },
                { guest: userId, status: { $in: ['waiting', 'preparing', 'playing'] } }
            ]
        });

        if (existingRoom) {
            return res.status(400).json({
                message: 'Bạn đã có phòng đang hoạt động',
                roomCode: existingRoom.roomCode
            });
        }

        // Generate unique room code
        let roomCode;
        let isUnique = false;

        while (!isUnique) {
            roomCode = Room.generateRoomCode();
            const existing = await Room.findOne({ roomCode });
            if (!existing) isUnique = true;
        }

        // Tạo phòng mới
        const room = new Room({
            roomCode,
            host: userId,
            status: 'waiting'
        });

        await room.save();
        await room.populate('host', 'name email avatarUrl');

        res.json({
            message: 'Tạo phòng thành công',
            room
        });

    } catch (error) {
        console.error('Create room error:', error);
        res.status(500).json({ message: 'Lỗi tạo phòng', error: error.message });
    }
};

// Tham gia phòng
exports.joinRoom = async (req, res) => {
    try {
        const { roomCode } = req.body;
        const userId = req.user.id;

        // Tìm phòng
        const room = await Room.findOne({ roomCode, status: 'waiting' })
            .populate('host', 'name email avatarUrl');

        if (!room) {
            return res.status(404).json({ message: 'Không tìm thấy phòng hoặc phòng đã bắt đầu' });
        }

        if (room.host._id.toString() === userId) {
            return res.status(400).json({ message: 'Bạn là chủ phòng' });
        }

        if (room.guest) {
            return res.status(400).json({ message: 'Phòng đã đầy' });
        }

        // Thêm guest vào phòng
        room.guest = userId;
        await room.save();
        await room.populate('guest', 'name email avatarUrl');

        // Emit socket event để notify host
        const io = getIO();
        io.to(room.host._id.toString()).emit('room:guest_joined', {
            room,
            guest: room.guest
        });

        res.json({
            message: 'Tham gia phòng thành công',
            room
        });

    } catch (error) {
        console.error('Join room error:', error);
        res.status(500).json({ message: 'Lỗi tham gia phòng', error: error.message });
    }
};

// Lấy thông tin phòng
exports.getRoom = async (req, res) => {
    try {
        const { roomCode } = req.params;

        const room = await Room.findOne({ roomCode })
            .populate('host', 'name email avatarUrl')
            .populate('guest', 'name email avatarUrl')
            .populate('vocabularies.vocabId');

        if (!room) {
            return res.status(404).json({ message: 'Không tìm thấy phòng' });
        }

        res.json({ room });

    } catch (error) {
        console.error('Get room error:', error);
        res.status(500).json({ message: 'Lỗi lấy thông tin phòng', error: error.message });
    }
};

// Bắt đầu game (chỉ host)
exports.startGame = async (req, res) => {
    try {
        const { roomCode } = req.body;
        const userId = req.user.id;

        const room = await Room.findOne({ roomCode })
            .populate('host', 'name email avatarUrl')
            .populate('guest', 'name email avatarUrl');

        if (!room) {
            return res.status(404).json({ message: 'Không tìm thấy phòng' });
        }

        // Kiểm tra quyền
        if (room.host._id.toString() !== userId) {
            return res.status(403).json({ message: 'Chỉ chủ phòng mới có thể bắt đầu' });
        }

        if (!room.guest) {
            return res.status(400).json({ message: 'Cần có đủ 2 người chơi' });
        }

        if (room.status !== 'waiting') {
            return res.status(400).json({ message: 'Phòng đã bắt đầu' });
        }

        // Lấy ngẫu nhiên 10 từ vựng
        const vocabs = await Vocabulary.aggregate([
            { $sample: { size: room.settings.questionsCount } }
        ]);

        // Generate options cho mỗi từ
        const allVocabs = await Vocabulary.find().select('meaning');

        room.vocabularies = vocabs.map(vocab => {
            const correctAnswer = vocab.meaning;

            // Lấy 3 đáp án sai
            const wrongAnswers = allVocabs
                .filter(v => v._id.toString() !== vocab._id.toString())
                .sort(() => Math.random() - 0.5)
                .slice(0, 3)
                .map(v => v.meaning);

            // Trộn đáp án
            const options = [...wrongAnswers, correctAnswer]
                .sort(() => Math.random() - 0.5);

            return {
                vocabId: vocab._id,
                options
            };
        });

        room.status = 'playing';
        room.currentQuestion = 0;
        await room.save();
        await room.populate('vocabularies.vocabId');

        // Emit socket event
        const io = getIO();
        io.to(room.host._id.toString()).emit('game:started', { room });
        io.to(room.guest._id.toString()).emit('game:started', { room });

        res.json({
            message: 'Bắt đầu game thành công',
            room
        });

    } catch (error) {
        console.error('Start game error:', error);
        res.status(500).json({ message: 'Lỗi bắt đầu game', error: error.message });
    }
};

// Submit câu trả lời
exports.submitAnswer = async (req, res) => {
    try {
        const { roomCode, vocabId, answer, timeSpent } = req.body;
        const userId = req.user.id;

        const room = await Room.findOne({ roomCode })
            .populate('host', 'name')
            .populate('guest', 'name')
            .populate('vocabularies.vocabId');
        if (!room) {
            return res.status(404).json({ message: 'Không tìm thấy phòng' });
        }

        if (room.status !== 'playing') {
            return res.status(400).json({ message: 'Game chưa bắt đầu hoặc đã kết thúc' });
        }

        // Tìm từ vựng hiện tại
        const currentVocab = room.vocabularies[room.currentQuestion];
        if (!currentVocab || currentVocab.vocabId._id.toString() !== vocabId) {
            return res.status(400).json({ message: 'Câu hỏi không hợp lệ' });
        }

        // Kiểm tra đã trả lời chưa
        const existingAnswer = room.answers.find(
            a => a.userId.toString() === userId &&
                a.vocabId.toString() === vocabId
        );

        if (existingAnswer) {
            return res.status(400).json({ message: 'Bạn đã trả lời câu này' });
        }

        // Kiểm tra đáp án
        const isCorrect = answer === currentVocab.vocabId.meaning;
        let points = 0;

        if (isCorrect) {
            points = room.calculatePoints(timeSpent, room.settings.timePerQuestion);
        }

        // Cập nhật câu trả lời vào cơ sở dữ liệu và tính điểm trực tiếp
        const updatedRoom = await Room.findOneAndUpdate(
            { roomCode },
            {
                $push: { answers: { userId, vocabId, answer, isCorrect, timeSpent, points } },
                $inc: {
                    [`scores.${room.host._id.toString() === userId ? 'host' : 'guest'}`]: points
                }
            },
            { new: true } // Trả về tài liệu đã được cập nhật
        )
            .populate('host', 'name')
            .populate('guest', 'name')
            .populate('vocabularies.vocabId');

        if (!updatedRoom) {
            return res.status(404).json({ message: 'Không thể cập nhật phòng' });
        }

        // Emit socket để notify người chơi khác
        const io = getIO();
        // Emit cho cả room (bao gồm cả 2 người)
        io.to(updatedRoom.host._id.toString()).emit('game:score_updated', {
            scores: updatedRoom.scores,
            answeredBy: userId,
            isCorrect,
            points
        });

        io.to(updatedRoom.guest._id.toString()).emit('game:score_updated', {
            scores: updatedRoom.scores,
            answeredBy: userId,
            isCorrect,
            points
        });
        const otherPlayerId = updatedRoom.host._id.toString() === userId
            ? updatedRoom.guest._id.toString()
            : updatedRoom.host._id.toString();

        io.to(otherPlayerId).emit('game:opponent_answered', {
            userId,
            userName: userId === updatedRoom.host._id.toString() ? updatedRoom.host.name : updatedRoom.guest.name
        });

        // Kiểm tra cả 2 đã trả lời chưa
        const currentQuestionAnswers = updatedRoom.answers.filter(
            a => a.vocabId.toString() === vocabId
        );

        logger.info(`Current question answers count: ${currentQuestionAnswers.length}`);
        if (currentQuestionAnswers.length === 2) {
            // Cả 2 đã trả lời, chuyển câu tiếp
            setTimeout(async () => {
                await moveToNextQuestion(room);
            }, 2000);
        }

        res.json({
            message: 'Đã ghi nhận câu trả lời',
            isCorrect,
            points,
            correctAnswer: currentVocab.vocabId.meaning
        });

    } catch (error) {
        console.error('Submit answer error:', error);
        res.status(500).json({ message: 'Lỗi submit câu trả lời', error: error.message });
    }
};

// Helper function: Chuyển câu hỏi tiếp theo
async function moveToNextQuestion(room) {
    try {
        const io = getIO();

        room.currentQuestion += 1;

        // Kiểm tra đã hết câu hỏi chưa
        if (room.currentQuestion >= room.vocabularies.length) {
            // Kết thúc game
            room.status = 'finished';

            // Xác định winner
            if (room.scores.host > room.scores.guest) {
                room.winner = room.host;
            } else if (room.scores.guest > room.scores.host) {
                room.winner = room.guest;
            }

            await room.save();
            await room.populate('winner', 'name email avatarUrl');

            // Emit kết quả
            io.to(room.host._id.toString()).emit('game:finished', { room });
            io.to(room.guest._id.toString()).emit('game:finished', { room });

        } else {
            // Chuyển câu tiếp theo
            await room.save();

            io.to(room.host._id.toString()).emit('game:next_question', {
                room,
                questionIndex: room.currentQuestion
            });
            io.to(room.guest._id.toString()).emit('game:next_question', {
                room,
                questionIndex: room.currentQuestion
            });
        }
    } catch (error) {
        console.error('Move to next question error:', error);
    }
}

// Rời phòng
exports.leaveRoom = async (req, res) => {
    try {
        const { roomCode } = req.body;
        const userId = req.user.id;

        const room = await Room.findOne({ roomCode });

        if (!room) {
            return res.status(404).json({ message: 'Không tìm thấy phòng' });
        }

        const io = getIO();

        // Nếu là host thì xóa phòng
        if (room.host.toString() === userId) {
            if (room.guest) {
                io.to(room.guest.toString()).emit('room:closed', {
                    message: 'Chủ phòng đã đóng phòng'
                });
            }
            await Room.deleteOne({ _id: room._id });
        } else if (room.guest?.toString() === userId) {
            // Nếu là guest thì remove guest
            room.guest = null;
            room.status = 'waiting';
            await room.save();

            io.to(room.host.toString()).emit('room:guest_left', {
                message: 'Người chơi đã rời phòng'
            });
        }

        res.json({ message: 'Đã rời phòng' });

    } catch (error) {
        console.error('Leave room error:', error);
        res.status(500).json({ message: 'Lỗi rời phòng', error: error.message });
    }
};