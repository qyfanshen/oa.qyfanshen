import type { RowDataPacket } from "mysql2";
import { getDb } from "@/lib/db";

/**
 * 审批步骤：按金额 / 天数分层动态生成。
 * 解析流程：
 *   1. 按"申请类型 + 阈值"算出需要哪些角色（approverRole）
 *   2. 在 employees 表中查该角色 + 部门的第一人作为 approverId
 *   3. 返回 ApprovalStep[] 列表
 *
 * 当前为方案 A 阶段：审批人按"角色+部门"匹配第一个匹配的员工。
 * 方案 B 阶段：会扩展为支持流程模板 + 部门经理精确匹配。
 */

export type ApproverRole = "manager" | "director" | "finance" | "ceo" | "hrd" | "board";

export interface FlowStep {
  order: number;
  approverId: string;       // 真实审批人 employeeId
  approverName: string;
  approverRole: ApproverRole;
  status: "pending";
}

interface EmployeeRow extends RowDataPacket {
  id: string;
  name: string;
  position: string;
  department: string;
  manager_id: string | null;
  approval_quota: number | null;
}

/**
 * 报销金额分层规则：
 *   ≤ 500      → 部门经理 → 财务
 *   ≤ 3000     → 部门经理 → 财务总监 → 财务
 *   ≤ 10000    → 部门经理 → 财务总监 → 财务 → CEO
 *   > 10000    → 部门经理 → 财务总监 → 财务 → CEO → 董事会备案
 */
function expenseRolesByAmount(amount: number): ApproverRole[] {
  const roles: ApproverRole[] = ["manager"];
  if (amount <= 500) {
    roles.push("finance");
  } else if (amount <= 3000) {
    roles.push("director", "finance");
  } else if (amount <= 10000) {
    roles.push("director", "finance", "ceo");
  } else {
    roles.push("director", "finance", "ceo", "board");
  }
  return roles;
}

/**
 * 请假类型枚举
 */
export type LeaveType = "annual" | "sick" | "personal" | "marriage" | "bereavement" | "maternity" | "other";

/**
 * 方案2：按"请假类型 + 天数"组合分层。
 * 表头：≤1天 / 2-3天 / 3-7天 / >7天
 *
 *   事假 (personal)：    主管 | 主管 | 主管→经理 | 主管→经理→HRD
 *   病假 (sick)：        主管 | 主管 | 主管      | 主管→HRD
 *   年假 (annual)：      主管 | 主管 | 主管→经理 | 主管→经理→HRD
 *   婚假 (marriage)：    -    | -    | 主管      | 主管→HRD
 *   丧假 (bereavement)： -    | 主管 | 主管      | 主管→HRD
 *   产假 (maternity)：   -    | -    | -         | 主管→经理→HRD→CEO
 *   其他 (other)：       主管 | 主管 | 主管→经理 | 主管→经理→HRD
 */
function leaveFlowByTypeAndDays(type: LeaveType, days: number): ApproverRole[] {
  // 产假特殊：法定长假期，所有都要逐级走
  if (type === "maternity") {
    if (days <= 7) return ["manager"];
    return ["manager", "director", "hrd", "ceo"];
  }
  // 婚假：超过 1 天就起跳
  if (type === "marriage") {
    if (days <= 2) return ["manager"];
    if (days <= 7) return ["manager"];
    return ["manager", "hrd"];
  }
  // 丧假：仅 2-7 天走单级，超过 7 天加 HRD
  if (type === "bereavement") {
    if (days <= 1) return ["manager"];
    if (days <= 7) return ["manager"];
    return ["manager", "hrd"];
  }
  // 病假：优先不打扰，不上经理
  if (type === "sick") {
    if (days <= 3) return ["manager"];
    if (days <= 7) return ["manager"];
    return ["manager", "hrd"];
  }
  // 默认：事假 / 年假 / 其他
  if (days <= 1) return ["manager"];
  if (days <= 3) return ["manager"];
  if (days <= 7) return ["manager", "director"];
  return ["manager", "director", "hrd"];
}

/**
 * 在 employees 表中查找指定角色的第一审批人。
 * 查找策略：按 position 字段匹配（兼容现有数据）。
 *   manager     → position LIKE '%经理%' 或 '%主管%'
 *   director    → position LIKE '%总监%'
 *   finance     → position LIKE '%财务%'
 *   ceo         → position = '总经理' 或 'CEO'
 *   hrd         → position LIKE '%人事%' 或 '%HR%'
 *   board       → position LIKE '%董事%'
 */
async function findApproverByRole(role: ApproverRole, department: string, excludeEmployeeId?: string): Promise<{ id: string; name: string } | null> {
  const patterns: Record<ApproverRole, string[]> = {
    manager: ["经理", "主管"],
    director: ["总监"],
    finance: ["财务"],
    ceo: ["总经理", "CEO", "总裁"],
    hrd: ["人事", "HR", "人力"],
    board: ["董事"],
  };
  const db = getDb();
  const excludeClause = excludeEmployeeId ? "AND id <> ?" : "";
  const excludeParams = excludeEmployeeId ? [excludeEmployeeId] : [];
  // 优先找同部门；找不到再跨部门找
  for (const scope of [department, ""]) {
    for (const keyword of patterns[role]) {
      const sql = scope
        ? `SELECT id, name FROM employees WHERE status = 'active' AND department = ? AND position LIKE ? ${excludeClause} LIMIT 1`
        : `SELECT id, name FROM employees WHERE status = 'active' AND position LIKE ? ${excludeClause} LIMIT 1`;
      const params = scope ? [scope, `%${keyword}%`, ...excludeParams] : [`%${keyword}%`, ...excludeParams];
      const [rows] = await db.execute<EmployeeRow[]>(sql, params);
      if (rows[0]) return { id: rows[0].id, name: rows[0].name };
    }
  }
  // 实在找不到就用 admin 兜底（排除申请人）
  const adminSql = excludeEmployeeId
    ? "SELECT id, name FROM employees WHERE role IN ('admin', 'superadmin') AND status = 'active' AND id <> ? LIMIT 1"
    : "SELECT id, name FROM employees WHERE role IN ('admin', 'superadmin') AND status = 'active' LIMIT 1";
  const adminParams = excludeEmployeeId ? [excludeEmployeeId] : [];
  const [adminRows] = await db.execute<EmployeeRow[]>(adminSql, adminParams);
  if (adminRows[0]) return { id: adminRows[0].id, name: adminRows[0].name };
  return null;
}

/**
 * 构造报销审批步骤。
 */
export async function buildExpenseSteps(amount: number, department: string, applicantId?: string): Promise<FlowStep[]> {
  const roles = expenseRolesByAmount(amount);
  const steps: FlowStep[] = [];
  const usedApproverIds = new Set<string>();
  for (let i = 0; i < roles.length; i++) {
    const approver = await findApproverByRole(roles[i], department, applicantId);
    if (!approver || usedApproverIds.has(approver.id)) continue;
    usedApproverIds.add(approver.id);
    steps.push({
      order: i,
      approverId: approver.id,
      approverName: approver.name,
      approverRole: roles[i],
      status: "pending",
    });
  }
  return steps;
}

/**
 * 辅助：根据"请假类型 + 天数"返回应使用的流程模板 ID。
 * 用于在 approval_flow_templates 表中查找匹配的模板。
 */
export function matchLeaveTemplateId(type: LeaveType, days: number): string {
  if (type === "sick") return days <= 7 ? "ft-leave-sick-short" : "ft-leave-sick-long";
  if (type === "marriage") return days <= 7 ? "ft-leave-marriage-short" : "ft-leave-marriage-long";
  if (type === "bereavement") return days <= 7 ? "ft-leave-bereavement-short" : "ft-leave-bereavement-long";
  if (type === "maternity") return days <= 7 ? "ft-leave-maternity-short" : "ft-leave-maternity-long";
  // personal / annual / other
  if (days <= 3) return "ft-leave-default-short";
  if (days <= 7) return "ft-leave-default-mid";
  return "ft-leave-default-long";
}

/**
 * 构造请假审批步骤。
 */
export async function buildLeaveSteps(type: LeaveType, days: number, department: string, applicantId?: string): Promise<FlowStep[]> {
  const roles = leaveFlowByTypeAndDays(type, days);
  const steps: FlowStep[] = [];
  const usedApproverIds = new Set<string>();
  for (let i = 0; i < roles.length; i++) {
    const approver = await findApproverByRole(roles[i], department, applicantId);
    if (!approver || usedApproverIds.has(approver.id)) continue;
    usedApproverIds.add(approver.id);
    steps.push({
      order: i,
      approverId: approver.id,
      approverName: approver.name,
      approverRole: roles[i],
      status: "pending",
    });
  }
  return steps;
}

/**
 * 公章审批类型枚举
 */
export type SealType = "company" | "contract" | "finance" | "legal_person" | "department";

/**
 * 公章审批按印章类型分层：
 *   部门章 (department):     部门经理
 *   合同章 (contract):      部门经理 → 行政总监
 *   财务章 (finance):       部门经理 → 行政总监
 *   公章 (company):         部门经理 → 行政总监 → 总经理
 *   法人章 (legal_person):  部门经理 → 行政总监 → 总经理
 */
function sealRolesByType(type: SealType): ApproverRole[] {
  if (type === "department") return ["manager"];
  if (type === "contract" || type === "finance") return ["manager", "director"];
  return ["manager", "director", "ceo"];
}

/**
 * 构造公章审批步骤。
 */
export async function buildSealSteps(type: SealType, department: string, applicantId?: string): Promise<FlowStep[]> {
  const roles = sealRolesByType(type);
  const steps: FlowStep[] = [];
  const usedApproverIds = new Set<string>();
  for (let i = 0; i < roles.length; i++) {
    const approver = await findApproverByRole(roles[i], department, applicantId);
    if (!approver || usedApproverIds.has(approver.id)) continue;
    usedApproverIds.add(approver.id);
    steps.push({
      order: i,
      approverId: approver.id,
      approverName: approver.name,
      approverRole: roles[i],
      status: "pending",
    });
  }
  return steps;
}
