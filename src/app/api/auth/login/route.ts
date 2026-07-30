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

const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function getClientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const now = Date.now();
  const record = attempts.get(ip);
  if (record && record.resetAt > now && record.count >= MAX_ATTEMPTS) {
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

  const db = getDb();
  const [rows] = await db.execute<UserRow[]>(
    "SELECT id, username, name, role, password_hash FROM users WHERE (username = ? OR email = ?) AND status = 'active' LIMIT 1",
    [account, account]
  );
  const user = rows[0];
  const valid = user ? await bcrypt.compare(password, user.password_hash) : false;

  if (!valid) {
    attempts.set(ip, { count: record && record.resetAt > now ? record.count + 1 : 1, resetAt: now + WINDOW_MS });
    return NextResponse.json({ message: "账号或密码错误" }, { status: 401 });
  }

  attempts.delete(ip);
  await db.execute("UPDATE users SET last_login_at = NOW() WHERE id = ?", [user.id]);
  const sessionUser: SessionUser = { id: user.id, username: user.username, name: user.name, role: user.role };
  const response = NextResponse.json({ user: sessionUser });
  response.cookies.set(SESSION_COOKIE, await createSession(sessionUser), sessionCookieOptions);
  return response;
}
