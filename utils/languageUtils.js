// utils/languageUtils.js

export const detectLanguage = (text) => {
    if (!text) return 'en-US';

    // Regex kiểm tra ký tự tiếng Nhật:
    // \u3000-\u303f: Dấu câu Nhật
    // \u3040-\u309f: Hiragana
    // \u30a0-\u30ff: Katakana
    // \u4e00-\u9faf: Kanji (Common)
    // \u3400-\u4dbf: Kanji (Extension A)
    const japaneseRegex = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/;

    return japaneseRegex.test(text) ? 'ja-JP' : 'en-US';
};