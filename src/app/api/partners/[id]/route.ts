import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, readSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
export const runtime = "nodejs";
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) { const token = request.cookies.get(SESSION_COOKIE)?.value; const session = token ? await readSession(token) : null; if (!session || !["admin", "superadmin", "manager"].includes(session.role)) return NextResponse.json({ message: "仅管理员可以维护客户。" }, { status: 403 }); const { status } = await request.json() as { status?: string }; if (!status || !["potential", "active", "inactive"].includes(status)) return NextResponse.json({ message: "状态无效" }, { status: 400 }); const { id } = await params; await getDb().execute("UPDATE partners SET status = ? WHERE id = ?", [status, id]); return NextResponse.json({ ok: true }); }
