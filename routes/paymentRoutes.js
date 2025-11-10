const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const qs = require('qs');
const crypto = require("crypto");
const moment = require('moment-timezone');
const Payment = require('../models/Payment');
const User = require('../models/User');
const { signVnpay, sortObject } = require('../utils/vnpay');
const {
    VNP_TMN_CODE, VNP_HASH_SECRET, VNP_URL,
    VNP_RETURN_URL, VNP_IPN_URL, VNP_LOCALE='vn'
} = process.env;
/**
 * 1) Tạo link thanh toán (Frontend gọi)
 * body: { userId, amountVND }
 */
router.post('/create-topup',paymentController.createPaymentUrl);

/**
 * 2) Return URL (user browser/webview redirect về) - xác minh hash
 * GET /api/payment/vnpay_return?... (các tham số vnp_*)
 * Lưu ý: dùng IPN để chốt đơn là tốt nhất; return để hiển thị UI kết quả cho user.
 */
router.get('/vnpay_return', paymentController.vnpayReturn);

/**
 * 3) IPN (Instant Payment Notification) - khuyến nghị dùng để CHỐT ĐƠN
 * GET /api/payment/vnpay_ipn?... (các tham số vnp_*)
 * Trả JSON theo spec VNPAY: RspCode/Message
 */
router.get('/vnpay_ipn', async (req, res) => {
    try {
        const vnpParams = { ...req.query };
        const secureHash = vnpParams.vnp_SecureHash;
        delete vnpParams.vnp_SecureHash;
        delete vnpParams.vnp_SecureHashType;

        const checkHash = signVnpay(vnpParams, VNP_HASH_SECRET);
        if (secureHash !== checkHash) {
            return res.json({ RspCode: '97', Message: 'Invalid Checksum' });
        }

        const orderId = vnpParams.vnp_TxnRef;
        const rspCode = vnpParams.vnp_ResponseCode; // '00' = success
        const isSuccess = rspCode === '00';

        const payment = await Payment.findOne({ orderId });
        if (!payment) return res.json({ RspCode: '01', Message: 'Order not found' });

        // Idempotent update
        if (payment.status === 'success') {
            return res.json({ RspCode: '00', Message: 'Order already confirmed' });
        }

        if (isSuccess) {
            payment.status = 'success';
            payment.vnp_TransactionNo = vnpParams.vnp_TransactionNo;
            payment.vnp_ResponseCode = rspCode;
            payment.rawQuery = qs.stringify(req.query);
            await payment.save();

            await User.updateOne(
                { _id: payment.user },
                { $inc: { totalPoints: payment.points }, $set: { updatedAt: new Date() } }
            );

            return res.json({ RspCode: '00', Message: 'Confirm Success' });
        } else {
            payment.status = 'failed';
            payment.vnp_ResponseCode = rspCode;
            payment.rawQuery = qs.stringify(req.query);
            await payment.save();
            return res.json({ RspCode: '00', Message: 'Confirm Failed' });
        }
    } catch (e) {
        console.error(e);
        return res.json({ RspCode: '99', Message: 'Unknown error' });
    }
});

module.exports = router;
