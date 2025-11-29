// fixPos.js
const fs = require('fs');
const csv = require('csv-parser');
const mongoose = require('mongoose');
require('dotenv').config();
const Vocabulary = require('../models/Vocabulary');
// Cấu hình
const CONFIG = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_BASE_URL: 'https://gpt3.shupremium.com/v1',
    MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/your_database',
    CSV_FILE_PATH: 'C:\\Users\\HP\\Desktop\\FPT_EDU\\MMA\\dataset\\oxford3000_vocabulary_with_collocations_and_definitions_datasets.csv',
    BATCH_SIZE: 10, // Xử lý 10 từ cùng lúc để tiết kiệm token
    DELAY_BETWEEN_BATCHES: 2000, // 2 giây giữa các batch
    MAX_RETRIES: 3
};

/**
 * Lấy danh sách word trong CSV có "Part of Speech" chứa keyword (không phân biệt hoa thường)
 * @param {string} filePath - đường dẫn file CSV
 * @param {string} keyword - ví dụ: 'phrasal verb', 'noun', 'verb', ...
 * @returns {Promise<string[]>} - danh sách word (có thể trùng, lát nữa ta uniq lại)
 */
function getWordsByCsvPosKeyword(filePath, keyword) {
    return new Promise((resolve, reject) => {
        const words = [];
        const lowerKeyword = keyword.toLowerCase();

        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (data) => {
                const word = data['Word'] || data['word'];
                const posRaw = data['Part of Speech'] || data['partOfSpeech'] || '';

                if (!word || !posRaw) return;

                if (posRaw.toLowerCase().includes(lowerKeyword)) {
                    words.push(word.trim());
                }
            })
            .on('end', () => resolve(words))
            .on('error', (err) => reject(err));
    });
}

/**
 * Sửa lại partOfSpeech trong MongoDB cho các từ có POS trong CSV chứa csvPosKeyword
 * @param {string} csvPosKeyword - keyword để tìm trong cột "Part of Speech" của CSV (vd: 'phrasal verb')
 * @param {string} newPos - partOfSpeech mới muốn set trong MongoDB (vd: 'phrase')
 * @param {string} oldPos - partOfSpeech hiện tại trong MongoDB (vd: 'noun') – mặc định là 'noun'
 */
async function fixPartOfSpeechFromCsv(csvPosKeyword, newPos, oldPos = 'noun') {
    console.log(`🔎 Đang tìm các word trong CSV có POS chứa: "${csvPosKeyword}"...`);
    const words = await getWordsByCsvPosKeyword(CONFIG.CSV_FILE_PATH, csvPosKeyword);

    const uniqueWords = [...new Set(words)];
    console.log(`👉 Tìm được ${uniqueWords.length} từ (unique) trong CSV.`);
    console.log(uniqueWords)
    if (uniqueWords.length === 0) {
        console.log('⚠️ Không có từ nào khớp, dừng.');
        return;
    }

    console.log(`🛠 Đang update trong MongoDB: đổi partOfSpeech từ "${oldPos}" → "${newPos}"...`);

    const result = await Vocabulary.updateMany(
        {
            word: { $in: uniqueWords },
            partOfSpeech: oldPos, // chỉ sửa những từ đang là oldPos
        },
        {
            $set: { partOfSpeech: newPos },
        }
    );

    console.log('✅ Hoàn thành update.');
    console.log(`- matchedCount : ${result.matchedCount ?? result.n}`);
    console.log(`- modifiedCount: ${result.modifiedCount ?? result.nModified}`);
}

(async () => {
    try {
        await mongoose.connect(CONFIG.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        await fixPartOfSpeechFromCsv('phrasal verb', 'phrase', 'noun');

        await mongoose.disconnect();
        console.log('👋 Disconnected from MongoDB');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
})();
