const swaggerAutogen = require('swagger-autogen')();

const doc = {
    info: {
        title: 'English Vocabulary Learning API',
        version: '1.0.0',
    },
    host: 'localhost:3000',
    schemes: ['http'],
    securityDefinitions: {
        bearerAuth: {
            type: 'apiKey',
            name: 'Authorization',
            in: 'header'
        }
    }
};

const outputFile = './swagger-output.json';
const routes = [
    './routes/authRoutes.js',
    './routes/vocabularyRoutes.js',
    './routes/learningRoutes.js',
    './routes/topicRoutes.js'
];

// Generate with all route files
swaggerAutogen(outputFile, routes, doc);