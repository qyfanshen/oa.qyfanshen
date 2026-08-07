import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { RowDataPacket } from "mysql2";
import { createSession, SESSION_COOKIE, sessionCookieOptions, type SessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

type UserRow = RowDataPacket & {
  id: number;
  username: string;
  name: string;
  role: SessionUser["role"];
  password_hash: string;
};

const ipAttempts = new Map<string, { count: number; resetAt: number }>();
const accountAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function getClientIp(request: Request) {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

function cleanExpired() {
  const now = Date.now();
  for (const [key, val] of ipAttempts) {
    if (val.resetAt <= now) ipAttempts.delete(key);
  }
  for (const [key, val] of accountAttempts) {
    if (val.resetAt <= now) accountAttempts.delete(key);
  }
}

export async function POST(request: Request) {
  const now = Date.now();
  cleanExpired();

  const ip = getClientIp(request);
  const ipRecord = ipAttempts.get(ip);
  if (ipRecord && ipRecord.resetAt > now && ipRecord.count >= MAX_ATTEMPTS) {
    return NextResponse.json({ message: "尝试次数过多，请 15 分钟后再试" }, { status: 429 });
  }

  let input: { account?: unknown; password?: unknown };
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ message: "请求格式不正确" }, { status: 400 });
  }

  const account = typeof input.account === "string" ? input.account.trim() : "";
  const password = typeof input.password === "string" ? input.password : "";
  if (!account || !password || account.length > 100 || password.length > 200) {
    return NextResponse.json({ message: "请输入账号和密码" }, { status: 400 });
  }

  const accountKey = account.toLowerCase();
  const accountRecord = accountAttempts.get(accountKey);
  if (accountRecord && accountRecord.resetAt > now && accountRecord.count >= MAX_ATTEMPTS) {
    return NextResponse.json({ message: "该账号尝试次数过多，请 15 分钟后再试" }, { status: 429 });
  }

  const db = getDb();
  const [rows] = await db.execute<UserRow[]>(
    "SELECT id, username, name, role, password_hash FROM users WHERE (username = ? OR email = ?) AND status = 'active' LIMIT 1",
    [account, account]
  );
  const user = rows[0];

  const GARBLE_HASH = "$2a$12$C9ixfhKy3VyXRbPQKhRkKO9m3GQf5xXJdWtXHKj4yHqNqEuXxTyQO";
  const valid = user ? await bcrypt.compare(password, user.password_hash) : await bcrypt.compare(password, GARBLE_HASH);

  if (!valid) {
    const ipNewCount = (ipRecord && ipRecord.resetAt > now ? ipRecord.count : 0) + 1;
    ipAttempts.set(ip, { count: ipNewCount, resetAt: now + WINDOW_MS });

    const acctNewCount = (accountRecord && accountRecord.resetAt > now ? accountRecord.count : 0) + 1;
    accountAttempts.set(accountKey, { count: acctNewCount, resetAt: now + WINDOW_MS });

    return NextResponse.json({ message: "账号或密码错误" }, { status: 401 });
  }

  ipAttempts.delete(ip);
  accountAttempts.delete(accountKey);
  await db.execute("UPDATE users SET last_login_at = NOW() WHERE id = ?", [user.id]);
  const sessionUser: SessionUser = { id: user.id, username: user.username, name: user.name, role: user.role };
  // 同时返回 token（小程序用）并设置 Cookie（Web 端兼容）
  const jwt = await createSession(sessionUser);
  const response = NextResponse.json({ user: sessionUser, token: jwt });
  response.cookies.set(SESSION_COOKIE, jwt, sessionCookieOptions);
  return response;
}
