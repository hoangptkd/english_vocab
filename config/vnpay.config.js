module.exports = {
    vnp_TmnCode: process.env.VNP_TMN_CODE || 'FHP46VFG',
    vnp_HashSecret: process.env.VNP_HASH_SECRET || '32POXU8L2FVD9Z2AR6YLMUHHMMBOWPHI',
    vnp_Url: process.env.VNP_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    vnp_ReturnUrl: process.env.VNP_RETURN_URL || 'http://localhost:3000/api/payment/vnpay-return',
    vnp_Api: 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction'
};