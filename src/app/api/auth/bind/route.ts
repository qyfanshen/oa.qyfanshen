import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import type { RowDataPacket } from "mysql2";
import { createSession, SESSION_COOKIE, sessionCookieOptions, type SessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { code2Session, isWeChatConfigured } from "@/lib/wechat";

export const runtime = "nodejs";

type UserRow = RowDataPacket & {
  id: number;
  username: string;
  name: string;
  role: SessionUser["role"];
  password_hash: string;
  openid: string | null;
};

/**
 * 绑定 OA 账号到微信：
 * 入参 { code, account, password }
 *  - code 换取 openid，校验 OA 账号密码，绑定成功后登录
 */
export async function POST(request: NextRequest) {
  if (!isWeChatConfigured()) {
    return NextResponse.json({ message: "服务器未配置微信登录（WECHAT_APPID / WECHAT_SECRET）" }, { status: 500 });
  }

  let input: { code?: unknown; account?: unknown; password?: unknown };
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ message: "请求格式不正确" }, { status: 400 });
  }

  const code = typeof input.code === "string" ? input.code.trim() : "";
  const account = typeof input.account === "string" ? input.account.trim() : "";
  const password = typeof input.password === "string" ? input.password : "";
  if (!code || !account || !password) {
    return NextResponse.json({ message: "请完整填写账号、密码" }, { status: 400 });
  }

  // 1. code 换 openid
  let openid: string;
  try {
    const session = await code2Session(code);
    openid = session.openid;
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : "微信登录失败" }, { status: 400 });
  }

  // 2. 校验 OA 账号密码
  const db = getDb();
  const [rows] = await db.execute<UserRow[]>(
    "SELECT id, username, name, role, password_hash, openid FROM users WHERE (username = ? OR email = ?) AND status = 'active' LIMIT 1",
    [account, account]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return NextResponse.json({ message: "OA 账号或密码错误" }, { status: 401 });
  }
  if (user.openid && user.openid !== openid) {
    return NextResponse.json({ message: "该 OA 账号已绑定其他微信" }, { status: 409 });
  }

  // 3. 绑定 openid
  await db.execute("UPDATE users SET openid = ?, last_login_at = NOW() WHERE id = ?", [openid, user.id]);

  // 4. 创建会话
  const sessionUser: SessionUser = { id: user.id, username: user.username, name: user.name, role: user.role };
  const jwt = await createSession(sessionUser);
  const response = NextResponse.json({ token: jwt, user: sessionUser, needBind: false });
  response.cookies.set(SESSION_COOKIE, jwt, sessionCookieOptions);
  return response;
}
