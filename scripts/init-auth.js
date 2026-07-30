/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

const required = (name) => {
  if (!process.env[name]) throw new Error(`缺少环境变量：${name}`);
  return process.env[name];
};

async function main() {
  const username = required("ADMIN_USERNAME");
  const password = required("ADMIN_PASSWORD");
  if (password.length < 12) throw new Error("ADMIN_PASSWORD 至少设置 12 位");

  const connection = await mysql.createConnection({
    host: required("DB_HOST"), port: Number(process.env.DB_PORT || 3306),
    user: required("DB_USER"), password: required("DB_PASSWORD"), database: required("DB_NAME"), charset: "utf8mb4",
  });
  await connection.execute(`CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    username VARCHAR(64) NOT NULL,
    email VARCHAR(191) DEFAULT NULL,
    name VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('superadmin','admin','manager','employee') NOT NULL DEFAULT 'employee',
    status ENUM('active','disabled') NOT NULL DEFAULT 'active',
    last_login_at DATETIME DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uq_users_username (username), UNIQUE KEY uq_users_email (email)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await connection.execute("ALTER TABLE users MODIFY role ENUM('superadmin','admin','manager','employee') NOT NULL DEFAULT 'employee'");
  const hash = await bcrypt.hash(password, 12);
  await connection.execute(
    "INSERT INTO users (username, name, password_hash, role) VALUES (?, ?, ?, 'superadmin') ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash), role = 'superadmin', status = 'active'",
    [username, "系统管理员", hash]
  );
  const testUsername = process.env.TEST_EMPLOYEE_USERNAME || "test_employee";
  const testPassword = process.env.TEST_EMPLOYEE_PASSWORD || "Employee@2026";
  const testHash = await bcrypt.hash(testPassword, 12);
  await connection.execute(
    "INSERT INTO users (username, name, password_hash, role) VALUES (?, '测试员工', ?, 'employee') ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash), role = 'employee', status = 'active'",
    [testUsername, testHash]
  );
  await connection.end();
  console.log(`管理员账号 ${username} 已准备完成。`);
}

main().catch((error) => {
  console.error(`初始化失败：${error.message}`);
  process.exitCode = 1;
});
