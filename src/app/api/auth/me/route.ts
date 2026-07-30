import { NextRequest, NextResponse } from "next/server";
import { readSession, SESSION_COOKIE } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await readSession(token) : null;
  if (!user) return NextResponse.json({ message: "未登录" }, { status: 401 });
  return NextResponse.json({ user });
}
