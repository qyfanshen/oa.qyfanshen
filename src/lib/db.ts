import mysql, { type Pool } from "mysql2/promise";

declare global {
  var mysqlPool: Pool | undefined;
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`缺少环境变量：${name}`);
  return value;
}

export function getDb() {
  if (!global.mysqlPool) {
    global.mysqlPool = mysql.createPool({
      host: required("DB_HOST"),
      port: Number(process.env.DB_PORT ?? 3306),
      user: required("DB_USER"),
      password: required("DB_PASSWORD"),
      database: required("DB_NAME"),
      waitForConnections: true,
      connectionLimit: 10,
      charset: "utf8mb4",
    });
  }
  return global.mysqlPool;
}
