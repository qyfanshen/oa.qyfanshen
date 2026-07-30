import { SignJWT, jwtVerify } from "jose";

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
