import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { SESSION_COOKIE, readSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

type Input = { name?: unknown; department?: unknown; position?: unknown; email?: unknown; phone?: unknown; role?: unknown };

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function createPassword() {
  return `${randomBytes(6).toString("base64url")}Aa1!`;
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await readSession(token) : null;
  if (!session || !["admin", "superadmin"].includes(session.role)) return NextResponse.json({ message: "仅管理员可以查看员工资料。" }, { status: 403 });
  const [rows] = await getDb().execute<RowDataPacket[]>("SELECT id, employee_no AS employeeNo, name, email, phone, department, position, role, status, DATE_FORMAT(join_date, '%Y-%m-%d') AS joinDate FROM employees ORDER BY created_at DESC");
  return NextResponse.json({ employees: rows });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await readSession(token) : null;
  if (!session || !["admin", "superadmin"].includes(session.role)) return NextResponse.json({ message: "仅管理员可以创建员工账号。" }, { status: 403 });

  let input: Input;
  try { input = await request.json(); } catch { return NextResponse.json({ message: "请求格式不正确。" }, { status: 400 }); }
  const name = text(input.name, 100);
  const department = text(input.department, 100);
  const position = text(input.position, 100);
  const email = text(input.email, 191).toLowerCase();
  const phone = text(input.phone, 40);
  const role = input.role === "admin" || input.role === "manager" || input.role === "employee" ? input.role : "employee";
  if (role === "admin" && session.role !== "superadmin") return NextResponse.json({ message: "只有公司总账号可以授予管理员权限。" }, { status: 403 });
  if (!name || !department || !position || !email || !phone || !/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ message: "请完整填写姓名、部门、职位、邮箱和手机号。" }, { status: 400 });

  const db = getDb();
  const connection = await db.getConnection();
  const employeeId = `emp-${Date.now()}-${randomBytes(3).toString("hex")}`;
  const username = `fs${randomBytes(5).toString("hex")}`;
  const initialPassword = createPassword();
  const employeeNo = `FS${String(Date.now()).slice(-6)}`;
  const joinDate = new Date().toISOString().slice(0, 10);

  try {
    await connection.beginTransaction();
    const passwordHash = await bcrypt.hash(initialPassword, 12);
    const [account] = await connection.execute<ResultSetHeader>("INSERT INTO users (username, email, name, password_hash, role, status) VALUES (?, ?, ?, ?, ?, 'active')", [username, email, name, passwordHash, role]);
    await connection.execute("INSERT INTO employees (id, employee_no, name, email, phone, department, position, account_user_id, role, status, join_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)", [employeeId, employeeNo, name, email, phone, department, position, account.insertId, role, joinDate]);
    await connection.commit();
    return NextResponse.json({ employee: { id: employeeId, employeeNo, name, email, phone, department, position, role, status: "active", joinDate, avatar: "" }, credentials: { username, initialPassword } }, { status: 201 });
  } catch (error) {
    await connection.rollback();
    const message = error instanceof Error && /duplicate/i.test(error.message) ? "该邮箱、工号或账号已存在。" : "员工账号创建失败，请检查数据库是否已初始化。";
    return NextResponse.json({ message }, { status: 500 });
  } finally { connection.release(); }
}
