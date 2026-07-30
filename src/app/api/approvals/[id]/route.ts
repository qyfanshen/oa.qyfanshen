import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { SESSION_COOKIE, readSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { ApprovalStep } from "@/types";

export const runtime = "nodejs";

interface ApprovalRow extends RowDataPacket {
  id: string;
  flow_id: string;
  approval_type: string;
  applicant_id: string;
  amount: number | null;
  steps: string | ApprovalStep[];
  current_step: number;
  status: string;
}

interface EmployeeRow extends RowDataPacket {
  id: string;
  name: string;
  account_user_id: number | null;
  role: string;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await readSession(token) : null;
  if (!session) return NextResponse.json({ message: "请先登录" }, { status: 401 });

  // 解析入参
  const body = await request.json().catch(() => ({})) as { status?: string; comment?: string };
  const decision = body.status;
  const comment = typeof body.comment === "string" ? body.comment.trim() : "";
  if (decision !== "approved" && decision !== "rejected") return NextResponse.json({ message: "审批状态无效。" }, { status: 400 });

  const { id } = await params;
  const db = getDb();

  // 读取申请
  const [requests] = await db.execute<ApprovalRow[]>("SELECT id, flow_id, approval_type, applicant_id, amount, steps, current_step, status FROM approval_requests WHERE id = ? LIMIT 1", [id]);
  const target = requests[0];
  if (!target) return NextResponse.json({ message: "申请不存在" }, { status: 404 });
  if (target.status === "approved" || target.status === "rejected") return NextResponse.json({ message: "该申请已审批完成" }, { status: 400 });

  // 解析 steps
  const steps: ApprovalStep[] = typeof target.steps === "string" ? JSON.parse(target.steps) : (target.steps as unknown as ApprovalStep[]);
  const currentStep = target.current_step;
  if (currentStep >= steps.length) return NextResponse.json({ message: "流程已结束" }, { status: 400 });
  const currentApprovalStep = steps[currentStep];

  // 校验：当前登录人是否就是该步骤的审批人
  // 通过 session.id (account_user_id) 查 employees 表的 id
  const [currentEmployeeRows] = await db.execute<EmployeeRow[]>("SELECT id, name, account_user_id, role FROM employees WHERE account_user_id = ? LIMIT 1", [session.id]);
  const currentEmployee = currentEmployeeRows[0];

  const isAdmin = session.role === "admin" || session.role === "superadmin";
  const isAssignedApprover = currentEmployee && currentApprovalStep.approverId === currentEmployee.id;
  // superadmin 可以审批任何步骤（兜底权限）
  if (!isAdmin && !isAssignedApprover) {
    return NextResponse.json({ message: `当前步骤应由【${currentApprovalStep.approverName}】审批，您无权限操作` }, { status: 403 });
  }

  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  // 更新当前步骤
  steps[currentStep] = {
    ...currentApprovalStep,
    status: decision,
    approvedAt: now,
    comment: comment || (decision === "approved" ? "已通过" : "已驳回"),
  };

  // 推进流程
  let nextStatus: "pending" | "processing" | "approved" | "rejected" = "processing";
  let nextCurrentStep = currentStep;
  if (decision === "rejected") {
    nextStatus = "rejected";
  } else if (currentStep >= steps.length - 1) {
    nextStatus = "approved";
  } else {
    nextStatus = "processing";
    nextCurrentStep = currentStep + 1;
  }

  await db.execute(
    "UPDATE approval_requests SET status = ?, current_step = ?, steps = ?, updated_at = NOW() WHERE id = ?",
    [nextStatus, nextCurrentStep, JSON.stringify(steps), id]
  );

  // 同步到子表
  if (target.flow_id === "leave" || target.approval_type === "leave") {
    await db.execute(
      "UPDATE leave_requests SET status = ?, approver_id = ?, approved_at = NOW(), comment = ? WHERE id = ?",
      [nextStatus, String(session.id), comment || (decision === "approved" ? "已通过" : "已驳回"), id]
    );
  }
  if (target.flow_id === "expense") {
    await db.execute("UPDATE expense_reports SET status = ? WHERE id = ?", [nextStatus, id]);
  }

  return NextResponse.json({
    ok: true,
    nextStatus,
    nextStep: nextCurrentStep,
    totalSteps: steps.length,
  });
}
