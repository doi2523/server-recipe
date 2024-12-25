import pool from "../../db/connection";

export default async function handler(req, res) {
  if (req.method === "DELETE") {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ message: "Vui lòng cung cấp ID công thức." });
    }

    try {
      await pool.query("DELETE FROM steps WHERE recipe_id = ?", [id]);
      await pool.query("DELETE FROM ingredients WHERE recipe_id = ?", [id]);
      const [result] = await pool.query("DELETE FROM recipes WHERE id = ?", [id]);

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Không tìm thấy công thức để xóa." });
      }

      res.status(200).json({ message: "Xóa công thức thành công!" });
    } catch (error) {
      console.error("Lỗi khi xóa công thức:", error);
      res.status(500).json({ message: "Lỗi khi xóa công thức", error: error.message });
    }
  } else {
    res.status(405).json({ message: "Method Not Allowed" });
  }
}
