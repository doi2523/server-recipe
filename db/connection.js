// db.js
const mysql = require("mysql2");

const db = mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "recipes_db"
});

db.connect((err) => {
  if (err) {
    console.error("Không thể kết nối đến cơ sở dữ liệu:", err);
    return;
  }
  console.log("Kết nối đến MySQL thành công!");
});

module.exports = db;
