// controllers/paymentController.js
const os = require('os');

const qs = require('qs');
const crypto = require("crypto");
const moment = require('moment-timezone');
const { signVnpay, sortObject } = require('../utils/vnpay');
const Payment = require('../models/Payment');
const User = require('../models/User');
const {
    VNP_TMN_CODE, VNP_HASH_SECRET, VNP_URL,
    VNP_RETURN_URL, VNP_IPN_URL, VNP_LOCALE='vn'
} = process.env;

function getLocalIPv4() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

class PaymentController {

    // Tạo URL thanh toán
    async createPaymentUrl(req, res) {
        try {
            const { userId, amountVND } = req.body;
            if (!userId || !amountVND || amountVND <= 0) {
                return res.status(400).json({ message: 'userId/amountVND invalid' });
            }
            let vnpUrl = VNP_URL;
            const localIP = getLocalIPv4();
            const port = process.env.PORT || 3000;
            const vnpReturnUrl = `http://${localIP}:${port}/api/payment/vnpay_return`;
            const vnpIpnUrl = `http://${localIP}:${port}/api/payment/vnpay_ipn`;
            // Tạo đơn top-up pending
            let date = new Date();
            const timestamp = Date.now();
            const orderId = `TOPUP_${timestamp}_${userId.slice(-8)}`;
            const points = amountVND;
            await Payment.create({ user: userId, orderId, amountVND, points, status: 'pending' });

            // Build tham số VNPAY
            let createDate = moment(date).format('YYYYMMDDHHmmss');

            const expireDate = moment().add(15, 'minutes').format('YYYYMMDDHHmmss');
            let ipAddr = req.headers['x-forwarded-for'] ||
                req.connection.remoteAddress ||
                req.socket.remoteAddress ||
                req.connection.socket.remoteAddress || '127.0.0.1';

            let vnp_Params = {
                vnp_Version: '2.1.0',
                vnp_Command: 'pay',
                vnp_TmnCode: VNP_TMN_CODE,
                vnp_Amount: amountVND * 100,            // VNP yêu cầu *100
                vnp_CurrCode: 'VND',
                vnp_TxnRef: orderId,
                vnp_OrderInfo: `Nap tien user ${userId}, order ${orderId}`,
                vnp_OrderType: 'other',                  // tùy business
                vnp_Locale: VNP_LOCALE,
                vnp_ReturnUrl: vnpReturnUrl,
                vnp_IpAddr: ipAddr,
                vnp_CreateDate: createDate,
                vnp_ExpireDate: expireDate
            };
            // const bankCodeMap = { qr: 'VNPAYQR', atm: 'VNBANK', int: 'INTCARD' };
            // const vnp_BankCode = bankCodeMap[req.body.method];
            // if (vnp_BankCode) vnp_Params.vnp_BankCode = vnp_BankCode;

            vnp_Params = sortObject(vnp_Params);

            let signData = qs.stringify(vnp_Params, { encode: false });
            let hmac = crypto.createHmac("sha512", VNP_HASH_SECRET);
            let signed = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex");

            vnp_Params['vnp_SecureHash'] = signed;
            vnpUrl += '?' + qs.stringify(vnp_Params, { encode: true });

            res.json({ vnpUrl, orderId, amountVND, points });
        } catch (e) {
            console.error(e);
            res.status(500).json({ message: 'create-topup error' });
        }
    }

    // Xử lý callback từ VNPay
    async vnpayReturn(req, res) {
        try {
            console.log('📦 All query params:', req.query);
            const vnpParams = { ...req.query };
            const secureHash = vnpParams.vnp_SecureHash;
            delete vnpParams.vnp_SecureHash;
            delete vnpParams.vnp_SecureHashType;

            console.log('📦 Params for verification:', vnpParams);
            console.log('🔐 Received hash:', secureHash);
            // ✅ Tính hash từ params đã sort
            const checkHash = signVnpay(vnpParams, VNP_HASH_SECRET);
            console.log('✅ Computed hash:', checkHash);
            console.log('🎯 Hash match:', secureHash === checkHash);
            if (secureHash !== checkHash) {
                return res.status(400).send('Invalid checksum');
            }

            const orderId = vnpParams.vnp_TxnRef;
            // Lấy Payment
            const payment = await Payment.findOne({ orderId }).populate('user');
            if (!payment) return res.status(404).send('Payment not found');

            // Nếu VNP trả mã thành công (thường '00'), cập nhật trạng thái & cộng điểm (idempotent)
            const isSuccess = vnpParams.vnp_ResponseCode === '00';
            if (isSuccess && payment.status !== 'success') {
                payment.status = 'success';
                payment.vnp_TransactionNo = vnpParams.vnp_TransactionNo;
                payment.vnp_ResponseCode = vnpParams.vnp_ResponseCode;
                payment.rawQuery = qs.stringify(req.query);
                await payment.save();

                // Cộng points (idempotent)
                const updatedUser = await User.findByIdAndUpdate(
                    payment.user._id,
                    {
                        $inc: { totalPoints: payment.points },
                        $set: { updatedAt: new Date() }
                    },
                    { new: true } // ✅ trả về document sau khi update
                );

                // 🔥 GỬI WEBSOCKET NOTIFICATION
                const io = req.app.get('io');
                if (io) {
                    const userId = payment.user._id.toString();
                    console.log('💬 Sending WebSocket to user:', userId);

                    // Gửi tới room của user cụ thể
                    io.to(userId).emit('payment:success', {
                        orderId: payment.orderId,
                        pointsAdded: payment.points,
                        totalPoints: updatedUser.totalPoints,
                        amountVND: payment.amountVND,
                        timestamp: new Date().toISOString(),
                        message: `Bạn đã nạp thành công ${payment.points} điểm!`
                    });

                    console.log('✅ WebSocket sent successfully');
                }
            } else if (!isSuccess && payment.status === 'pending') {
                payment.status = 'failed';
                payment.vnp_ResponseCode = vnpParams.vnp_ResponseCode;
                payment.rawQuery = qs.stringify(req.query);
                await payment.save();

                // 🔥 GỬI WEBSOCKET CHO TRƯỜNG HỢP THẤT BẠI
                const io = req.app.get('io');
                if (io) {
                    const userId = payment.user._id.toString();
                    io.to(userId).emit('payment:failed', {
                        orderId: payment.orderId,
                        message: 'Thanh toán thất bại. Vui lòng thử lại.',
                        timestamp: new Date().toISOString()
                    });
                }
            }

            // Hiển thị kết quả đơn giản (có thể redirect về app)
            return res.send(isSuccess ? 'Thanh toán thành công. Points đã được cộng!' : 'Thanh toán thất bại.');
        } catch (e) {
            console.error(e);
            res.status(500).send('Return handler error');
        }
    }

    // Kiểm tra trạng thái thanh toán
    async checkPaymentStatus(req, res) {
        try {
            const { orderId } = req.params;

            const payment = await Payment.findOne({ orderId });

            if (!payment) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy đơn hàng'
                });
            }

            res.status(200).json({
                success: true,
                data: payment
            });

        } catch (error) {
            console.error('Error checking payment status:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi kiểm tra trạng thái',
                error: error.message
            });
        }
    }
}

module.exports = new PaymentController();