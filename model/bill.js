const mongoose = require('mongoose');

const billSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true }, 
    customeId: { type: String }, 
    paymentIntentId: { type: String }, 
    products: [{ 
        name: { type: String }, 
        price: { type: Number }, 
        discountedPrice: { type: Number },
        image: { type: String }, 
        size: { type: String }, 
        quantity: { type: Number }, 
    }],
    subtotal: { type: Number, required: true },
    total: { type: Number, required: true },
    discountPercent: { type: Number, default: 0 },
    discount: { type: Number, default: 0 }, 
    couponId: { type: String, default: null },
    shipping: { type: Object, required: true },

    phone: { type: String },
  payment_status: { 
    type: String, 
    enum: ['đã thanh toán'], 
    default: 'đã thanh toán'
  },
  order_status: {
    type: String,
    enum: ['đang chờ xử lý',  'đã vận chuyển', 'đã giao hàng','chưa giải quyết'],
    default: 'chưa giải quyết'
  },
    
}, { timestamps: true });


const Bill = mongoose.model('bills', billSchema);
module.exports = Bill;