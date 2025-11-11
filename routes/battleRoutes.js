// routes/battleRoutes.js
const express = require('express');
const router = express.Router();
const battleController = require('../controllers/battleController');
const auth  = require('../middleware/auth');

// Tất cả routes đều cần authentication
router.use(auth);

// Tạo phòng mới
router.post('/room/create', battleController.createRoom);

// Tham gia phòng
router.post('/room/join', battleController.joinRoom);

// Lấy thông tin phòng
router.get('/room/:roomCode', battleController.getRoom);

// Bắt đầu game (chỉ host)
router.post('/game/start', battleController.startGame);

// Submit câu trả lời
router.post('/game/answer', battleController.submitAnswer);

// Rời phòng
router.post('/room/leave', battleController.leaveRoom);

module.exports = router;