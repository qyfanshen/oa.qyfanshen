"use client";

/**
 * 客户端 session 工具
 *
 * 与服务端不同，浏览器侧的真实身份凭据保存在 HttpOnly Cookie 中，
 * 这里只通过 `/api/auth/me` 间接获取当前用户信息，并在登出后清掉
 * 任何与 session 相关的本地缓存。
 */

const STORAGE_KEYS = ["fanshen-demo-role", "fanshen_oa_session"] as const;

export type ClientSessionUser = {
  name: string;
  role: string;
};

export async function getClientSession(): Promise<ClientSessionUser | null> {
  try {
    const response = await fetch("/api/auth/me", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { user?: { name?: unknown; role?: unknown } };
    const user = data?.user;
    if (!user || typeof user.name !== "string" || typeof user.role !== "string") {
      return null;
    }
    return { name: user.name, role: user.role };
  } catch {
    return null;
  }
}

export function clearClientSession(): void {
  if (typeof window === "undefined") return;
  for (const key of STORAGE_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* 忽略 storage 不可用的情况 */
    }
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      /* 忽略 storage 不可用的情况 */
    }
  }
}
