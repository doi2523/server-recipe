const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bodyParser = require("body-parser");
const multer = require("multer");
const path = require("path");

const app = express();

// Kết nối MySQL
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

db.connect((err) => {
  if (err) {
    console.error("Không thể kết nối đến cơ sở dữ liệu:", err);
    return;
  }
  console.log("Kết nối đến MySQL thành công!");
});

// Cấu hình middleware
app.use(cors()); // Để client React có thể gọi API từ server
app.use(bodyParser.json()); // Để đọc body của request gửi dưới dạng JSON

// Cấu hình multer để xử lý upload ảnh
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // Lưu ảnh vào thư mục uploads
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Tạo tên file duy nhất
  },
});
const upload = multer({ storage });
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// API: Lấy danh sách công thức
app.get('/api/select-recipes', async (req, res) => {
    try {
      // Sử dụng promise để lấy dữ liệu
      const [recipes] = await db.promise().query('SELECT * FROM recipes');
      
      // Fetch ingredients and steps for each recipe
      for (let i = 0; i < recipes.length; i++) {
        const [ingredients] = await db.promise().query('SELECT name, quantity, unit FROM ingredients WHERE recipe_id = ?', [recipes[i].id]);
        const [steps] = await db.promise().query('SELECT step_number, instruction FROM steps WHERE recipe_id = ? ORDER BY step_number', [recipes[i].id]);
  
        // Gắn nguyên liệu và các bước vào công thức
        recipes[i].ingredients = ingredients;
        recipes[i].steps = steps;
      }
  
      // Trả về danh sách công thức với đầy đủ thông tin
      res.status(200).json(recipes);
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
  
  
// API: Thêm công thức mới
app.post("/api/add-recipes", upload.single("image"), (req, res) => {
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
  const image = req.file ? req.file.filename : null; // Lưu tên file ảnh nếu có

  // Kiểm tra nếu các trường bắt buộc không có giá trị
  if (!name || !description || !ingredients || !steps) {
    return res
      .status(400)
      .json({
        message:
          "Vui lòng cung cấp đầy đủ thông tin công thức, nguyên liệu và bước thực hiện.",
      });
  }

  // Kiểm tra và đảm bảo ingredients là một mảng
  let ingredientsArray = [];
  try {
    ingredientsArray = Array.isArray(ingredients)
      ? ingredients
      : JSON.parse(ingredients);
  } catch (error) {
    return res
      .status(400)
      .json({ message: "Dữ liệu nguyên liệu không hợp lệ." });
  }

  // Kiểm tra và đảm bảo steps là một mảng
  let stepsArray = [];
  try {
    stepsArray = Array.isArray(steps) ? steps : JSON.parse(steps);
  } catch (error) {
    return res.status(400).json({ message: "Dữ liệu bước không hợp lệ." });
  }

  // Chèn công thức vào bảng Recipes
  const query =
    "INSERT INTO recipes (name, description, servings, preparation_time, cooking_time, difficulty, country, image, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())";
  db.query(
    query,
    [
      name,
      description,
      servings,
      preparation_time,
      cooking_time,
      difficulty,
      country,
      image,
    ],
    (err, result) => {
      if (err) {
        console.error("Lỗi khi thêm công thức:", err); // In chi tiết lỗi ra console
        return res.status(500).json({ message: "Lỗi khi thêm công thức" });
      }

      const recipeId = result.insertId;

      // Chèn các nguyên liệu vào bảng Ingredients
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

      // Chèn các bước vào bảng Steps
      const stepQueries = stepsArray.map((step, index) => {
        return new Promise((resolve, reject) => {
          const stepQuery =
            "INSERT INTO Steps (recipe_id, step_number, instruction) VALUES (?, ?, ?)";
          db.query(stepQuery, [recipeId, index + 1, step], (err) => {
            if (err) {
              reject("Lỗi khi thêm bước: " + err);
            } else {
              resolve();
            }
          });
        });
      });

      // Khi tất cả các thao tác trên bảng Ingredients và Steps hoàn thành
      Promise.all([...ingredientQueries, ...stepQueries])
        .then(() => {
          res.status(200).json({ message: "Thêm công thức thành công!" });
        })
        .catch((error) => {
          console.error("Lỗi tổng hợp:", error); // In lỗi tổng hợp
          res.status(500).json({ message: error });
        });
    }
  );
});

// Chạy server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
