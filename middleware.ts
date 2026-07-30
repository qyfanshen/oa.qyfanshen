import { NextRequest, NextResponse } from "next/server";
import { readSession, SESSION_COOKIE } from "@/lib/auth";

// 登录上线前保持系统可直接访问；启用登录时恢复会话校验即可。
export async function middleware(request: NextRequest) {
  if (process.env.AUTH_ENFORCE !== "true") return NextResponse.next();
  const { pathname } = request.nextUrl;
  if (pathname === "/login") return NextResponse.next();
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await readSession(token) : null;
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  const employeeBlocked = ["/", "/employees", "/approvals", "/crm"];
  if (user.role === "employee" && employeeBlocked.includes(pathname)) return NextResponse.redirect(new URL("/attendance", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
