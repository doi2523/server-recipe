import pool from "../../db/connection";

export default async function handler(req, res) {
  if (req.method === "POST") {
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
      return res.status(400).json({
        message: "Vui lòng cung cấp đầy đủ thông tin công thức, nguyên liệu và bước thực hiện.",
      });
    }

    try {
      // Insert công thức
      const [recipeResult] = await pool.query(
        "INSERT INTO recipes (name, description, servings, preparation_time, cooking_time, difficulty, country, image, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())",
        [name, description, servings, preparation_time, cooking_time, difficulty, country, image]
      );
      const recipeId = recipeResult.insertId;

      // Insert nguyên liệu
      const ingredientQueries = ingredients.map((ingredient) =>
        pool.query(
          "INSERT INTO ingredients (recipe_id, name, quantity, unit) VALUES (?, ?, ?, ?)",
          [recipeId, ingredient.name, ingredient.quantity, ingredient.unit]
        )
      );

      // Insert các bước
      const stepQueries = steps.map((step, index) =>
        pool.query(
          "INSERT INTO steps (recipe_id, step_number, instruction) VALUES (?, ?, ?)",
          [recipeId, index + 1, step]
        )
      );

      // Đợi tất cả query hoàn tất
      await Promise.all([...ingredientQueries, ...stepQueries]);

      res.status(200).json({ message: "Thêm công thức thành công!" });
    } catch (error) {
      console.error("Lỗi khi thêm công thức:", error);
      res.status(500).json({ message: "Lỗi khi thêm công thức", error: error.message });
    }
  } else {
    res.status(405).json({ message: "Method Not Allowed" });
  }
}
