/**
 * AI 助手相关数据库表初始化脚本
 * 使用方法：node scripts/init-ai-tables.js
 */
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const envFile = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

const TABLES = [
  `CREATE TABLE IF NOT EXISTS ai_summaries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    document_id VARCHAR(64) NOT NULL UNIQUE,
    summary TEXT NOT NULL,
    char_count INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_document (document_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS ai_mindmaps (
    id INT AUTO_INCREMENT PRIMARY KEY,
    document_id VARCHAR(64) NOT NULL UNIQUE,
    markdown MEDIUMTEXT NOT NULL,
    char_count INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_document (document_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS ai_suggested_questions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    document_id VARCHAR(64) NOT NULL UNIQUE,
    questions TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_document (document_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS ai_conversations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    document_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    title VARCHAR(200) DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_document (document_id),
    INDEX idx_user (user_id),
    INDEX idx_updated (updated_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS ai_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT NOT NULL,
    role ENUM('user', 'assistant', 'system') NOT NULL,
    content MEDIUMTEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_conversation (conversation_id),
    INDEX idx_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

async function main() {
  const host = process.env.DB_HOST || "127.0.0.1";
  const port = Number(process.env.DB_PORT || 3306);
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME;

  if (!user || !database) {
    console.error("[init-ai] 缺少 DB_USER 或 DB_NAME 环境变量");
    process.exit(1);
  }

  let conn;
  try {
    console.log("[init-ai] connecting to MySQL...");
    conn = await mysql.createConnection({ host, port, user, password, database, charset: "utf8mb4" });
    console.log("[init-ai] connected, creating tables...");

    for (const sql of TABLES) {
      await conn.execute(sql);
      const m = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
      console.log(`[init-ai] ✓ ${m ? m[1] : "table"} ready`);
    }

    console.log("[init-ai] all tables created successfully");
  } catch (err) {
    console.error("[init-ai] failed:", err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

main();
