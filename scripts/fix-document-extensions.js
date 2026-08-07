/* eslint-disable @typescript-eslint/no-require-imports */
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

const KNOWN_EXTS = new Set([
  "pdf", "doc", "docx", "docm", "dot", "dotx",
  "xls", "xlsx", "xlsm", "xlt", "xltx",
  "ppt", "pptx", "pptm", "pot", "potx",
  "txt", "md", "json", "csv", "xml", "html", "htm", "css", "js", "ts", "jsx", "tsx",
  "jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "ico",
  "zip", "rar", "7z", "tar", "gz",
  "mp3", "mp4", "avi", "mov", "wav",
  "wps", "et", "dps", "rtf", "odt", "ods", "odp",
  "log", "yml", "yaml", "ini", "conf", "sh", "py", "java",
]);

function getExtFromStorageKey(storageKey) {
  if (!storageKey) return null;
  const idx = storageKey.lastIndexOf(".");
  if (idx === -1) return null;
  const ext = storageKey.slice(idx + 1).toLowerCase();
  return KNOWN_EXTS.has(ext) ? ext : null;
}

function nameHasValidExt(name) {
  if (!name) return false;
  const idx = name.lastIndexOf(".");
  if (idx === -1) return false;
  const ext = name.slice(idx + 1).toLowerCase();
  return KNOWN_EXTS.has(ext);
}

async function main() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: "utf8mb4",
  });

  console.log("读取文档列表...");
  const [rows] = await db.execute(
    "SELECT id, name, storage_key FROM documents WHERE storage_key IS NOT NULL AND storage_key != ''"
  );

  let fixed = 0;
  for (const row of rows) {
    const { id, name, storage_key: storageKey } = row;
    const correctExt = getExtFromStorageKey(storageKey);

    if (!correctExt) {
      console.log(`  跳过 ${id}: storage_key 无有效扩展名`);
      continue;
    }

    if (nameHasValidExt(name) && name.slice(name.lastIndexOf(".")).toLowerCase() === `.${correctExt}`) {
      continue;
    }

    const newName = nameHasValidExt(name)
      ? name
      : `${name}.${correctExt}`;

    console.log(`  修复 ${id}: "${name}" → "${newName}" (ext=${correctExt})`);
    await db.execute("UPDATE documents SET name = ? WHERE id = ?", [newName, id]);
    fixed++;
  }

  console.log(`\n完成！共修复 ${fixed} 条记录。`);
  await db.end();
}

main().catch((err) => {
  console.error("修复失败:", err.message);
  process.exit(1);
});
