import { SignJWT, jwtVerify } from "jose";
import type { NextRequest } from "next/server";

export const SESSION_COOKIE = "fanshen_oa_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 8;

export type SessionUser = {
  id: number;
  username: string;
  name: string;
  role: "superadmin" | "admin" | "manager" | "employee";
};

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error("AUTH_SECRET 必须设置为至少 32 个字符的随机字符串");
  }
  return new TextEncoder().encode(value);
}

export async function createSession(user: SessionUser) {
  return new SignJWT({ username: user.username, name: user.name, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(secret());
}

export async function readSession(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub || typeof payload.username !== "string" || typeof payload.name !== "string") return null;
    if (!["superadmin", "admin", "manager", "employee"].includes(String(payload.role))) return null;
    return {
      id: Number(payload.sub),
      username: payload.username,
      name: payload.name,
      role: payload.role as SessionUser["role"],
    };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_DURATION_SECONDS,
};

/**
 * 从请求中解析会话（双模式）：
 *  - Web 端：HttpOnly Cookie（fanshen_oa_session）
 *  - 小程序端：Authorization: Bearer <token>
 */
export async function getSessionFromRequest(request: NextRequest | Request): Promise<SessionUser | null> {
  const cookieToken = (request as NextRequest).cookies?.get(SESSION_COOKIE)?.value;
  const authHeader = request.headers.get("authorization");
  const headerToken = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const token = cookieToken || headerToken;
  return token ? readSession(token) : null;
}
