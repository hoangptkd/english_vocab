require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const connectDB = require('./config/db');
const logger = require('./utils/logger');
const { initializeSocket } = require('./config/socket');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger-output.json');

const app = express();
const server = http.createServer(app);

// 🔥 Initialize Socket.IO
const io = initializeSocket(server);
// Middleware
app.use(express.json());
app.use(logger.access); // Thêm logging middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

app.set('io', io);

// Test route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to English Vocabulary App API' });
});
app.get('/api', (req, res) => {
  res.json({
    message: 'English Vocabulary App API',
    endpoints: {
      auth: '/api/auth',
      vocabulary: '/api/vocabulary', 
      learning: '/api/learning'
    }
  });
});

// Swagger docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/vocabulary', require('./routes/vocabularyRoutes'));
app.use('/api/learning', require('./routes/learningRoutes'));
app.use('/api/topics', require('./routes/topicRoutes')); // Add this line
app.use('/api/user', require('./routes/userRoutes'));
app.use('/api/payment', require('./routes/paymentRoutes'));
// Connect to MongoDB
const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await connectDB();
    logger.info('Database connected successfully');

    server.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
      logger.info(`WebSocket server is ready on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();