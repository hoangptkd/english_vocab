const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    orderId: { type: String, required: true, unique: true }, // vnp_TxnRef
    amountVND: { type: Number, required: true },             // số tiền theo VND
    points: { type: Number, required: true },                 // số point quy đổi
    status: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending' },
    vnp_TransactionNo: String,
    vnp_ResponseCode: String,
    rawQuery: String
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
