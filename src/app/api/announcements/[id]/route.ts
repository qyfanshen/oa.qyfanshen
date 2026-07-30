import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, readSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
export const runtime = "nodejs";
async function admin(request: NextRequest) { const token = request.cookies.get(SESSION_COOKIE)?.value; const session = token ? await readSession(token) : null; return session && ["admin", "superadmin", "manager"].includes(session.role) ? session : null; }
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) { if (!await admin(request)) return NextResponse.json({ message: "仅管理员可以维护公告。" }, { status: 403 }); const { pinned } = await request.json() as { pinned?: boolean }; if (typeof pinned !== "boolean") return NextResponse.json({ message: "参数无效。" }, { status: 400 }); const { id } = await params; await getDb().execute("UPDATE announcements SET is_pinned = ? WHERE id = ?", [pinned ? 1 : 0, id]); return NextResponse.json({ ok: true }); }
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) { if (!await admin(request)) return NextResponse.json({ message: "仅管理员可以删除公告。" }, { status: 403 }); const { id } = await params; await getDb().execute("DELETE FROM announcements WHERE id = ?", [id]); return NextResponse.json({ ok: true }); }
