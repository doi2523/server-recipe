const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bodyParser = require("body-parser");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const app = express();

// Kết nối MySQL bằng pool
const db = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "recipes_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

db.getConnection((err, connection) => {
  if (err) {
    console.error("Không thể kết nối đến cơ sở dữ liệu:", err);
    return;
  }
  console.log("Kết nối đến MySQL thành công!");
  connection.release();
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
const tempDir = path.join(__dirname, "temp");
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

// Cấu hình Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "temp/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// API: Thêm công thức mới
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
      message: "Vui lòng cung cấp đầy đủ thông tin công thức, nguyên liệu và bước thực hiện.",
    });
  }

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
  if (imageFile) {
    try {
      const result = await cloudinary.uploader.upload(imageFile, {
        folder: "images-recipes",
      });
      imageUrl = result.secure_url;
      fs.unlinkSync(imageFile);
    } catch (error) {
      console.error("Lỗi khi upload ảnh lên Cloudinary:", error);
      return res.status(500).json({ message: "Lỗi khi upload ảnh." });
    }
  }

  const recipeQuery =
    "INSERT INTO recipes (name, description, servings, preparation_time, cooking_time, difficulty, country, image, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())";

  const connection = db.promise();
  try {
    const [result] = await connection.query(recipeQuery, [
      name,
      description,
      servings,
      preparation_time,
      cooking_time,
      difficulty,
      country,
      imageUrl,
    ]);

    const recipeId = result.insertId;

    const ingredientPromises = ingredientsArray.map((ingredient) =>
      connection.query(
        "INSERT INTO ingredients (recipe_id, name, quantity, unit) VALUES (?, ?, ?, ?)",
        [recipeId, ingredient.name, ingredient.quantity, ingredient.unit]
      )
    );

    const stepPromises = stepsArray.map((step, index) =>
      connection.query(
        "INSERT INTO steps (recipe_id, step_number, instruction) VALUES (?, ?, ?)",
        [recipeId, index + 1, step]
      )
    );

    await Promise.all([...ingredientPromises, ...stepPromises]);
    res.status(200).json({ message: "Thêm công thức thành công!" });
  } catch (error) {
    console.error("Lỗi khi thêm công thức:", error);
    res.status(500).json({ message: "Lỗi khi thêm công thức." });
  }
});

// API: Lấy danh sách công thức
app.get("/api/select-recipes", async (req, res) => {
  try {
    const connection = db.promise();

    const [recipes] = await connection.query("SELECT * FROM recipes");

    const recipePromises = recipes.map(async (recipe) => {
      const [ingredients] = await connection.query(
        "SELECT name, quantity, unit FROM ingredients WHERE recipe_id = ?",
        [recipe.id]
      );
      const [steps] = await connection.query(
        "SELECT step_number, instruction FROM steps WHERE recipe_id = ? ORDER BY step_number",
        [recipe.id]
      );

      recipe.ingredients = ingredients;
      recipe.steps = steps;

      return recipe;
    });

    const recipesWithDetails = await Promise.all(recipePromises);
    res.status(200).json(recipesWithDetails);
  } catch (error) {
    console.error("Error fetching recipes:", error);
    res.status(500).json({ message: "Lỗi khi lấy danh sách công thức" });
  }
});

// API: Xóa công thức
app.delete("/api/delete-recipe/:id", async (req, res) => {
  const recipeId = req.params.id;
  const connection = db.promise();

  try {
    await connection.query("DELETE FROM steps WHERE recipe_id = ?", [recipeId]);
    await connection.query("DELETE FROM ingredients WHERE recipe_id = ?", [recipeId]);
    await connection.query("DELETE FROM recipes WHERE id = ?", [recipeId]);

    res.status(200).json({ message: "Công thức đã được xóa thành công" });
  } catch (error) {
    console.error("Lỗi khi xóa công thức:", error);
    res.status(500).json({ message: "Lỗi khi xóa công thức" });
  }
});

// Chạy server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
