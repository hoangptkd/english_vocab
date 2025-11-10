// config/socket.js
const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

let io = null;

/**
 * Initialize Socket.IO server
 * @param {http.Server} server - HTTP server instance
 * @returns {SocketIO.Server} Socket.IO server instance
 */
const initializeSocket = (server) => {
    io = socketIO(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
            credentials: true
        },
        // Cấu hình tối ưu
        pingTimeout: 60000,
        pingInterval: 25000,
        transports: ['websocket', 'polling']
    });

    // Authentication middleware
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;

        if (!token) {
            logger.warn('Socket connection attempt without token');
            return next(new Error('Authentication error: No token provided'));
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.userId = decoded.id;
            logger.info(`Socket auth success for user: ${socket.userId}`);
            next();
        } catch (err) {
            logger.error('Socket authentication failed:', err.message);
            next(new Error('Authentication error: Invalid token'));
        }
    });

    // Connection handler
    io.on('connection', (socket) => {
        logger.info(`✅ User connected - ID: ${socket.userId}, Socket: ${socket.id}`);

        // Join user to their own room
        socket.join(socket.userId);
        logger.info(`User ${socket.userId} joined room: ${socket.userId}`);

        // Emit welcome message
        socket.emit('connected', {
            message: 'Connected to WebSocket server',
            userId: socket.userId,
            timestamp: new Date().toISOString()
        });

        // Log active connections
        const clientsCount = io.engine.clientsCount;
        logger.info(`👥 Active connections: ${clientsCount}`);

        // Handle ping-pong for connection check
        socket.on('ping', () => {
            socket.emit('pong', {
                timestamp: Date.now(),
                userId: socket.userId
            });
        });

        // Handle custom events (có thể mở rộng)
        socket.on('request:notification', () => {
            socket.emit('notification', {
                message: 'This is a test notification',
                timestamp: new Date().toISOString()
            });
        });

        // Disconnect handler
        socket.on('disconnect', (reason) => {
            logger.info(`❌ User disconnected - ID: ${socket.userId}, Reason: ${reason}`);
            const clientsCount = io.engine.clientsCount;
            logger.info(`👥 Remaining connections: ${clientsCount}`);
        });

        // Error handler
        socket.on('error', (error) => {
            logger.error(`Socket error for user ${socket.userId}:`, error);
        });
    });

    logger.info('🔌 Socket.IO server initialized');
    return io;
};

/**
 * Get Socket.IO instance
 * @returns {SocketIO.Server|null}
 */
const getIO = () => {
    if (!io) {
        throw new Error('Socket.IO not initialized. Call initializeSocket first.');
    }
    return io;
};

/**
 * Emit event to specific user
 * @param {string} userId - User ID to send event to
 * @param {string} event - Event name
 * @param {object} data - Event data
 */
const emitToUser = (userId, event, data) => {
    if (!io) {
        logger.error('Cannot emit: Socket.IO not initialized');
        return false;
    }

    try {
        io.to(userId).emit(event, {
            ...data,
            timestamp: new Date().toISOString()
        });
        logger.info(`📤 Emitted ${event} to user ${userId}`);
        return true;
    } catch (error) {
        logger.error(`Failed to emit ${event} to user ${userId}:`, error);
        return false;
    }
};

/**
 * Emit event to all connected clients
 * @param {string} event - Event name
 * @param {object} data - Event data
 */
const emitToAll = (event, data) => {
    if (!io) {
        logger.error('Cannot emit: Socket.IO not initialized');
        return false;
    }

    try {
        io.emit(event, {
            ...data,
            timestamp: new Date().toISOString()
        });
        logger.info(`📢 Broadcasted ${event} to all users`);
        return true;
    } catch (error) {
        logger.error(`Failed to broadcast ${event}:`, error);
        return false;
    }
};

/**
 * Get count of connected clients
 * @returns {number}
 */
const getConnectedClientsCount = () => {
    if (!io) return 0;
    return io.engine.clientsCount;
};

/**
 * Check if user is connected
 * @param {string} userId - User ID to check
 * @returns {boolean}
 */
const isUserConnected = async (userId) => {
    if (!io) return false;

    try {
        const sockets = await io.in(userId).fetchSockets();
        return sockets.length > 0;
    } catch (error) {
        logger.error(`Error checking user connection:`, error);
        return false;
    }
};

module.exports = {
    initializeSocket,
    getIO,
    emitToUser,
    emitToAll,
    getConnectedClientsCount,
    isUserConnected
};