import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, readSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await readSession(token) : null;
  if (!session || (session.role !== "admin" && session.role !== "superadmin")) return NextResponse.json({ message: "仅管理员可以审批" }, { status: 403 });
  const { status } = await request.json() as { status?: string };
  if (status !== "approved" && status !== "rejected") return NextResponse.json({ message: "审批状态无效" }, { status: 400 });
  const { id } = await params;
  const db = getDb();
  await db.execute("UPDATE seal_requests SET status = ?, approver_id = ?, approved_at = NOW(), comment = ? WHERE id = ?", [status, String(session.id), status === "approved" ? "已通过" : "已驳回", id]);
  await db.execute("UPDATE approval_requests SET status = ?, current_step = 1, steps = JSON_SET(steps, '$[0].status', ?, '$[0].approvedAt', DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s')) WHERE id = ?", [status, status, id]);
  return NextResponse.json({ ok: true });
}
