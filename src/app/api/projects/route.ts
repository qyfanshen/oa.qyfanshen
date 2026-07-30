import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { SESSION_COOKIE, readSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
async function sessionFor(request: NextRequest) { const token = request.cookies.get(SESSION_COOKIE)?.value; return token ? readSession(token) : null; }
async function employeeId(accountId: number) { const [rows] = await getDb().execute<RowDataPacket[]>("SELECT id FROM employees WHERE account_user_id = ? LIMIT 1", [accountId]); return rows[0]?.id as string | undefined; }
function mapProject(row: RowDataPacket) { return { ...row, budget: Number(row.budget), progress: Number(row.progress), members: typeof row.members === "string" ? JSON.parse(row.members || "[]") : row.members || [] }; }

export async function GET(request: NextRequest) {
  const session = await sessionFor(request);
  if (!session) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const admin = session.role === "admin" || session.role === "superadmin" || session.role === "manager";
  const id = await employeeId(session.id);
  const [rows] = await getDb().execute<RowDataPacket[]>("SELECT id, name, partner_id AS partnerId, partner_name AS partnerName, project_type AS type, status, priority, leader_id AS leaderId, members, DATE_FORMAT(start_date, '%Y-%m-%d') AS startDate, DATE_FORMAT(end_date, '%Y-%m-%d') AS endDate, budget, description, progress FROM projects ORDER BY created_at DESC");
  const projects = rows.map(mapProject).filter((project) => admin || project.members.some((member: { employeeId?: string }) => member.employeeId === id));
  return NextResponse.json({ projects });
}

export async function POST(request: NextRequest) {
  const session = await sessionFor(request);
  if (!session || !["admin", "superadmin", "manager"].includes(session.role)) return NextResponse.json({ message: "仅管理员可以创建项目。" }, { status: 403 });
  const input = await request.json() as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 191) : "";
  const partnerName = typeof input.partnerName === "string" ? input.partnerName.trim().slice(0, 191) : "";
  if (!name || !partnerName) return NextResponse.json({ message: "请填写项目名称和合作方。" }, { status: 400 });
  const id = `project-${Date.now()}-${randomBytes(3).toString("hex")}`;
  await getDb().execute("INSERT INTO projects (id, name, partner_name, project_type, status, priority, leader_id, members, start_date, end_date, budget, description, progress) VALUES (?, ?, ?, 'other', 'planning', 'medium', ?, '[]', ?, ?, ?, '', ?)", [id, name, partnerName, String(session.id), typeof input.startDate === "string" ? input.startDate || null : null, typeof input.endDate === "string" ? input.endDate || null : null, Number(input.budget) || 0, Math.max(0, Math.min(100, Number(input.progress) || 0))]);
  return NextResponse.json({ id }, { status: 201 });
}
