const fs = require('fs');
const path = require('path');

// Tạo thư mục logs nếu chưa tồn tại
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

const getTimestamp = () => {
    return new Date().toISOString();
};

const logger = {
    info: (message, data = '') => {
        const logMessage = `[INFO] ${getTimestamp()} - ${message} ${JSON.stringify(data)}\n`;
        fs.appendFileSync(path.join(logsDir, 'info.log'), logMessage);
        console.log(logMessage);
    },

    error: (message, error) => {
        const logMessage = `[ERROR] ${getTimestamp()} - ${message} ${error.stack || error}\n`;
        fs.appendFileSync(path.join(logsDir, 'error.log'), logMessage);
        console.error(logMessage);
    },

    access: (req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
            const duration = Date.now() - start;
            const logMessage = `[ACCESS] ${getTimestamp()} - ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms\n`;
            fs.appendFileSync(path.join(logsDir, 'access.log'), logMessage);
            console.log(logMessage);
        });
        next();
    }
};

module.exports = logger;