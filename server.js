const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bodyParser = require("body-parser");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const path = require("path");
const fs = require("fs");
require('dotenv').config();

const app = express();

// Kết nối MySQL
// Thay đổi từ createConnection thành createPool
const db = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "recipes_db",
  waitForConnections: true,  // Đảm bảo đợi khi không có kết nối
  connectionLimit: 10,       // Số kết nối tối đa trong pool
  queueLimit: 0             // Không giới hạn số lượng yêu cầu trong hàng đợi
});

db.getConnection((err, connection) => {
  if (err) {
    console.error("Không thể kết nối đến cơ sở dữ liệu:", err);
    return;
  }
  console.log("Kết nối đến MySQL thành công!");
  connection.release();  // Giải phóng kết nối về pool sau khi kiểm tra
});

// Cấu hình middleware
app.use(cors());
app.use(bodyParser.json());

// Cấu hình Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Cấu hình Multer (lưu ảnh tạm thời để upload lên Cloudinary)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "temp/"); // Thư mục tạm để lưu file
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Tên file duy nhất
  },
});
const upload = multer({ storage });

// API: Thêm công thức mới với Cloudinary
app.post("/api/add-recipes", upload.single("image"), async (req, res) => {
  const {
    name,
    description,
    servings,
    preparation_time,
    cooking_time,
    difficulty,
    steps,
    ingredients,
    country,
  } = req.body;
  const imageFile = req.file ? req.file.path : null;

  if (!name || !description || !ingredients || !steps) {
    return res.status(400).json({
      message:
        "Vui lòng cung cấp đầy đủ thông tin công thức, nguyên liệu và bước thực hiện.",
    });
  }

  // Kiểm tra dữ liệu ingredients và steps
  let ingredientsArray = [];
  let stepsArray = [];
  try {
    ingredientsArray = Array.isArray(ingredients)
      ? ingredients
      : JSON.parse(ingredients);
    stepsArray = Array.isArray(steps) ? steps : JSON.parse(steps);
  } catch (error) {
    return res.status(400).json({ message: "Dữ liệu không hợp lệ." });
  }

  let imageUrl = null;

  // Upload ảnh lên Cloudinary nếu có
  if (imageFile) {
    try {
      const result = await cloudinary.uploader.upload(imageFile, {
        folder: "images-recipes",
      });
      imageUrl = result.secure_url; // URL ảnh từ Cloudinary
      fs.unlinkSync(imageFile); // Xóa file tạm sau khi upload
    } catch (error) {
      console.error("Lỗi khi upload ảnh lên Cloudinary:", error);
      return res.status(500).json({ message: "Lỗi khi upload ảnh." });
    }
  }

  // Thêm công thức vào bảng recipes
  const recipeQuery =
    "INSERT INTO recipes (name, description, servings, preparation_time, cooking_time, difficulty, country, image, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())";

  db.query(
    recipeQuery,
    [
      name,
      description,
      servings,
      preparation_time,
      cooking_time,
      difficulty,
      country,
      imageUrl,
    ],
    (err, result) => {
      if (err) {
        console.error("Lỗi khi thêm công thức:", err);
        return res.status(500).json({ message: "Lỗi khi thêm công thức." });
      }

      const recipeId = result.insertId;

      // Thêm ingredients và steps
      const ingredientQueries = ingredientsArray.map((ingredient) => {
        return new Promise((resolve, reject) => {
          const ingredientQuery =
            "INSERT INTO ingredients (recipe_id, name, quantity, unit) VALUES (?, ?, ?, ?)";
          db.query(
            ingredientQuery,
            [recipeId, ingredient.name, ingredient.quantity, ingredient.unit],
            (err) => {
              if (err) {
                reject("Lỗi khi thêm nguyên liệu: " + err);
              } else {
                resolve();
              }
            }
          );
        });
      });

      const stepQueries = stepsArray.map((step, index) => {
        return new Promise((resolve, reject) => {
          const stepQuery =
            "INSERT INTO steps (recipe_id, step_number, instruction) VALUES (?, ?, ?)";
          db.query(stepQuery, [recipeId, index + 1, step], (err) => {
            if (err) {
              reject("Lỗi khi thêm bước: " + err);
            } else {
              resolve();
            }
          });
        });
      });

      // Chờ tất cả các query hoàn thành
      Promise.all([...ingredientQueries, ...stepQueries])
        .then(() => {
          res.status(200).json({ message: "Thêm công thức thành công!" });
        })
        .catch((error) => {
          console.error("Lỗi tổng hợp:", error);
          res.status(500).json({ message: error });
        });
    }
  );
});
app.get('/api/select-recipes', async (req, res) => {
  try {
    // Lấy danh sách công thức
    const [recipes] = await db.promise().query('SELECT * FROM recipes');
    
    // Tạo các promises để lấy nguyên liệu và các bước cho từng công thức
    const recipePromises = recipes.map(async (recipe) => {
      // Lấy nguyên liệu của công thức
      const [ingredients] = await db.promise().query('SELECT name, quantity, unit FROM ingredients WHERE recipe_id = ?', [recipe.id]);
      // Lấy các bước của công thức
      const [steps] = await db.promise().query('SELECT step_number, instruction FROM steps WHERE recipe_id = ? ORDER BY step_number', [recipe.id]);

      // Gắn nguyên liệu và các bước vào công thức
      recipe.ingredients = ingredients;
      recipe.steps = steps;

      return recipe;
    });

    // Chờ tất cả các promises hoàn thành
    const recipesWithDetails = await Promise.all(recipePromises);

    // Trả về danh sách công thức với đầy đủ thông tin
    res.status(200).json(recipesWithDetails);
  } catch (error) {
    console.error('Error fetching recipes:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách công thức' });
  }
});
// API: Xóa công thức
app.delete('/api/delete-recipe/:id', (req, res) => {
  const recipeId = req.params.id;

  // Bắt đầu từ xóa các bước liên quan đến công thức
  db.query('DELETE FROM steps WHERE recipe_id = ?', [recipeId], (err) => {
    if (err) {
      console.error('Lỗi khi xóa các bước:', err);
      return res.status(500).json({ message: 'Lỗi khi xóa các bước' });
    }

    // Xóa các nguyên liệu liên quan đến công thức
    db.query('DELETE FROM ingredients WHERE recipe_id = ?', [recipeId], (err) => {
      if (err) {
        console.error('Lỗi khi xóa nguyên liệu:', err);
        return res.status(500).json({ message: 'Lỗi khi xóa nguyên liệu' });
      }

      // Cuối cùng, xóa công thức
      db.query('DELETE FROM recipes WHERE id = ?', [recipeId], (err) => {
        if (err) {
          console.error('Lỗi khi xóa công thức:', err);
          return res.status(500).json({ message: 'Lỗi khi xóa công thức' });
        }

        res.status(200).json({ message: 'Công thức đã được xóa thành công' });
      });
    });
  });
});

// Chạy server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
