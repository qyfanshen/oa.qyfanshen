const mysql = require("mysql2/promise");

async function main() {
  const conn = await mysql.createConnection({
    host: "127.0.0.1",
    port: 3306,
    user: "fanshen_oa_app",
    password: "fanshenkeji888",
    database: "fanshen_oa",
  });

  const [rows] = await conn.execute("SELECT id, username, password_hash FROM users WHERE username = ?", ["fanshen_superadmin"]);
  console.log("用户:", JSON.stringify(rows, null, 2));

  if (rows.length > 0) {
    const hash = "$2b$12$FXyAn07Vy8e/tJTyqCv1n.q/d6hEPwpIwngvhmG3UPiSgbWVi0DR.";
    await conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", [hash, rows[0].id]);
    console.log("密码已重置为: test123456");
  }

  await conn.end();
}
main().catch(console.error);
