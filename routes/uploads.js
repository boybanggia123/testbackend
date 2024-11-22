const express = require("express");
const multer = require("multer");
var router = express.Router();
const cors = require("cors");
const app = express();

const { v2: cloudinary } = require("cloudinary");
require("dotenv").config();
const connectDb = require("../model/db");
const { ObjectId } = require("mongodb");
app.use(express.json()); // Phân tích JSON
app.use(express.urlencoded({ extended: true })); // Phân tích URL-encoded
app.use(cors());

cloudinary.config({
  cloud_name: "dwrp82bhy",
  api_key: "667485257866548",
  api_secret: "DkqnpV-tBbyoAOxWz4ORdfLIhi8",
});

const storage = multer.memoryStorage(); // Chuyển sang memory storage để dễ dàng upload lên Cloudinary
const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
      return cb(new Error("Bạn chỉ được upload file ảnh"));
    }
    cb(null, true);
  },
});
// danh mục sản phẩm

// Thêm sản phẩm và tải lên Cloudinary
router.post("/addproduct", upload.single("image"), async (req, res) => {
  const db = await connectDb();
  const productCollection = db.collection("products");
  const {
    name,
    description,
    price,
    discountedPrice,
    size,
    quantity,
    status,
    dayadd,
    hot,
    categoryId,
    reviews,
  } = req.body;

  try {
    // Tải ảnh lên Cloudinary
    let imageUrl = "";
    if (req.file) {
      imageUrl = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: "product_images" },
          (error, result) => {
            if (error) reject(new Error("Tải ảnh lên Cloudinary thất bại"));
            else resolve(result.secure_url);
          }
        );
        uploadStream.end(req.file.buffer);
      });
    }

    // Đối tượng sản phẩm mới
    const newProduct = {
      name,
      description,
      price,
      discountedPrice,
      size: size ? JSON.parse(size) : [],
      quantity,
      status,
      dayadd: dayadd ? new Date(dayadd) : new Date(),
      hot: hot === " ",
      categoryId,
      reviews: reviews ? JSON.parse(reviews) : [],
      image: imageUrl,
    };

    const result = await productCollection.insertOne(newProduct);
    if (result.insertedId) {
      res
        .status(200)
        .json({ message: "Thêm sản phẩm thành công", product: newProduct });
    } else {
      res.status(500).json({ message: "Thêm sản phẩm thất bại" });
    }
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Có lỗi xảy ra, vui lòng thử lại" });
  }
});

// sửa sản phẩm
router.put("/updateproduct/:id", upload.single("image"), async (req, res) => {
  const db = await connectDb();
  const productCollection = db.collection("products");
  const id = new ObjectId(req.params.id);
  const updates = req.body;

  try {
    // Tải ảnh mới lên Cloudinary nếu có
    if (req.file) {
      updates.image = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: "product_images" },
          (error, result) => {
            if (error) reject(new Error("Tải ảnh lên Cloudinary thất bại"));
            else resolve(result.secure_url);
          }
        );
        uploadStream.end(req.file.buffer);
      });
    }

    // Chuyển đổi các trường về đúng kiểu dữ liệu
    updates.price = updates.price ? Number(updates.price) : undefined;
    updates.discountedPrice = updates.discountedPrice
      ? Number(updates.discountedPrice)
      : undefined;
    updates.size = updates.size ? JSON.parse(updates.size) : undefined;
    updates.quantity = updates.quantity ? Number(updates.quantity) : undefined;
    updates.hot = updates.hot === "true";
    updates.dayadd = updates.dayadd ? new Date(updates.dayadd) : undefined;
    updates.reviews = updates.reviews ? JSON.parse(updates.reviews) : undefined;

    const result = await productCollection.updateOne(
      { _id: id },
      { $set: updates }
    );

    if (result.modifiedCount > 0) {
      res.status(200).json({ message: "Cập nhật sản phẩm thành công" });
    } else {
      res.status(404).json({ message: "Không tìm thấy sản phẩm" });
    }
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Có lỗi xảy ra, vui lòng thử lại" });
  }
});
// xóa sản phẩm
router.delete("/deleteproduct/:id", async (req, res) => {
  const db = await connectDb();
  const productCollection = db.collection("products");
  const id = new ObjectId(req.params.id);

  try {
    const product = await productCollection.findOne({ _id: id });
    if (product && product.image) {
      // Xóa ảnh từ Cloudinary
      const publicId = product.image.split("/").pop().split(".")[0];
      await cloudinary.uploader.destroy(`product_images/${publicId}`);
    }

    const result = await productCollection.deleteOne({ _id: id });
    if (result.deletedCount > 0) {
      res.status(200).json({ message: "Xóa sản phẩm thành công" });
    } else {
      res.status(404).json({ message: "Không tìm thấy sản phẩm" });
    }
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Có lỗi xảy ra, vui lòng thử lại" });
  }
});

module.exports = router;
