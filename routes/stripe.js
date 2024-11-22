const express = require("express");
const app = express();
const mongoose = require('mongoose');
const jwt = require("jsonwebtoken");
const Stripe = require("stripe");
const bcrypt = require("bcryptjs"); 
require("dotenv").config();
const Bill = require("../model/bill")
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const { ObjectId } = require("mongodb");
const connectDb = require("../model/db");
app.use(express.static("."));
app.use(express.json());

var router = express.Router();

(async () => {
  try {
      const db = await connectDb(); // Kết nối đến MongoDB
      console.log("Kết nối đến cơ sở dữ liệu thành công");
  } catch (error) {
      console.error("Kết nối đến cơ sở dữ liệu thất bại:", error);
  }
})();


router.post("/create-checkout-session", async (req, res) => {
  const {email, userId, couponId } = req.body;

  // Kết nối cơ sở dữ liệu
  const db = await connectDb();
  const cartCollection = db.collection("cart");
  

  // Lấy giỏ hàng của người dùng từ MongoDB
  const userCart = await cartCollection.findOne({ userId: new ObjectId(userId) });

  

  if (!userCart || userCart.items.length === 0) {
    return res.status(404).json({ message: "Giỏ hàng trống" });
  }

  const customer = await stripe.customers.create({
    email: email,
    metadata: {
      userId: userId,
      cart: JSON.stringify(
        userCart.items.map(item => ({
          id: item.productId,
          name: item.name,
          image: item.image,
          size: item.size,
          quantity: item.quantity,
          price: item.price,  
          discountedPrice: item.discountedPrice,
        }))
      ),
    },
  });
  

  const line_items = userCart.items.map(item => {
    const price = item.discountedPrice ? item.discountedPrice : item.price;
    return {
      price_data: {
        currency: "usd",
        product_data: {
          name: item.name,
          images: [item.image],
          description: item.description,
          metadata: {
            id: item._id,
            size: item.size,
          },
        },
        unit_amount: price * 100, // Giá mỗi sản phẩm
      },
      quantity: item.quantity,
    };
  });

  const session = await stripe.checkout.sessions.create({
    shipping_address_collection: {
      allowed_countries: ["US", "VN"],
    },
    phone_number_collection: {
      enabled: true, // Bật trường nhập số điện thoại
    },
    shipping_options: [
      {
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: {
            amount: 0,
            currency: "usd",
          },
          display_name: "Free shipping",
          delivery_estimate: {
            minimum: { unit: "business_day", value: 5 },
            maximum: { unit: "business_day", value: 7 },
          },
        },
      },
      {
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: {
            amount: 1500,
            currency: "usd",
          },
          display_name: "Next day air",
          delivery_estimate: {
            minimum: { unit: "business_day", value: 1 },
            maximum: { unit: "business_day", value: 1 },
          },
        },
      },
    ],
    customer: customer.id,
    line_items,
    mode: "payment",
    discounts: couponId ? [{ coupon: couponId }] : [],
    success_url: `${process.env.CLIENT_URL}/checkout`,
    cancel_url: `${process.env.CLIENT_URL}/cart`,
  });

  res.send({ url: session.url });
});





// Create bill
const createBill = async (customer, data, couponId, discountAmount, couponName) => {
  const Items = customer.metadata.cart ? JSON.parse(customer.metadata.cart) : [];
  const email = customer.email;
  let phone = data.customer_details.phone;
  if (phone && phone.startsWith("+")) {
    phone = phone.replace(/^\+(\d{1,4})/, "0");
  }

  const subtotal = data.amount_subtotal; // Tổng trước giảm giá
  const discountPercentage = subtotal > 0 ? (discountAmount / subtotal) * 100 : 0;

  const newBill = new Bill({
    userId: new mongoose.Types.ObjectId(customer.metadata.userId),
    paymentIntentId: data.payment_intent,
    products: Items,
    email: email,
    subtotal: subtotal,
    total: data.amount_total,
    discountPercentage: discountPercentage.toFixed(2), // Phần trăm giảm giá
    couponId: couponId, // Lưu mã giảm giá
    shipping: data.customer_details,
    phone: phone,
    payment_status: "đã thanh toán",
    order_status: "chưa giải quyết",
  });

  try {
    const saveBill = await newBill.save();
    console.log("save bill:", saveBill);
  } catch (err) {
    console.error("Error saving bill:", err);
  }
};


// stripe webhooks


let endpointSecret ;
//  endpointSecret = "whsec_2012e3ef93473c4aff8dd580bc089e5cb45645845400148bed33242726171cf3";

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let data;
  let eventType;
  if (endpointSecret) {
    try {
      const event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
      console.log("Webhook verified successfully");
      data = event.data.object;
      eventType = event.type;
    } catch (err) {
      console.error(`Webhook Error: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  } else {
    data = req.body.data.object;
    eventType = req.body.type;
  }

  // Xử lý sự kiện "checkout.session.completed"
  if (eventType === "checkout.session.completed") {
    try {
      // Lấy thông tin khách hàng từ Stripe
      const customer = await stripe.customers.retrieve(data.customer);
      console.log("Retrieved customer:", customer);
      console.log("Session data:", JSON.stringify(data, null, 2));
      
      // Lấy thông tin giảm giá từ webhook
      const discounts = data.discounts || [];
      let couponId = null;
      let discountPercentage = 0;

      // Kiểm tra nếu có giảm giá
      if (discounts.length > 0 && discounts[0].coupon) {
        couponId = discounts[0].coupon.id; // ID của coupon
        discountPercentage = discounts[0].coupon.percent_off || 0; // Phần trăm giảm giá
      }
      
      // Lấy metadata từ phiên thanh toán
      const userId = customer.metadata.userId;

      // Kết nối tới MongoDB
      const db = await connectDb();
      const cartCollection = db.collection("cart");

      // Xóa giỏ hàng của người dùng
      const result = await cartCollection.deleteOne({ userId: new ObjectId(userId) });

      if (result.deletedCount > 0) {
        console.log(`Cart for user ${userId} has been deleted successfully`);
      } else {
        console.warn(`No cart found for user ${userId}`);
      }

      // (Tùy chọn) Gọi hàm `createBill` để tạo hóa đơn
      const discountAmount = data.total_details?.amount_discount || 0;
      
      createBill(customer, data, couponId, discountAmount);
    } catch (err) {
      console.error("Error processing checkout.session.completed:", err.message);
    }
  }

  // Trả về trạng thái 200 để Stripe biết webhook đã được xử lý
  res.status(200).end();
});
// --------------------------------------------------------------- mã giảm giá

router.post("/apply-coupon", async (req, res) => {
  const { couponCode, totalAmount } = req.body; // totalAmount in dollars

  try {
    // Kiểm tra mã giảm giá với Stripe
    const coupon = await stripe.coupons.retrieve(couponCode);

    // Kiểm tra xem mã giảm giá có hợp lệ không và chưa hết hạn
    if (!coupon || (coupon.redeem_by && new Date(coupon.redeem_by * 1000) < new Date())) {
      return res.status(400).json({ valid: false, message: "Mã giảm giá không hợp lệ hoặc đã hết hạn." });
    }

    // Tính toán giá trị giảm giá dựa trên phần trăm
    const discountAmount = totalAmount * (coupon.percent_off / 100); // Calculate the discount in dollars
    const discountInCents = Math.round(discountAmount * 100); // Convert to cents

    // Tính toán tổng tiền sau khi áp dụng giảm giá
    const totalInCents = Math.round(totalAmount * 100); // Convert total to cents
    const finalAmount = totalInCents - discountInCents;

    res.status(200).json({
      valid: true,
      discountDetails: {
        couponId: coupon.id,
        discountType: "percent",
        discountValue: discountInCents / 100, // Convert back to dollars for display
        finalAmount: finalAmount / 100, // Convert final amount to dollars for display
      },
    });
  } catch (error) {
    console.error("Error applying coupon:", error);
    res.status(500).json({ valid: false, message: "Có lỗi xảy ra khi xử lý mã giảm giá." });
  }
});






// --------------------------------------------------------------- Hiển Thị hóa đơn của admin

router.get('/admin/orders', async (req, res) => {
  try {
    const bills = await Bill.find({})
    .sort({ createdAt: -1 });  // Lấy tất cả hóa đơn
    res.status(200).json(bills);
  } catch (err) {
    console.error("Error fetching all bills:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get('/admin/orders/:orderId', async (req, res) => {
  const { orderId } = req.params;

  try {
    const order = await Bill.findById(orderId); 
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    res.status(200).json(order);
  } catch (err) {
    console.error('Error fetching order details:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


router.put('/admin/orders/:orderId', async (req, res) => {
  const { orderId } = req.params;
  const { order_status } = req.body;  // Lấy trạng thái mới từ body request
  
  // Kiểm tra trạng thái đơn hàng hợp lệ
  if (!['chưa giải quyết', 'đã vận chuyển', 'đã giao hàng', 'đã hủy bỏ'].includes(order_status)) {
    return res.status(400).json({ message: "Invalid order status" });
  }

  try {
    const updatedBill = await Bill.findByIdAndUpdate(
      orderId,
      { order_status },  // Cập nhật trạng thái giao hàng
      { new: true }       // Trả về bản ghi mới sau khi cập nhật
    );
    
    if (!updatedBill) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.status(200).json(updatedBill);
  } catch (err) {
    console.error("Error updating order status:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get('/adminpay/orders', async (req, res) => {
  const { payment_status, order_status } = req.query;  // Lấy các tham số từ query string

  let filter = {};  // Filter mặc định là tất cả hóa đơn

  if (payment_status) {
    filter.payment_status = payment_status;  // Lọc theo trạng thái thanh toán
  }

  if (order_status) {
    filter.order_status = order_status;  // Lọc theo trạng thái đơn hàng
  }

  try {
    const bills = await Bill.find(filter);  // Lấy hóa đơn theo điều kiện lọc
    res.status(200).json(bills);
  } catch (err) {
    console.error("Error fetching bills:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// --------------------------------------------------------------- Hiển Thị hóa đơn của người dùng



router.get("/orderuser/:userId", async (req, res) => {
  const userId = req.params.userId;
  try {
    const db = await connectDb(); 
    const ordersCollection = db.collection("bills");
    const orders = await ordersCollection.find({ userId: new ObjectId(userId) }).toArray();
    res.status(200).json(orders);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ message: "Server error" });
  }
});
router.get("/orders/:orderId", async (req, res) => {
  const orderId = req.params.orderId;
  try {
    const db = await connectDb(); 
    const ordersCollection = db.collection("bills");
    const order = await ordersCollection.findOne({ _id: new ObjectId(orderId) });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.status(200).json(order);
  } catch (error) {
    console.error("Error fetching order details:", error);
    res.status(500).json({ message: "Server error" });
  }
});





module.exports = router;