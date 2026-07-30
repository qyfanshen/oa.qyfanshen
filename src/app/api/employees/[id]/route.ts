import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, readSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await readSession(token) : null;
  if (!session || !["admin", "superadmin"].includes(session.role)) return NextResponse.json({ message: "仅管理员可以维护员工资料。" }, { status: 403 });
  const { id } = await params;
  const input = await request.json() as Record<string, unknown>;
  const fields: string[] = []; const values: string[] = [];
  const allowed = ["name", "department", "position", "email", "phone", "status"] as const;
  for (const key of allowed) if (typeof input[key] === "string" && String(input[key]).trim()) { fields.push(`${key} = ?`); values.push(String(input[key]).trim()); }
  if (input.role === "admin" || input.role === "manager" || input.role === "employee") {
    if (input.role === "admin" && session.role !== "superadmin") return NextResponse.json({ message: "仅公司总账号可以授予管理员权限。" }, { status: 403 });
    fields.push("role = ?"); values.push(input.role);
  }
  if (!fields.length) return NextResponse.json({ message: "没有可保存的内容。" }, { status: 400 });
  values.push(id);
  await getDb().execute(`UPDATE employees SET ${fields.join(", ")} WHERE id = ?`, values);
  return NextResponse.json({ ok: true });
}
