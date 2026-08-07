import { NextRequest, NextResponse } from "next/server";
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
  openid: string | null;
};

/**
 * 微信登录：
 * 入参 { code }（wx.login 获取的 code）
 *  - 已绑定过微信的用户：直接登录，返回 { token, user, needBind: false }
 *  - 首次使用的用户：返回 { needBind: true }，前端引导绑定 OA 账号
 */
export async function POST(request: NextRequest) {
  if (!isWeChatConfigured()) {
    return NextResponse.json({ message: "服务器未配置微信登录（WECHAT_APPID / WECHAT_SECRET）" }, { status: 500 });
  }

  let input: { code?: unknown };
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ message: "请求格式不正确" }, { status: 400 });
  }

  const code = typeof input.code === "string" ? input.code.trim() : "";
  if (!code) {
    return NextResponse.json({ message: "缺少微信登录凭证 code" }, { status: 400 });
  }

  // 1. code 换 openid
  let openid: string;
  try {
    const session = await code2Session(code);
    openid = session.openid;
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : "微信登录失败" }, { status: 400 });
  }

  // 2. 查已绑定的用户
  const db = getDb();
  const [rows] = await db.execute<UserRow[]>(
    "SELECT id, username, name, role, openid FROM users WHERE openid = ? AND status = 'active' LIMIT 1",
    [openid]
  );
  const user = rows[0];
  if (!user) {
    // 未绑定：让前端走账号绑定流程
    return NextResponse.json({ needBind: true, message: "首次使用，请绑定 OA 账号" });
  }

  // 3. 已绑定：直接创建会话
  await db.execute("UPDATE users SET last_login_at = NOW() WHERE id = ?", [user.id]);
  const sessionUser: SessionUser = { id: user.id, username: user.username, name: user.name, role: user.role };
  const jwt = await createSession(sessionUser);

  // 响应同时返回 token（小程序用）并设置 Cookie（Web 端兼容）
  const response = NextResponse.json({ token: jwt, user: sessionUser, needBind: false });
  response.cookies.set(SESSION_COOKIE, jwt, sessionCookieOptions);
  return response;
}
