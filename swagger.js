const swaggerAutogen = require('swagger-autogen')();

const doc = {
    info: {
        title: 'English Vocabulary Learning API',
        description: 'API documentation for English Vocabulary Learning System',
        version: '1.0.0',
    },
    host: 'localhost:3000',
    basePath: '/',
    schemes: ['http'],
    consumes: ['application/json'],
    produces: ['application/json'],
    securityDefinitions: {
        bearerAuth: {
            type: 'apiKey',
            name: 'Authorization',
            in: 'header',
            description: 'JWT token format: Bearer {token}'
        }
    },
    tags: [
        {
            name: 'Auth',
            description: 'Authentication endpoints'
        },
        {
            name: 'Vocabulary',
            description: 'Vocabulary management'
        },
        {
            name: 'Learning',
            description: 'Learning progress and statistics'
        },
        {
            name: 'Topics',
            description: 'Topic management'
        }
    ]
};

const outputFile = './swagger-output.json';
const endpointsFiles = ['./server.js']; // Thay đổi này để scan từ server.js

swaggerAutogen(outputFile, endpointsFiles, doc).then(() => {
    console.log('Swagger documentation generated successfully');
    require('./server.js'); // Optional: start server after generating docs
});