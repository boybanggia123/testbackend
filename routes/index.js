const functions = require("firebase-functions");
const express = require("express");
var router = express.Router();
const cors = require("cors");
const app = express();
app.use(cors());
const nodemailer = require("nodemailer");
const connectDb = require("../model/db");
const { ObjectId } = require("mongodb");
const bcrypt = require("bcryptjs");
const multer = require('multer');
const crypto = require('crypto');

//-----------------------------------------------Upload img--------------------------------------------------------
//Thiết lập nơi lưu trữ và tên file
let storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, '')
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname)
  }
})
//Kiểm tra file upload
function checkFileUpLoad(req, file, cb){
  if(!file.originalname.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)){
    return cb(new Error('Bạn chỉ được upload file ảnh'));
  }
  cb(null, true);
  }
  //Upload file
  let upload = multer({ storage: storage, fileFilter: checkFileUpLoad });
//-----------------------------------------------end Upload img--------------------------------------------------------
//-------------------------------------------------BÌNH LUẬN VÀ ĐÁNH GIÁ--------------------------------------------------------------
// Thêm bình luận và đánh giá cho sản phẩm
router.post("/productdetail/:id/review", async (req, res, next) => {
  const { userId, rating, comment } = req.body;
  const productId = new ObjectId(req.params.id);

  // Kiểm tra dữ liệu hợp lệ
  if (!userId || !rating || !comment) {
    return res.status(400).json({ message: "Thiếu thông tin đánh giá" });
  }

  // Kiểm tra rating có hợp lệ (từ 1 đến 5)
  if (rating < 1 || rating > 5) {
    return res.status(400).json({ message: "Rating phải từ 1 đến 5" });
  }

  const db = await connectDb();
  const productCollection = db.collection("products");

  // Lấy sản phẩm từ database
  const product = await productCollection.findOne({ _id: productId });
  if (!product) {
    return res.status(404).json({ message: "Không tìm thấy sản phẩm" });
  }

  // Tạo đối tượng bình luận
  const review = {
    userId: new ObjectId(userId),
    rating,
    comment,
    createdAt: new Date(),
  };

  // Cập nhật sản phẩm với bình luận mới
  const updateResult = await productCollection.updateOne(
    { _id: productId },
    { $push: { reviews: review } }
  );

  if (updateResult.modifiedCount > 0) {
    res.status(200).json({ message: "Bình luận và đánh giá đã được thêm thành công" });
  } else {
    res.status(500).json({ message: "Không thể thêm bình luận và đánh giá" });
  }
});
// Lấy tất cả bình luận và đánh giá của sản phẩm
router.get("/productdetail/:id/reviews", async (req, res, next) => {
  const productId = new ObjectId(req.params.id);

  const db = await connectDb();
  const productCollection = db.collection("products");

  // Lấy sản phẩm từ database
  const product = await productCollection.findOne({ _id: productId });
  if (!product) {
    return res.status(404).json({ message: "Không tìm thấy sản phẩm" });
  }

  // Trả về các bình luận và đánh giá của sản phẩm
  const reviews = product.reviews;

  if (reviews && reviews.length > 0) {
    res.status(200).json(reviews);
  } else {
    res.status(404).json({ message: "Không có đánh giá cho sản phẩm này" });
  }
});


//-----------------------------------------------END ĐÁNH GIÁ VÀ BÌNH LUẬN-----------------------------------------------------------

//Lấy tất cả sản phẩm dạng json
router.get("/products", async (req, res, next) => {
  const db = await connectDb();
  const productCollection = db.collection("products");
  const products = await productCollection.find().toArray();
  if (products) {
    res.status(200).json(products);
  } else {
    res.status(404).json({ message: "Không tìm thấy" });
  }
});
//lấy sản phẩm hot
router.get("/hot", async (req, res, next) => {
  try {
    const db = await connectDb();
    const productCollection = db.collection("products");

    const products = await productCollection
      .find({ hot: true })
      .limit(4)
      .toArray();

    if (products.length > 0) {
      res.status(200).json(products);
    } else {
      res.status(404).json({ message: "Không tìm thấy sản phẩm hot" });
    }
  } catch (error) {
    console.error("Error fetching products:", error);
    next(error);
  }
});
// tìm kiếm sản phẩm 
router.get('/search', async function (req, res, next) {
  try {
    const searchKey = req.query.key;
    if (!searchKey) {
      return res.status(400).json({ message: 'Search key is required' });
    }
    const db = await connectDb();
    const productCollection = db.collection('products');
    const regex = new RegExp(searchKey, 'i');
    const products = await productCollection
      .find({
        $or: [{ name: { $regex: regex } }, { description: { $regex: regex } }],
      })
      .toArray();

    if (products.length > 0) {
      res.status(200).json(products);
    } else {
      res.status(404).json({ message: 'No products found' });
    }
  } catch (error) {
    next(error);
  }
});
// lấy sản phẩm mới
router.get("/new", async (req, res, next) => {
  try {
    const db = await connectDb();
    const productCollection = db.collection("products");

    // Lấy ngày hiện tại và ngày cách đây 30 ngày
    const today = new Date();
    const pastDate = new Date();
    pastDate.setDate(today.getDate() - 30);

    // Tìm các sản phẩm có `dayadd` nằm trong khoảng 30 ngày gần đây
    const products = await productCollection
      .find({ dayadd: { $gte: pastDate } })

      .toArray();

    if (products.length > 0) {
      res.status(200).json(products);
    } else {
      res.status(404).json({ message: "Không tìm thấy sản phẩm mới" });
    }
  } catch (error) {
    console.error("Error fetching new products:", error);
    next(error);
  }
});
// lấy sản phẩm theo danh mục
router.get("/products/:categoryId", async (req, res, next) => {
  try {
    const { categoryId } = req.params;
    const db = await connectDb();
    const productCollection = db.collection("products");
    const query = { categoryId: ObjectId.isValid(categoryId) ? new ObjectId(categoryId) : categoryId };
    const products = await productCollection.find(query).toArray();
    if (products.length > 0) {
      res.status(200).json(products);
    } else {
      res.status(404).json({ message: "Không tìm thấy sản phẩm cho danh mục này" });
    }
  } catch (error) {
    console.error("Error fetching products by categoryId:", error);
    next(error);
  }
});

// Lấy danh sách danh mục
router.get("/categories", async (req, res, next) => {
  try {
    const db = await connectDb(); // Sử dụng connectDb để kết nối với cơ sở dữ liệu
    const categoryCollection = db.collection("categories");
    const categories = await categoryCollection.find().toArray();
    if (categories.length > 0) {
      res.status(200).json(categories);
    } else {
      res.status(404).json({ message: "Không có danh mục nào" });
    }
  } catch (error) {
    next(error);
  }
});

//Lấy danh mục taikhoan
router.get("/users", async (req, res, next) => {
  const db = await connectDb();
  const userCollection = db.collection("users");
  const users = await userCollection.find().toArray();
  if (users) {
    res.status(200).json(users);
  } else {
    res.status(404).json({ message: "Không tìm thấy" });
  }
});
//Kiểm tra token qua Bearer
router.get("/checktoken", async (req, res, next) => {
  const token = req.headers.authorization.split(" ")[1];
  jwt.verify(token, "secret", (err, user) => {
    if (err) {
      return res.status(401).json({ message: "Token không hợp lệ" });
    }
    res.status(200).json({ message: "Token hợp lệ" });
  });
});

//lấy chi tiết 1 sản phẩm
router.get("/productdetail/:id", async (req, res, next) => {
  let id = new ObjectId(req.params.id);
  const db = await connectDb();
  const productCollection = db.collection("products");
  const product = await productCollection.findOne({ _id: id });
  if (product) {
    res.status(200).json(product);
  } else {
    res.status(404).json({ message: "Không tìm thấy" });
  }
});





// ----------------------------------------------USER--------------------------------------------------------------
// ------------------------------------------------CART----------------------------------------------------------
// Thêm sản phẩm vào giỏ hàng
router.post("/cart", async (req, res, next) => {
    const { userId, productId, quantity, size } = req.body;
    // Kiểm tra dữ liệu hợp lệ
    if (!userId || !productId || !quantity || !size) {
      return res.status(400).json({ message: "Thiếu thông tin giỏ hàng" });
    }
    // Kiểm tra số lượng phải lớn hơn 0
    if (quantity <= 0) {
      return res.status(400).json({ message: "Số lượng phải lớn hơn 0" });
    }
    const db = await connectDb();
    const cartCollection = db.collection("cart");
    const productCollection = db.collection("products");
    // Lấy thông tin sản phẩm từ collection products
    const product = await productCollection.findOne({ _id: new ObjectId(productId) });
    if (!product) {
      return res.status(404).json({ message: "Sản phẩm không tồn tại" });
    }

    // Thông tin sản phẩm cần lưu vào giỏ hàng, bao gồm tên, giá, và giá đã giảm
    const productInfo = {
      productId: new ObjectId(productId),
      image: product.image,
      name: product.name,         // Thêm tên sản phẩm
      price: product.price,       // Thêm giá sản phẩm
      discountedPrice: product.discountedPrice || product.price, // Thêm giá đã giảm (nếu có)
      size: size,
      quantity: quantity,
    };

    const existingCart = await cartCollection.findOne({ userId: new ObjectId(userId) });

    if (existingCart) {
      // Kiểm tra xem sản phẩm đã có trong giỏ hàng chưa
      const productIndex = existingCart.items.findIndex(item => 
        item.productId.toString() === productId && item.size === size
      );
      
      if (productIndex !== -1) {
        // Nếu có, cập nhật số lượng
        existingCart.items[productIndex].quantity += quantity;
        await cartCollection.updateOne(
          { userId: new ObjectId(userId) },
          { $set: { items: existingCart.items } }
        );
        return res.status(200).json({ message: "Cập nhật sản phẩm trong giỏ hàng thành công" });
      } else {
        // Nếu không có, thêm sản phẩm mới vào giỏ hàng
        existingCart.items.push(productInfo);
        await cartCollection.updateOne(
          { userId: new ObjectId(userId) },
          { $set: { items: existingCart.items } }
        );
        return res.status(200).json({ message: "Thêm sản phẩm vào giỏ hàng thành công" });
      }
    } else {
      // Nếu không có giỏ hàng, tạo mới giỏ hàng cho người dùng
      const newCart = {
        userId: new ObjectId(userId),
        items: [productInfo],
      };
      await cartCollection.insertOne(newCart);
      return res.status(201).json({ message: "Tạo giỏ hàng mới và thêm sản phẩm thành công" });
    }
});
// Lấy giỏ hàng của người dùng
router.get("/cart/:userId", async (req, res, next) => {
    const userId = req.params.userId;
    const db = await connectDb();
    const cartCollection = db.collection("cart");
    const cart = await cartCollection.findOne({ userId: new ObjectId(userId) });
    
    if (cart) {
      res.status(200).json(cart.items);
    } else {
      res.status(404).json({ message: "Không tìm thấy giỏ hàng cho người dùng này" });
    }
});
// Xóa sản phẩm khỏi giỏ hàng
router.delete("/cart", async (req, res, next) => {
  const {userId, productId, size } = req.body; // lấy thông tin sản phẩm và size từ body

  // Kiểm tra dữ liệu hợp lệ
  if (!userId ||!productId || !size) {
      return res.status(400).json({ message: "Thiếu thông tin sản phẩm hoặc kích thước" });
  }

  const db = await connectDb();
  const cartCollection = db.collection("cart");

  // Tìm giỏ hàng của người dùng
  const existingCart = await cartCollection.findOne({ userId: new ObjectId(userId) });

  if (existingCart) {
      // Tìm sản phẩm trong giỏ hàng
      const productIndex = existingCart.items.findIndex(item => 
          item.productId.toString() === productId && item.size === size
      );

      if (productIndex !== -1) {
          // Xóa sản phẩm nếu tìm thấy
          existingCart.items.splice(productIndex, 1);
          await cartCollection.updateOne(
              { userId: new ObjectId(userId) },
              { $set: { items: existingCart.items } }
          );

          return res.status(200).json({ message: "Xóa sản phẩm khỏi giỏ hàng thành công" });
      } else {
          return res.status(404).json({ message: "Sản phẩm không tồn tại trong giỏ hàng" });
      }
  } else {
      return res.status(404).json({ message: "Không tìm thấy giỏ hàng cho người dùng này" });
  }
});

router.delete("/carts/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const db = await connectDb();
    const cartCollection = db.collection("cart");

    // Xóa giỏ hàng của người dùng
    const result = await cartCollection.deleteOne({ userId: new ObjectId(userId) });

    if (result.deletedCount === 1) {
      res.status(200).json({ message: "Đã xóa giỏ hàng thành công." });
    } else {
      res.status(404).json({ message: "Không tìm thấy giỏ hàng để xóa." });
    }
  } catch (error) {
    console.error("Error deleting cart:", error);
    res.status(500).json({ message: "Lỗi khi xóa giỏ hàng." });
  }
});


// ------------------------------------------------END CART-----------------------------------------------------------
// Đăng nhập
const jwt = require("jsonwebtoken");
router.post("/login", async (req, res, next) => {
  try {
    const db = await connectDb();
    const userCollection = db.collection("users");
    const { email, password } = req.body;

    // Kiểm tra nếu thiếu trường email hoặc password
    if (!email || !password) {
      return res.status(400).json({ message: "Vui lòng nhập email và mật khẩu" });
    }

    // Kiểm tra người dùng
    const user = await userCollection.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "Email không tồn tại" });
    }

    // Kiểm tra mật khẩu
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).json({ message: "Mật khẩu không chính xác" });
    }

    // Tạo token với thông tin người dùng
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role, fullname: user.fullname },
      process.env.JWT_SECRET || "secret", // Sử dụng biến môi trường cho JWT_SECRET
      { expiresIn: "1h" }
    );

    // Trả về token và các thông tin cần thiết khác
    res.status(200).json({
      token,
      user: {
        userId: user._id,
        email: user.email,
        fullname: user.fullname,
        role: user.role,
      },
      message: "Đăng nhập thành công",
    });
  } catch (error) {
    console.error("Đã xảy ra lỗi khi đăng nhập:", error);
    res.status(500).json({ message: "Đã xảy ra lỗi khi đăng nhập" });
  }
});



//lấy chi tiết 1 tài khoản
router.get('/userdetail/:id', async(req, res, next)=> {
  let id = new ObjectId(req.params.id);
  const db = await connectDb();
  const userCollection = db.collection('users');
  const user = await userCollection.findOne({_id:id});
  if(user){
    res.status(200).json(user);
  }else{
    res.status(404).json({message : "Không tìm thấy"})
  }
}
);

//lấy thông tin chi tiết user qua token
router.get("/detailuser", async (req, res, next) => {
  const token = req.headers.authorization.split(" ")[1];
  jwt.verify(token, "secret", async (err, user) => {
    if (err) {
      return res.status(401).json({ message: "Token không hợp lệ" });
    }
    const db = await connectDb();
    const userCollection = db.collection("users");
    const userInfo = await userCollection.findOne({ email: user.email });
    if (userInfo) {
      res.status(200).json(userInfo);
    } else {
      res.status(404).json({ message: "Không tìm thấy user" });
    }
  });
});


// ----------------------------------------------Quên mật khẩu--------------------------------------------------------------//

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "fashionverse112@gmail.com",  // Thay bằng email của bạn
    pass: "xczyubpahutsqivm",   // Mật khẩu email của bạn
  },
});

router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  console.log("Email nhận được từ client:", email);

  // Kiểm tra xem email có tồn tại trong cơ sở dữ liệu không
  const db = await connectDb();
  const userCollection = db.collection("users");
  const user = await userCollection.findOne({ email });
  console.log(user);

  if (!user) {
    return res.status(404).json({ message: "Email không tồn tại" });
  }

  // Tạo mã OTP (hoặc token để bảo mật)
  const otp = Math.floor(100000 + Math.random() * 900000);  // Mã OTP 6 chữ số

  // Gửi mã OTP qua email
  const mailOptions = {
    from: "fashionverse112@gmail.com",
    to: email,
    subject: "Mã OTP đặt lại mật khẩu",
    html: `<p>Mã OTP của bạn là: <strong>${otp}</strong></p>`,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log("Error:", error);
      return res.status(500).json({ message: "Có lỗi xảy ra khi gửi email" });
    } else {
      // Lưu mã OTP tạm thời trong cơ sở dữ liệu hoặc bộ nhớ tạm
      // Ví dụ: bạn có thể lưu trong một bảng riêng hoặc bộ nhớ tạm để so sánh khi người dùng nhập mã
      userCollection.updateOne({ email }, { $set: { otp } });

      res.status(200).json({ message: "Mã OTP đã được gửi đến email của bạn" });
    }
  });
});


// Endpoint kiểm tra mã OTP
router.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;

  // Kiểm tra xem email có tồn tại trong cơ sở dữ liệu không
  const db = await connectDb();
  const userCollection = db.collection("users");
  const user = await userCollection.findOne({ email });

  if (!user) {
    return res.status(404).json({ message: "Email không tồn tại" });
  }

  // Kiểm tra mã OTP
  if (user.otp !== parseInt(otp, 10)) {
    return res.status(400).json({ message: "Mã OTP không chính xác" });
  }

  // Nếu mã OTP hợp lệ, cho phép thay đổi mật khẩu
  res.status(200).json({ message: "Mã OTP hợp lệ. Bạn có thể thay đổi mật khẩu." });
});

// Endpoint thay đổi mật khẩu
router.post("/reset-password", async (req, res) => {
  const { email, newPassword } = req.body;

  // Kiểm tra xem email có tồn tại trong cơ sở dữ liệu không
  const db = await connectDb();
  const userCollection = db.collection("users");
  const user = await userCollection.findOne({ email });

  if (!user) {
    return res.status(404).json({ message: "Email không tồn tại" });
  }

  // Mã hóa mật khẩu mới trước khi lưu vào cơ sở dữ liệu
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  // Cập nhật mật khẩu mới cho người dùng
  await userCollection.updateOne({ email }, { $set: { password: hashedPassword, otp: null } });

  res.status(200).json({ message: "Mật khẩu đã được thay đổi thành công" });
});




// ----------------------------------------------Quên mật khẩu--------------------------------------------------------------//

// Đăng ký
router.post("/register", upload.single('avatar'), async (req, res) => {
  const db = await connectDb();
  const userCollection = db.collection("users");
  const { fullname, email, phone, password, dateOfBirth } = req.body;


  // Kiểm tra và cập nhật avatar nếu có file được tải lên
  let avatar = req.file ? req.file.filename : null; // Nếu có file ảnh thì lưu tên file avatar



  // Lấy thời gian hiện tại cho trường createdAt
  const createdAt = new Date(); // Thời gian hiện tại


  try {
    const user = await userCollection.findOne({ email });
    if (user) {
      return res.status(400).json({ message: "Email đã tồn tại" });
    }

    // Mã hóa mật khẩu
    const hashPassword = await bcrypt.hash(password, 10);

    const newUser = {
      avatar,
      fullname,
      email,
      phone,
      dateOfBirth,
      password: hashPassword,
      role: "user", // Mặc định là "user"
      createdAt, // Thêm trường createdAt
    };

    // Thêm người dùng vào cơ sở dữ liệu
    const result = await userCollection.insertOne(newUser);
    if (result.insertedId) {
      res.status(200).json({ message: "Đăng ký thành công" });
    } else {
      res.status(500).json({ message: "Đăng ký thất bại" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Có lỗi xảy ra, vui lòng thử lại" });
  }
});


router.put('/updateuser/:id', upload.single('avatar'), async (req, res, next) => {
  console.log(req.file); // Kiểm tra xem file có nhận đúng không
  console.log(req.body); // Kiểm tra các dữ liệu khác
  
  const db = await connectDb();
  const userCollection = db.collection('users');
  const id = new ObjectId(req.params.id);

  try {
    // Lấy thông tin tài khoản hiện tại từ database
    const existingUser = await userCollection.findOne({ _id: id });
    if (!existingUser) {
      return res.status(404).json({ message: "Không tìm thấy tài khoản" });
    }

    // Chuẩn bị đối tượng updatedUser với dữ liệu mới hoặc dữ liệu cũ nếu không có dữ liệu mới
    const { fullname, email, phone, address, createdAt, role, dateOfBirth, password } = req.body;
    let updatedUser = {
      avatar: existingUser.avatar, // Giữ avatar cũ nếu không có file ảnh mới
      fullname: fullname || existingUser.fullname,
      email: email || existingUser.email,
      phone: phone || existingUser.phone,
      address: address || existingUser.address,
      createdAt: createdAt || existingUser.createdAt,
      role: role || existingUser.role,
      dateOfBirth: dateOfBirth || existingUser.dateOfBirth,
      password: password || existingUser.password
    };

    // Cập nhật ảnh avatar nếu có file mới
    if (req.file) {
      updatedUser.avatar = req.file.originalname; // Cập nhật avatar mới với tên file của ảnh đã upload
    }

    // Thực hiện cập nhật vào database
    const result = await userCollection.updateOne({ _id: id }, { $set: updatedUser });
    if (result.matchedCount) {
      res.status(200).json({ message: "Sửa tài khoản thành công" });
    } else {
      res.status(404).json({ message: "Không tìm thấy tài khoản" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Có lỗi xảy ra, vui lòng thử lại" });
  }
});





// Thêm tài khoản
router.post("/adduser", upload.single('avatar'), async (req, res) => {
  const db = await connectDb();
  const userCollection = db.collection("users");
  const { fullname, email, phone, address, createdAt, role, dateOfBirth, password } = req.body;
  // Kiểm tra và cập nhật avatar nếu có file được tải lên
  let avatar = req.file ? req.file.filename : null; // Sử dụng filename để lưu vào DB
  try {
    const user = await userCollection.findOne({ email });
    if (user) {
      return res.status(400).json({ message: "Email đã tồn tại" });
    }
    const hashPassword = await bcrypt.hash(password, 10);
    const newUser = {
      avatar,
      fullname,
      email,
      phone,
      address,
      createdAt,
      role: role || "user", // Mặc định là "user" nếu không có role
      dateOfBirth,
      password: hashPassword,
    };

    // Thêm người dùng vào cơ sở dữ liệu
    const result = await userCollection.insertOne(newUser);
    if (result.insertedId) {
      res.status(200).json({ message: "Thêm tài khoản thành công" });
    } else {
      res.status(500).json({ message: "Thêm tài khoản thất bại" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Có lỗi xảy ra, vui lòng thử lại" });
  }
});

//xoa user
router.delete('/deleteuser/:id', async (req, res, next) => {
  const db = await connectDb();
  const userCollection = db.collection('users');
  const id = new ObjectId(req.params.id);
  try {
    const result = await userCollection.deleteOne({ _id: id });
    if (result.deletedCount) {
      res.status(200).json({ message: "Xóa tài khoản thành công" });
    } else {
      res.status(404).json({ message: "Không tìm thấy tài khoản" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Có lỗi xảy ra, vui lòng thử lại" });
  }
});

// ----------------------------------------------END USER--------------------------------------------------------------



// ----------------------------------------------START USERINFO--------------------------------------------------------------

router.put("/user/update", upload.single("avatar"), async (req, res) => {
  try {
    // Lấy token từ header
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Token không được cung cấp" });
    }

    // Xác thực token
    jwt.verify(token, "secret", async (err, decoded) => {
      if (err) {
        return res.status(401).json({ message: "Token không hợp lệ" });
      }

      const userId = decoded.id;
      const { fullname, email, phone, address, gender, dateOfBirth } = req.body;

      const avatar = req.file ? req.file.path : currentUser.avatar;


      const updatedData = {

        fullname,
        email,
        phone,
        address,
        gender,
        dateOfBirth,
        avatar,
        createdAt: new Date(),
      };
    
      

      const db = await connectDb();

      // Cập nhật người dùng trong MongoDB sử dụng native driver
      const result = await db.collection('users').updateOne(
        { _id: new ObjectId(userId) },  // Chuyển userId thành ObjectId
        { $set: updatedData }
      );

      if (result.modifiedCount > 0) {
        const avatarUrl = avatar ? `http://localhost:3000/${avatar}` : undefined;
        return res.status(200).json({
          message: "Cập nhật thông tin thành công",
          avatarUrl: avatarUrl,  // Trả về URL của avatar
        });
      } else {
        return res.status(400).json({ message: "Không có thay đổi nào được thực hiện" });
      }
    });
  } catch (error) {
    console.error("Lỗi trong API update user:", error);
    res.status(500).json({ message: "Có lỗi xảy ra, vui lòng thử lại" });
  }
});


// ----------------------------------------------END USERINFO--------------------------------------------------------------






module.exports = router;
