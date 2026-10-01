export const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "LATE", "EXCUSED"] as const;
export const INVOICE_STATUSES = ["PENDING", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"] as const;
export const PAYMENT_METHODS = ["CASH", "BANK", "MOBILE", "CARD", "OTHER"] as const;
export const WEEKDAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
export const GENDERS = ["MALE", "FEMALE", "OTHER", "UNSPECIFIED"] as const;
export const USER_STATUSES = ["ACTIVE", "INACTIVE", "PENDING"] as const;
export const AUDIENCE_TYPES = ["SCHOOL", "ROLE", "CLASS"] as const;
export const ANNOUNCEMENT_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export const DOCUMENT_CATEGORIES = ["STUDENT", "TEACHER", "CERTIFICATE", "REPORT_CARD", "POLICY", "OTHER"] as const;
export const DISCIPLINE_STATUSES = ["OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"] as const;
export const LOAN_STATUSES = ["BORROWED", "RETURNED", "OVERDUE", "LOST"] as const;

export const REPORT_TYPES = [
  "enrollment",
  "attendance",
  "performance",
  "fees",
  "outstanding",
  "workload",
  "library",
  "discipline",
  "assignments",
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

export const ALLOWED_UPLOAD_MIME = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "video/mp4",
  "video/webm",
] as const;

export const BLOCKED_EXTENSIONS = [
  "exe",
  "bat",
  "cmd",
  "com",
  "msi",
  "dll",
  "sh",
  "ps1",
  "js",
  "mjs",
  "cjs",
  "jar",
  "html",
  "htm",
  "svg",
];
