import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getSessionFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
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

function parseSteps(value: string | ApprovalStep[]): ApprovalStep[] {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 审批详情：返回审批单 + 流程时间线 + 当前用户可审批判断 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ message: "请先登录" }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  const [requests] = await db.execute<RowDataPacket[]>(
    `SELECT ar.id, ar.flow_id AS flowId, ar.applicant_id AS applicantId,
            ar.title, ar.content, ar.approval_type AS type, ar.amount, ar.status,
            ar.current_step AS currentStep, ar.steps, ar.attachments,
            DATE_FORMAT(ar.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
            DATE_FORMAT(ar.updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt
     FROM approval_requests ar WHERE ar.id = ? LIMIT 1`,
    [id]
  );
  const row = requests[0];
  if (!row) return NextResponse.json({ message: "申请不存在" }, { status: 404 });

  // 申请人信息
  const [emps] = await db.execute<RowDataPacket[]>(
    "SELECT id, name, department AS dept, position FROM employees WHERE id = ? LIMIT 1",
    [row.applicantId]
  );
  const applicant = emps[0] || { id: row.applicantId, name: "未知", dept: "", position: "" };

  // 当前登录员工
  const [meRows] = await db.execute<RowDataPacket[]>(
    "SELECT id FROM employees WHERE account_user_id = ? LIMIT 1",
    [session.id]
  );
  const me = meRows[0] as { id: string } | undefined;

  const steps = parseSteps(row.steps as string | ApprovalStep[]);
  const currentStep = Number(row.currentStep) || 0;
  const isAdmin = session.role === "admin" || session.role === "superadmin";
  const isAssigned = !!me && !!steps[currentStep] && steps[currentStep].approverId === me.id;
  const isApplicant = !!me && row.applicantId === me.id;
  const inProgress = row.status === "pending" || row.status === "processing";
  const canApprove = inProgress && !isApplicant && (isAdmin || isAssigned);

  // 子表附加信息（请假/报销/用章），供小程序详情页展示
  let extra: Record<string, unknown> = {};
  try {
    if (row.type === "leave" || row.flowId === "leave") {
      const [leaveRows] = await db.execute<RowDataPacket[]>(
        "SELECT leave_type AS leaveType, DATE_FORMAT(start_date, '%Y-%m-%d') AS startDate, DATE_FORMAT(end_date, '%Y-%m-%d') AS endDate, days FROM leave_requests WHERE id = ? LIMIT 1",
        [row.id]
      );
      if (leaveRows[0]) extra = { ...leaveRows[0], days: Number(leaveRows[0].days) };
    } else if (row.type === "expense" || row.flowId === "expense") {
      const [expRows] = await db.execute<RowDataPacket[]>(
        "SELECT expense_type AS expenseType, DATE_FORMAT(expense_date, '%Y-%m-%d') AS date FROM expense_reports WHERE id = ? LIMIT 1",
        [row.id]
      );
      if (expRows[0]) extra = { ...expRows[0] };
    } else if (row.type === "seal" || row.flowId === "seal") {
      const [sealRows] = await db.execute<RowDataPacket[]>(
        "SELECT seal_type AS sealType, document_name AS documentName, copies, urgency FROM seal_requests WHERE id = ? LIMIT 1",
        [row.id]
      );
      if (sealRows[0]) extra = { ...sealRows[0], copies: Number(sealRows[0].copies) };
    }
  } catch (err) {
    console.warn("[approvals GET] 子表附加信息读取失败:", err);
  }

  return NextResponse.json({
    approval: {
      id: row.id,
      flowId: row.flowId,
      title: row.title,
      content: row.content,
      type: row.type,
      amount: row.amount == null ? undefined : Number(row.amount),
      status: row.status,
      currentStep,
      steps,
      attachments: Array.isArray(row.attachments) ? row.attachments : [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      applicant,
      canApprove,
      ...extra,
    },
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ message: "请先登录" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { status?: string; comment?: string };
  const decision = body.status;
  const comment = typeof body.comment === "string" ? body.comment.trim() : "";
  if (decision !== "approved" && decision !== "rejected") {
    return NextResponse.json({ message: "审批状态无效。" }, { status: 400 });
  }

  const { id } = await params;
  const pool = getDb();
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // 行锁：防止并发审批同一申请（双击/多人同时操作）
    const [requests] = await conn.execute<ApprovalRow[]>(
      "SELECT id, flow_id, approval_type, applicant_id, amount, steps, current_step, status FROM approval_requests WHERE id = ? LIMIT 1 FOR UPDATE",
      [id]
    );
    const target = requests[0];
    if (!target) {
      await conn.rollback();
      return NextResponse.json({ message: "申请不存在" }, { status: 404 });
    }
    if (target.status === "approved" || target.status === "rejected") {
      await conn.rollback();
      return NextResponse.json({ message: "该申请已审批完成" }, { status: 400 });
    }

    const steps: ApprovalStep[] =
      typeof target.steps === "string" ? JSON.parse(target.steps) : (target.steps as unknown as ApprovalStep[]);
    const currentStep = target.current_step;
    if (currentStep >= steps.length) {
      await conn.rollback();
      return NextResponse.json({ message: "流程已结束" }, { status: 400 });
    }
    const currentApprovalStep = steps[currentStep];

    // 查当前登录员工（用 employeeId 作为审批人标识）
    const [currentEmployeeRows] = await conn.execute<EmployeeRow[]>(
      "SELECT id, name, account_user_id, role FROM employees WHERE account_user_id = ? LIMIT 1",
      [session.id]
    );
    const currentEmployee = currentEmployeeRows[0];

    const isAdmin = session.role === "admin" || session.role === "superadmin";
    const isAssignedApprover = currentEmployee && currentApprovalStep.approverId === currentEmployee.id;

    // 防止自审批：审批人不能是申请人
    const isApplicant = currentEmployee && target.applicant_id === currentEmployee.id;
    if (!isAdmin && !isAssignedApprover) {
      await conn.rollback();
      return NextResponse.json(
        { message: `当前步骤应由【${currentApprovalStep.approverName}】审批，您无权限操作` },
        { status: 403 }
      );
    }
    if (isApplicant && !isAdmin) {
      await conn.rollback();
      return NextResponse.json({ message: "不能审批自己提交的申请" }, { status: 403 });
    }

    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    const approverIdForSubTable = currentEmployee?.id || String(session.id);
    const commentText = comment || (decision === "approved" ? "已通过" : "已驳回");

    // 更新当前步骤
    steps[currentStep] = {
      ...currentApprovalStep,
      status: decision,
      approvedAt: now,
      comment: commentText,
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

    await conn.execute(
      "UPDATE approval_requests SET status = ?, current_step = ?, steps = ?, updated_at = NOW() WHERE id = ?",
      [nextStatus, nextCurrentStep, JSON.stringify(steps), id]
    );

    // 同步到子表（使用 employeeId 作为 approver_id，与其他写入保持一致）
    if (target.flow_id === "leave" || target.approval_type === "leave") {
      await conn.execute(
        "UPDATE leave_requests SET status = ?, approver_id = ?, approved_at = NOW(), comment = ? WHERE id = ?",
        [nextStatus, approverIdForSubTable, commentText, id]
      );
    } else if (target.flow_id === "expense") {
      await conn.execute("UPDATE expense_reports SET status = ? WHERE id = ?", [nextStatus, id]);
    } else if (target.flow_id === "seal") {
      await conn.execute(
        "UPDATE seal_requests SET status = ?, approver_id = ?, approved_at = NOW(), comment = ? WHERE id = ?",
        [nextStatus, approverIdForSubTable, commentText, id]
      );
    }

    await conn.commit();

    // 通知申请人 + 下一审批人
    try {
      const [applicantRows] = await getDb().execute<RowDataPacket[]>(
        "SELECT account_user_id, name FROM employees WHERE id = ? LIMIT 1",
        [target.applicant_id]
      );
      const applicantUserId = applicantRows[0]?.account_user_id as number | undefined;
      const applicantName = (applicantRows[0]?.name as string) || "申请人";
      const title = (target as any).title || "申请";
      const isFinal = nextStatus === "approved" || nextStatus === "rejected";
      const notif = isFinal
        ? {
            type: nextStatus === "approved" ? "approval_approved" : "approval_rejected",
            title: nextStatus === "approved" ? `已通过：${title}` : `已驳回：${title}`,
            content:
              nextStatus === "approved"
                ? `您提交的「${title}」已审批通过`
                : `您提交的「${title}」被驳回，原因：${commentText}`,
          }
        : {
            type: "approval_pending",
            title: `待审批：${title}`,
            content: `${applicantName}的申请流转到您审批`,
          };
      if (applicantUserId) {
        await createNotification({
          recipientId: applicantUserId,
          type: notif.type,
          title: notif.title,
          content: notif.content,
          relatedUrl: `/approvals/${id}`,
          relatedId: id,
        });
      }
      // 通知下一审批人（如果还在流程中）
      if (nextStatus === "processing" && steps[nextCurrentStep]?.approverId) {
        const [nextUserRows] = await getDb().execute<RowDataPacket[]>(
          "SELECT account_user_id FROM employees WHERE id = ? LIMIT 1",
          [steps[nextCurrentStep].approverId]
        );
        const nextUserId = nextUserRows[0]?.account_user_id as number | undefined;
        if (nextUserId) {
          await createNotification({
            recipientId: nextUserId,
            type: "approval_pending",
            title: `待审批：${title}`,
            content: `${applicantName}的申请流转到您审批`,
            relatedUrl: `/approvals/${id}`,
            relatedId: id,
          });
        }
      }
    } catch (e) {
      console.error("[approvals PATCH] notify failed:", e);
    }

    return NextResponse.json({
      ok: true,
      nextStatus,
      nextStep: nextCurrentStep,
      totalSteps: steps.length,
    });
  } catch (err: any) {
    await conn.rollback();
    console.error("[approvals PATCH] error:", err);
    return NextResponse.json({ message: "审批操作失败，请稍后重试" }, { status: 500 });
  } finally {
    conn.release();
  }
}
