import pool from "../../db/connection";

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const [recipes] = await pool.query("SELECT * FROM recipes");

      for (let i = 0; i < recipes.length; i++) {
        const [ingredients] = await pool.query("SELECT name, quantity, unit FROM ingredients WHERE recipe_id = ?", [recipes[i].id]);
        const [steps] = await pool.query("SELECT step_number, instruction FROM steps WHERE recipe_id = ? ORDER BY step_number", [recipes[i].id]);
        recipes[i].ingredients = ingredients;
        recipes[i].steps = steps;
      }

      res.status(200).json(recipes);
    } catch (error) {
      console.error("Lỗi khi lấy danh sách công thức:", error);
      res.status(500).json({ message: "Lỗi khi lấy danh sách công thức", error: error.message });
    }
  } else {
    res.status(405).json({ message: "Method Not Allowed" });
  }
}
