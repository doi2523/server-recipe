const db = require('../config/db');

// Lấy danh sách công thức
const getRecipes = async (req, res) => {
  try {
    const [recipes] = await db.promise().query('SELECT * FROM recipes');
    
    for (let i = 0; i < recipes.length; i++) {
      const [ingredients] = await db.promise().query('SELECT name, quantity, unit FROM ingredients WHERE recipe_id = ?', [recipes[i].id]);
      const [steps] = await db.promise().query('SELECT step_number, instruction FROM steps WHERE recipe_id = ? ORDER BY step_number', [recipes[i].id]);

      recipes[i].ingredients = ingredients;
      recipes[i].steps = steps;
    }

    res.status(200).json(recipes);
  } catch (error) {
    console.error('Error fetching recipes:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách công thức' });
  }
};
// Lấy danh sách công thức
const Test = async (req, res) => {
  res.json({"Hello": []})
};
// Xóa công thức
const deleteRecipe = (req, res) => {
  const recipeId = req.params.id;

  db.query('DELETE FROM steps WHERE recipe_id = ?', [recipeId], (err) => {
    if (err) return res.status(500).json({ message: 'Lỗi khi xóa các bước' });

    db.query('DELETE FROM ingredients WHERE recipe_id = ?', [recipeId], (err) => {
      if (err) return res.status(500).json({ message: 'Lỗi khi xóa nguyên liệu' });

      db.query('DELETE FROM recipes WHERE id = ?', [recipeId], (err) => {
        if (err) return res.status(500).json({ message: 'Lỗi khi xóa công thức' });

        res.status(200).json({ message: 'Công thức đã được xóa thành công' });
      });
    });
  });
};

// Thêm công thức mới
const addRecipe = (req, res) => {
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
  const image = req.file ? req.file.filename : null;

  if (!name || !description || !ingredients || !steps) {
    return res.status(400).json({ message: "Vui lòng cung cấp đầy đủ thông tin công thức." });
  }

  let ingredientsArray = Array.isArray(ingredients) ? ingredients : JSON.parse(ingredients);
  let stepsArray = Array.isArray(steps) ? steps : JSON.parse(steps);

  const query = "INSERT INTO recipes (name, description, servings, preparation_time, cooking_time, difficulty, country, image, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())";
  db.query(query, [
    name, description, servings, preparation_time, cooking_time, difficulty, country, image
  ], (err, result) => {
    if (err) {
      console.error("Lỗi khi thêm công thức:", err);
      return res.status(500).json({ message: "Lỗi khi thêm công thức" });
    }

    const recipeId = result.insertId;

    const ingredientQueries = ingredientsArray.map((ingredient) => {
      return new Promise((resolve, reject) => {
        const ingredientQuery = "INSERT INTO ingredients (recipe_id, name, quantity, unit) VALUES (?, ?, ?, ?)";
        db.query(ingredientQuery, [recipeId, ingredient.name, ingredient.quantity, ingredient.unit], (err) => {
          if (err) reject("Lỗi khi thêm nguyên liệu: " + err);
          else resolve();
        });
      });
    });

    const stepQueries = stepsArray.map((step, index) => {
      return new Promise((resolve, reject) => {
        const stepQuery = "INSERT INTO Steps (recipe_id, step_number, instruction) VALUES (?, ?, ?)";
        db.query(stepQuery, [recipeId, index + 1, step], (err) => {
          if (err) reject("Lỗi khi thêm bước: " + err);
          else resolve();
        });
      });
    });

    Promise.all([...ingredientQueries, ...stepQueries])
      .then(() => res.status(200).json({ message: "Thêm công thức thành công!" }))
      .catch((error) => {
        console.error("Lỗi tổng hợp:", error);
        res.status(500).json({ message: error });
      });
  });
};

module.exports = {
  getRecipes,
  deleteRecipe,
  addRecipe,
  Test
};
