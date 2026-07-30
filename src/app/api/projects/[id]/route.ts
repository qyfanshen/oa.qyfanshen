import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { SESSION_COOKIE, readSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
export const runtime = "nodejs";
const stages = ["planning", "in_progress", "testing", "delivered", "maintenance", "completed"];
const progress: Record<string, number> = { planning: 0, in_progress: 25, testing: 50, delivered: 75, maintenance: 90, completed: 100 };
async function employeeId(accountId: number) { const [rows] = await getDb().execute<RowDataPacket[]>("SELECT id FROM employees WHERE account_user_id = ? LIMIT 1", [accountId]); return rows[0]?.id as string | undefined; }
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = request.cookies.get(SESSION_COOKIE)?.value; const session = token ? await readSession(token) : null;
  if (!session) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const { id } = await params; const body = await request.json() as { action?: string; employeeId?: string; assigned?: boolean };
  const db = getDb(); const [rows] = await db.execute<RowDataPacket[]>("SELECT status, members FROM projects WHERE id = ? LIMIT 1", [id]);
  if (!rows[0]) return NextResponse.json({ message: "项目不存在" }, { status: 404 });
  const members = typeof rows[0].members === "string" ? JSON.parse(rows[0].members || "[]") : rows[0].members || [];
  const admin = ["admin", "superadmin", "manager"].includes(session.role);
  if (body.action === "assign") {
    if (!admin || !body.employeeId) return NextResponse.json({ message: "无权分配项目成员" }, { status: 403 });
    const next = body.assigned ? [...members.filter((m: { employeeId: string }) => m.employeeId !== body.employeeId), { employeeId: body.employeeId, confirmedStage: "" }] : members.filter((m: { employeeId: string }) => m.employeeId !== body.employeeId);
    await db.execute("UPDATE projects SET members = ? WHERE id = ?", [JSON.stringify(next), id]);
    return NextResponse.json({ ok: true });
  }
  if (body.action === "confirm") {
    const employee = await employeeId(session.id); if (!employee || !members.some((m: { employeeId: string }) => m.employeeId === employee)) return NextResponse.json({ message: "仅项目成员可以确认阶段" }, { status: 403 });
    const current = String(rows[0].status); const next = members.map((m: { employeeId: string; confirmedStage?: string }) => m.employeeId === employee ? { ...m, confirmedStage: current } : m);
    const allConfirmed = next.length > 0 && next.every((m: { confirmedStage?: string }) => m.confirmedStage === current); const nextStatus = allConfirmed ? stages[stages.indexOf(current) + 1] : current;
    await db.execute("UPDATE projects SET members = ?, status = ?, progress = ? WHERE id = ?", [JSON.stringify(allConfirmed ? next.map((m: object) => ({ ...m, confirmedStage: "" })) : next), nextStatus || current, allConfirmed ? progress[nextStatus] : progress[current], id]);
    return NextResponse.json({ ok: true, advanced: allConfirmed });
  }
  return NextResponse.json({ message: "无效操作" }, { status: 400 });
}
