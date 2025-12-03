const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();
// ==========================================
// 1. CẤU HÌNH (CONFIG)
// ==========================================
const CONFIG = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    // Lưu ý: Đảm bảo Model này hỗ trợ JSON mode hoặc instruction tốt
    OPENAI_BASE_URL: 'https://gpt3.shupremium.com/v1',
    MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/japanese_learning',
    BATCH_SIZE: 10,
    DELAY_BETWEEN_BATCHES: 2000, // 2s
    MAX_RETRIES: 3
};
// ==========================================
// 2. ĐỊNH NGHĨA MODEL (Theo Schema của bạn)
// ==========================================

const topicSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, default: '' }
}, { timestamps: true });

const Topic = mongoose.model('Topic', topicSchema);

const vocabularySchema = new mongoose.Schema({
    word: { type: String, required: true, unique: true, index: true },
    partOfSpeech: [{
        type: {
            type: String,
            enum: ['noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'pronoun', 'interjection', 'phrase'],
            required: true
        },
        pronunciation: String,
        meaning: { type: String, required: true },
        examples: [{
            sentence: String,
            translation: String
        }],
        _id: false
    }],
    imageUrl: String,
    cefrLevel: {
        type: String,
        enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
        default: 'A1',
        index: true
    },
    popularityScore: { type: Number, default: 0, index: true },
    topics: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Topic' }]
}, { timestamps: true });

const Vocabulary = mongoose.model('Vocabulary', vocabularySchema);

// ==========================================
// 2. DỮ LIỆU TỪ VỰNG (Bài 1 -> Bài 4)
// ==========================================
// Dữ liệu được trích xuất từ file PDF OCR bạn cung cấp.
const rawData = [
    // --- BÀI 1 (Lesson 1) ---
    { word: "私", reading: "わたし", meaning: "Tôi", type: "noun" },
    { word: "名前", reading: "なまえ", meaning: "Tên", type: "noun" },
    { word: "国", reading: "くに", meaning: "Đất nước", type: "noun" },
    { word: "日本", reading: "にほん", meaning: "Nhật Bản", type: "noun" },
    { word: "アメリカ", reading: "アメリカ", meaning: "Mỹ", type: "noun" },
    { word: "ベトナム", reading: "ベトナム", meaning: "Việt Nam", type: "noun" }, // Bổ sung cho ngữ cảnh người Việt
    { word: "高校", reading: "こうこう", meaning: "Trường cấp 3", type: "noun" },
    { word: "大学", reading: "だいがく", meaning: "Trường đại học", type: "noun" },
    { word: "仕事", reading: "しごと", meaning: "Công việc", type: "noun" },
    { word: "学生", reading: "がくせい", meaning: "Học sinh", type: "noun" },
    { word: "先生", reading: "せんせい", meaning: "Thầy/Cô giáo", type: "noun" },
    { word: "教師", reading: "きょうし", meaning: "Giáo viên (nghề nghiệp)", type: "noun" },
    { word: "会社員", reading: "かいしゃいん", meaning: "Nhân viên văn phòng", type: "noun" },
    { word: "社員", reading: "しゃいん", meaning: "Nhân viên", type: "noun" },
    { word: "はじめまして", reading: "はじめまして", meaning: "Xin chào (lần đầu gặp)", type: "phrase" },
    { word: "あのう", reading: "あのう", meaning: "Xin lỗi cho hỏi... (ngập ngừng)", type: "interjection" },

    // --- BÀI 2 (Lesson 2) ---
    { word: "ここ", reading: "ここ", meaning: "Đây, chỗ này", type: "noun" },
    { word: "そこ", reading: "そこ", meaning: "Đó, chỗ đó", type: "noun" },
    { word: "あそこ", reading: "あそこ", meaning: "Kia, chỗ kia", type: "noun" },
    { word: "どこ", reading: "どこ", meaning: "Ở đâu", type: "noun" },
    { word: "インフォメーション", reading: "インフォメーション", meaning: "Quầy thông tin", type: "noun" },
    { word: "トイレ", reading: "トイレ", meaning: "Nhà vệ sinh", type: "noun" },
    { word: "コンビニ", reading: "コンビニ", meaning: "Cửa hàng tiện lợi", type: "noun" },
    { word: "スーパー", reading: "スーパー", meaning: "Siêu thị", type: "noun" },
    { word: "これ", reading: "これ", meaning: "Cái này", type: "noun" },
    { word: "それ", reading: "それ", meaning: "Cái đó", type: "noun" },
    { word: "あれ", reading: "あれ", meaning: "Cái kia", type: "noun" },
    { word: "いくら", reading: "いくら", meaning: "Bao nhiêu tiền", type: "noun" },
    { word: "肉", reading: "にく", meaning: "Thịt", type: "noun" },
    { word: "魚", reading: "さかな", meaning: "Cá", type: "noun" },
    { word: "野菜", reading: "やさい", meaning: "Rau", type: "noun" },
    { word: "水", reading: "みず", meaning: "Nước", type: "noun" },
    { word: "ご飯", reading: "ごはん", meaning: "Cơm / Bữa ăn", type: "noun" },
    { word: "メニュー", reading: "メニュー", meaning: "Thực đơn", type: "noun" },

    // --- BÀI 3 (Lesson 3) ---
    { word: "今", reading: "いま", meaning: "Bây giờ", type: "noun" },
    { word: "午前", reading: "ごぜん", meaning: "Buổi sáng (AM)", type: "noun" },
    { word: "午後", reading: "ごご", meaning: "Buổi chiều (PM)", type: "noun" },
    { word: "銀行", reading: "ぎんこう", meaning: "Ngân hàng", type: "noun" },
    { word: "郵便局", reading: "ゆうびんきょく", meaning: "Bưu điện", type: "noun" },
    { word: "図書館", reading: "としょかん", meaning: "Thư viện", type: "noun" },
    { word: "行きます", reading: "いきます", meaning: "Đi", type: "verb" },
    { word: "帰ります", reading: "かえります", meaning: "Về", type: "verb" },
    { word: "飲みます", reading: "のみます", meaning: "Uống", type: "verb" },
    { word: "食べます", reading: "たべます", meaning: "Ăn", type: "verb" },
    { word: "見ます", reading: "みます", meaning: "Xem, nhìn", type: "verb" },
    { word: "します", reading: "します", meaning: "Làm, chơi", type: "verb" },
    { word: "買います", reading: "かいます", meaning: "Mua", type: "verb" },
    { word: "聞きます", reading: "ききます", meaning: "Nghe, hỏi", type: "verb" },
    { word: "働きます", reading: "はたらきます", meaning: "Làm việc", type: "verb" },
    { word: "読みます", reading: "よみます", meaning: "Đọc", type: "verb" },
    { word: "起きます", reading: "おきます", meaning: "Thức dậy", type: "verb" },
    { word: "寝ます", reading: "ねます", meaning: "Ngủ", type: "verb" },
    { word: "勉強します", reading: "べんきょうします", meaning: "Học", type: "verb" },

    // --- BÀI 4 (Lesson 4) ---
    { word: "北", reading: "きた", meaning: "Phía bắc", type: "noun" },
    { word: "南", reading: "みなみ", meaning: "Phía nam", type: "noun" },
    { word: "東", reading: "ひがし", meaning: "Phía đông", type: "noun" },
    { word: "西", reading: "にし", meaning: "Phía tây", type: "noun" },
    { word: "車", reading: "くるま", meaning: "Ô tô", type: "noun" },
    { word: "新幹線", reading: "しんかんせん", meaning: "Tàu cao tốc Shinkansen", type: "noun" },
    { word: "電車", reading: "でんしゃ", meaning: "Tàu điện", type: "noun" },
    { word: "飛行機", reading: "ひこうき", meaning: "Máy bay", type: "noun" },
    { word: "駅", reading: "えき", meaning: "Nhà ga", type: "noun" },
    { word: "町", reading: "まち", meaning: "Thành phố, thị trấn", type: "noun" },
    { word: "歩いて", reading: "あるいて", meaning: "Đi bộ", type: "adverb" }, // Dùng như trạng từ chỉ phương tiện
    { word: "新しい", reading: "あたらしい", meaning: "Mới", type: "adjective" },
    { word: "古い", reading: "ふるい", meaning: "Cũ", type: "adjective" },
    { word: "大きい", reading: "おおきい", meaning: "To, lớn", type: "adjective" },
    { word: "小さい", reading: "ちいさい", meaning: "Nhỏ, bé", type: "adjective" },
    { word: "高い", reading: "たかい", meaning: "Cao / Đắt", type: "adjective" },
    { word: "低い", reading: "ひくい", meaning: "Thấp", type: "adjective" },
    { word: "きれい", reading: "きれい", meaning: "Đẹp, sạch sẽ", type: "adjective" }, // Na-adj nhưng thường viết không có na trong từ điển
    { word: "静か", reading: "しずか", meaning: "Yên tĩnh", type: "adjective" },
    { word: "有名", reading: "ゆうめい", meaning: "Nổi tiếng", type: "adjective" },
    { word: "暑い", reading: "あつい", meaning: "Nóng (thời tiết/nhiệt độ)", type: "adjective" },
    { word: "寒い", reading: "さむい", meaning: "Lạnh (thời tiết)", type: "adjective" },
    { word: "冷たい", reading: "つめたい", meaning: "Lạnh (cảm giác)", type: "adjective" },
    { word: "おいしい", reading: "おいしい", meaning: "Ngon", type: "adjective" },
];

// ==========================================
// 3. HÀM IMPORT DỮ LIỆU
// ==========================================

// Chuỗi kết nối MongoDB (THAY ĐỔI URL CỦA BẠN Ở ĐÂY)
const MONGODB_URI = 'mongodb://localhost:27017/english_learning_app';

// ==========================================
// 4. HÀM GỌI OPENAI
// ==========================================
async function enrichJapaneseBatch(words, retryCount = 0) {
    try {
        const prompt = `You are a Japanese vocabulary assistant. 
        Input: List of words (Kanji, Hiragana Reading, Meaning).
        
        Task: For EACH word, provide a JSON object with:
        1. "pronunciation": The ROMAJI reading (e.g., "watashi" for "わたし").
        2. "popularityScore": Integer 1-10 based on daily usage frequency.
        3. "examples": An array containing exactly 1 example object with "sentence" (Japanese) and "translation" (Vietnamese).
        
        Input Data:
        ${words.map((w, i) => `${i + 1}. Kanji: ${w.word}, Reading: ${w.reading}, Meaning: ${w.meaning}`).join('\n')}

        Return ONLY a valid JSON array with this exact structure (no markdown):
        [
          {
            "originalIndex": 0,
            "pronunciation": "watashi",
            "popularityScore": 10,
            "examples": [
              {
                "sentence": "私はベトナム人です。",
                "translation": "Tôi là người Việt Nam."
              }
            ]
          }
        ]`;

        const response = await axios.post(
            `${CONFIG.OPENAI_BASE_URL}/chat/completions`,
            {
                model: 'gpt-4o-mini', // Hoặc 'gpt-4.1-mini' như config cũ của bạn nếu có
                messages: [
                    { role: 'system', content: 'You are a JSON generator. Return only raw JSON.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.3
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`
                }
            }
        );

        let content = response.data.choices[0].message.content.trim();
        // Clean markdown
        content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        const enrichedData = JSON.parse(content);

        if (!Array.isArray(enrichedData) || enrichedData.length !== words.length) {
            // Fallback đơn giản nếu AI trả về thiếu số lượng (hiếm gặp nếu prompt chuẩn)
            console.warn("⚠️ AI response length mismatch. Using partial data or defaults.");
        }

        return enrichedData;

    } catch (error) {
        console.error(`Error calling OpenAI (Attempt ${retryCount + 1}):`, error.message);

        if (retryCount < CONFIG.MAX_RETRIES) {
            console.log(`Retrying in ${CONFIG.DELAY_BETWEEN_BATCHES}ms...`);
            await new Promise(r => setTimeout(r, CONFIG.DELAY_BETWEEN_BATCHES));
            return enrichJapaneseBatch(words, retryCount + 1);
        }
        throw error;
    }
}

// ==========================================
// 5. HÀM IMPORT CHÍNH
// ==========================================
async function importVocabulary() {
    try {
        console.log('🚀 Starting Japanese vocabulary import...\n');
        await mongoose.connect(CONFIG.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // 1. Tạo hoặc tìm Topic
        let topic = await Topic.findOne({ slug: 'dekiru-nihongo-so-cap' });
        if (!topic) {
            topic = await Topic.create({
                name: 'Dekiru Nihongo Sơ Cấp (Bài 1-4)',
                slug: 'dekiru-nihongo-so-cap',
                description: 'Từ vựng tiếng Nhật sơ cấp từ bài 1 đến bài 4'
            });
            console.log('✅ Created new Topic:', topic.name);
        } else {
            console.log('ℹ️ Found existing Topic:', topic.name);
        }

        let successCount = 0;
        let errorCount = 0;
        const totalBatches = Math.ceil(rawData.length / CONFIG.BATCH_SIZE);

        // 2. Xử lý theo Batch
        for (let i = 0; i < rawData.length; i += CONFIG.BATCH_SIZE) {
            const batch = rawData.slice(i, i + CONFIG.BATCH_SIZE);
            const batchNumber = Math.floor(i / CONFIG.BATCH_SIZE) + 1;

            console.log(`📦 Processing Batch ${batchNumber}/${totalBatches} (${batch.length} words)...`);

            try {
                // Gọi AI để lấy Romaji và Examples
                const enrichedData = await enrichJapaneseBatch(batch);

                // Chuẩn bị operations cho bulkWrite (hiệu suất cao hơn loop từng cái)
                const bulkOps = batch.map((item, index) => {
                    // Logic ghép từ: Nếu Kanji giống Hiragana (ví dụ 'アメリカ') thì chỉ lấy 1, ngược lại ghép 'Kanji - Hiragana'
                    const displayWord = (item.word === item.reading)
                        ? item.word
                        : `${item.word} - ${item.reading}`;

                    // Lấy dữ liệu từ AI (hoặc fallback nếu lỗi index)
                    const aiInfo = enrichedData[index] || {
                        pronunciation: '',
                        popularityScore: 0,
                        examples: []
                    };

                    return {
                        updateOne: {
                            filter: { word: displayWord }, // Tìm theo từ đã ghép
                            update: {
                                $set: {
                                    partOfSpeech: [{
                                        type: item.type,
                                        pronunciation: aiInfo.pronunciation, // Romaji
                                        meaning: item.meaning,
                                        examples: aiInfo.examples
                                    }],
                                    cefrLevel: 'A1', // Mặc định sơ cấp
                                    popularityScore: aiInfo.popularityScore
                                },
                                $addToSet: { topics: topic._id },
                                $setOnInsert: { imageUrl: '' } // Chỉ set khi tạo mới
                            },
                            upsert: true
                        }
                    };
                });

                const result = await Vocabulary.bulkWrite(bulkOps);
                successCount += (result.upsertedCount + result.modifiedCount);
                console.log(`   ✅ Batch ${batchNumber} saved.\n`);

                // Delay
                if (i + CONFIG.BATCH_SIZE < rawData.length) {
                    await new Promise(r => setTimeout(r, CONFIG.DELAY_BETWEEN_BATCHES));
                }

            } catch (err) {
                console.error(`   ❌ Batch ${batchNumber} failed:`, err.message);
                errorCount += batch.length;
            }
        }

        console.log('------------------------------------------------');
        console.log(`🏁 Import process completed!`);
        console.log(`✅ Processed successfully: ${successCount}`);
        console.log(`❌ Failed: ${errorCount}`);

    } catch (error) {
        console.error('CRITICAL ERROR:', error);
    } finally {
        await mongoose.disconnect();
        console.log('👋 Disconnected from MongoDB');
    }
}

// Chạy script
if (require.main === module) {
    importVocabulary();
}

module.exports = { importVocabulary };