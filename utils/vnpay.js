const crypto = require('crypto');
const qs = require('querystring');

/** Sắp xếp params theo thứ tự alphabet (theo spec VNPAY) */
function sortObject(obj) {
    let sorted = {};
    let str = [];
    let key;
    for (key in obj){
        if (obj.hasOwnProperty(key)) {
            str.push(encodeURIComponent(key));
        }
    }
    str.sort();
    for (key = 0; key < str.length; key++) {
        sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, "+")
            .replace(/\(/g, "%28")  // ✅ Encode dấu (
            .replace(/\)/g, "%29");
    }
    return sorted;
}

/** Tạo vnp_SecureHash */
function signVnpay(params, secretKey) {
    // ✅ QUAN TRỌNG: Phải sort lại params
    const sortedParams = sortObject(params);

    // ✅ QUAN TRỌNG: Nối chuỗi thủ công thay vì dùng qs.stringify
    const signData = Object.keys(sortedParams)
        .map(key => `${key}=${sortedParams[key]}`)
        .join('&');
    console.log('🔐 Sign data:', signData);

    const hmac = crypto.createHmac('sha512', secretKey);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    console.log('✅ Generated hash:', signed);

    return signed;
}

module.exports = { sortObject, signVnpay };
