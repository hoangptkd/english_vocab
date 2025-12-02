const mongoose = require('mongoose');

// ==========================================
// 1. ĐỊNH NGHĨA MODEL (Theo Schema của bạn)
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

async function importData() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Đã kết nối đến MongoDB');

        // 1. Tạo hoặc tìm Topic "Tiếng Nhật"
        let topic = await Topic.findOne({ slug: 'dekiru-nihongo-so-cap' });

        if (!topic) {
            topic = await Topic.create({
                name: 'Dekiru Nihongo Sơ Cấp (Bài 1-4)',
                slug: 'dekiru-nihongo-so-cap',
                description: 'Từ vựng tiếng Nhật sơ cấp từ bài 1 đến bài 4 giáo trình Dekiru Nihongo'
            });
            console.log('✅ Đã tạo Topic mới:', topic.name);
        } else {
            console.log('ℹ️ Đã tìm thấy Topic:', topic.name);
        }

        // 2. Duyệt qua danh sách và lưu vào DB
        let successCount = 0;
        let errorCount = 0;

        for (const item of rawData) {
            try {
                // Kiểm tra xem từ đã tồn tại chưa để tránh trùng lặp
                // Logic: Upsert (Cập nhật nếu có, Tạo mới nếu chưa)

                const updateData = {
                    word: item.word,
                    // Chỉ set cefrLevel nếu tạo mới, không override nếu đã có logic khác
                    $setOnInsert: { cefrLevel: 'A1', popularityScore: 10 },
                    $addToSet: { topics: topic._id }, // Thêm topic ID vào mảng topics nếu chưa có
                    // Cập nhật partOfSpeech (Ghi đè hoặc thêm logic khác tùy bạn, ở đây mình ghi đè để đảm bảo đúng data mới)
                    partOfSpeech: [{
                        type: item.type,
                        pronunciation: item.reading,
                        meaning: item.meaning,
                        examples: [] // Có thể thêm ví dụ sau
                    }]
                };

                await Vocabulary.findOneAndUpdate(
                    { word: item.word },
                    updateData,
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );

                console.log(`Saved: ${item.word} (${item.meaning})`);
                successCount++;
            } catch (err) {
                console.error(`❌ Lỗi khi lưu từ "${item.word}":`, err.message);
                errorCount++;
            }
        }

        console.log('------------------------------------------------');
        console.log(`🏁 Hoàn tất Import.`);
        console.log(`✅ Thành công: ${successCount}`);
        console.log(`❌ Thất bại: ${errorCount}`);

    } catch (error) {
        console.error('CRITICAL ERROR:', error);
    } finally {
        await mongoose.disconnect();
        console.log('👋 Đã ngắt kết nối MongoDB');
    }
}

// Chạy hàm import
importData();