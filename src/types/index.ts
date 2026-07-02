// Firestore data model — field names & enums MUST match legacy app exactly.

export type Role = 'admin' | 'editor' | 'viewer' | 'content';

export interface Member {
  id: string; // doc id = uid
  uid: string;
  email: string;
  username: string;
  password?: string; // legacy: stored for admin visibility
  role: Role;
  title?: string;
  avatarUrl?: string;
  kpiOutput?: number; // target output points, default 100
  kpiQuality?: number; // target quality 0-10, default 10
  kpiDeadline?: number; // target deadline 0-10, default 10
  joinedAt?: unknown;
}

export type ProjectStatus = 'plan' | 'pre-production' | 'post-production' | 'done' | 'payment';
export type ProjectType = 'inhouse' | 'outsource';

export interface Project {
  id: string;
  title: string;
  description?: string;
  deadline?: string; // YYYY-MM-DD
  status: ProjectStatus;
  itemStatus?: string;
  projectType?: ProjectType | string;
  productType?: string; // name from productTypes
  productCount?: number;
  photoTarget?: number;
  videoTarget?: number;
  photoPoint?: number; // default 1
  videoPoint?: number; // default 3
  qualityScore?: number; // 0-10 when done
  createdAt?: unknown;
  createdBy?: string;
}

export type TaskCategory = 'photo' | 'video' | 'pre-production';
export type TaskStatus = 'pending' | 'in-progress' | 'completed';

export interface Task {
  id: string;
  projectId: string;
  teamId?: string;
  title: string;
  category: TaskCategory;
  status: TaskStatus;
  quantity?: number;
  amount?: number; // VND, pre-production only
  difficulty?: number; // 1-5
  dntt?: boolean;
  deadline?: string;
  hasKB?: boolean;
  images?: string[];
  reportDate?: string; // YYYY-MM-DD
  createdAt?: unknown;
  createdBy?: string;
  completedAt?: unknown;
  sourceReportId?: string;
}

export type OutputType = 'none' | 'photo' | 'video' | 'pre-production';

export interface Report {
  id: string;
  content: string;
  reportDate: string;
  projectId?: string;
  quantity?: number;
  outputType?: OutputType;
  hasKB?: boolean;
  reportType?: 'manual' | 'auto';
  createdAt?: unknown;
  createdBy?: string;
  userEmail?: string;
  relatedTaskId?: string;
}

export interface ProductType {
  id: string;
  name: string;
  points: number;
  category: string; // 'Ảnh' | 'Video' | 'Outsource'
  notes?: string;
}

export type DailyStatus = 'planned' | 'in-progress' | 'done' | 'published';

export interface DailyContent {
  id: string;
  title: string;
  type: string; // Reels | Short | Viral / Trending | Brand Content | Lịch đăng
  platform: string; // Instagram | TikTok | Facebook | YouTube | Đa kênh
  assigneeId?: string;
  dueDate?: string;
  notes?: string;
  points?: number;
  status: DailyStatus;
  projectId?: string;
  createdAt?: unknown;
  createdBy?: string;
}

export interface TeamDoc {
  id: string;
  name?: string;
  sheetsWebhookUrl?: string;
  createdBy?: string;
}
