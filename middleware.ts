import { NextRequest, NextResponse } from "next/server";
import { readSession, SESSION_COOKIE } from "@/lib/auth";

const AUTH_ENFORCE = process.env.AUTH_ENFORCE !== "false";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/me", "/api/auth/logout"];

export async function middleware(request: NextRequest) {
  if (!AUTH_ENFORCE) return NextResponse.next();

  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p)) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await readSession(token) : null;

  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const employeeBlockedPrefixes = ["/employees", "/approvals", "/crm"];
  if (user.role === "employee" && employeeBlockedPrefixes.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL("/attendance", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
