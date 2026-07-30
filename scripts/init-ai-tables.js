/**
 * AI 助手相关数据库表初始化脚本
 * 使用方法：node scripts/init-ai-tables.js
 */
const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env.local' });

const dbConfig = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: parseInt(process.env.MYSQL_PORT || '3306', 10),
  user: process.env.MYSQL_USER || 'fanshen_oa_app',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'fanshen_oa',
  multipleStatements: true,
};

const TABLES = [
  // 文档摘要缓存
  `CREATE TABLE IF NOT EXISTS ai_summaries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    document_id VARCHAR(64) NOT NULL UNIQUE,
    summary TEXT NOT NULL,
    char_count INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_document (document_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 文档思维导图缓存
  `CREATE TABLE IF NOT EXISTS ai_mindmaps (
    id INT AUTO_INCREMENT PRIMARY KEY,
    document_id VARCHAR(64) NOT NULL UNIQUE,
    markdown MEDIUMTEXT NOT NULL,
    char_count INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_document (document_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 推荐问题缓存
  `CREATE TABLE IF NOT EXISTS ai_suggested_questions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    document_id VARCHAR(64) NOT NULL UNIQUE,
    questions TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_document (document_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 对话会话
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

  // 对话消息
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
  let conn;
  try {
    console.log('[init-ai] connecting to MySQL...');
    conn = await mysql.createConnection(dbConfig);
    console.log('[init-ai] connected, creating tables...');

    for (const sql of TABLES) {
      await conn.query(sql);
      // 提取表名用于日志
      const m = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
      console.log(`[init-ai] ✓ ${m ? m[1] : 'table'} ready`);
    }

    console.log('[init-ai] all tables created successfully');
  } catch (err) {
    console.error('[init-ai] failed:', err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

main();
