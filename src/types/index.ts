// 梵燊集团 OA 系统 - 类型定义

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar?: string;
  department: string;
  position: string;
  role: 'admin' | 'manager' | 'employee';
  status: 'active' | 'inactive';
  joinDate: string;
  employeeNo: string;
}

export interface Attendance {
  id: string;
  userId: string;
  date: string;
  clockIn: string;
  clockOut: string;
  status: 'normal' | 'late' | 'early' | 'absent' | 'overtime';
  location?: string;
  type: 'office' | 'remote';
}

export interface LeaveRequest {
  id: string;
  userId: string;
  type: 'annual' | 'sick' | 'personal' | 'marriage' | 'bereavement' | 'maternity' | 'other';
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  approverId?: string;
  approvedAt?: string;
  comment?: string;
  createdAt: string;
}

export interface ApprovalFlow {
  id: string;
  name: string;
  type: 'expense' | 'leave' | 'travel' | 'seal' | 'contract' | 'purchase' | 'other';
  steps: ApprovalStep[];
}

// 审批步骤：approverId 存真实审批人账号 id，approverRole 存该步骤对应的审批角色（用于查找）
// 金额分层标准：
//   报销：≤500 经理→财务；500~3000 经理→总监→财务；3000~10000 经理→总监→财务→CEO；>10000 同上+董事会备案
//   请假：≤3天 直属主管；3~7天 +部门经理；>7天 +HRD
export interface ApprovalStep {
  order: number;
  approverId: string;       // 真实审批人 employeeId（创建时由流程引擎按角色解析填入）
  approverName: string;     // 审批人姓名
  approverRole: 'manager' | 'director' | 'finance' | 'ceo' | 'hrd' | 'board';  // 审批人角色
  status: 'pending' | 'approved' | 'rejected';
  comment?: string;
  approvedAt?: string;
}

export interface AttachmentFile {
  name: string;
  url: string;
  size: number;
  type: string;
  storageKey?: string;
}

export interface ApprovalRequest {
  id: string;
  flowId: string;
  applicantId: string;
  title: string;
  content: string;
  type: ApprovalFlow['type'];
  amount?: number;
  attachments?: AttachmentFile[];
  status: 'pending' | 'approved' | 'rejected' | 'processing';
  currentStep: number;
  steps: ApprovalStep[];
  createdAt: string;
  updatedAt: string;
}

export interface Document {
  id: string;
  name: string;
  type: 'policy' | 'form' | 'manual' | 'template' | 'report' | 'other';
  category: string;
  size: string;
  uploaderId: string;
  uploadDate: string;
  downloads: number;
  path: string;
}

export interface KnowledgeArticle {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  authorId: string;
  createdAt: string;
  updatedAt: string;
  views: number;
}

export interface Partner {
  id: string;
  name: string;
  type: 'association' | 'college' | 'enterprise';
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
  address: string;
  cooperation: string;
  status: 'active' | 'inactive' | 'potential';
  projects: string[];
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  partnerId: string;
  partnerName: string;
  type: 'ai_custom_dev' | 'integration' | 'consulting' | 'training' | 'other';
  status: 'planning' | 'in_progress' | 'testing' | 'delivered' | 'maintenance' | 'completed';
  priority: 'high' | 'medium' | 'low';
  leaderId: string;
  members: string[];
  startDate: string;
  endDate: string;
  budget: number;
  description: string;
  progress: number;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  type: 'notice' | 'policy' | 'event' | 'urgent';
  authorId: string;
  createdAt: string;
  pinned: boolean;
  views: number;
}

export interface ExpenseReport {
  id: string;
  userId: string;
  type: 'travel' | 'entertainment' | 'office' | 'transport' | 'other';
  amount: number;
  description: string;
  date: string;
  status: 'pending' | 'approved' | 'rejected';
  attachments?: string[];
  createdAt: string;
}

export interface Meeting {
  id: string;
  title: string;
  room: string;
  organizerId: string;
  attendees: string[];
  startTime: string;
  endTime: string;
  description: string;
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  minutes?: string;
}

export interface Todo {
  id: string;
  userId: string;
  title: string;
  type: 'approval' | 'task' | 'meeting' | 'other';
  relatedId?: string;
  createdAt: string;
  completed: boolean;
}

export interface DashboardStats {
  totalEmployees: number;
  todayAttendance: number;
  pendingApprovals: number;
  activeProjects: number;
  monthlyRevenue: number;
  partnerCount: number;
}
