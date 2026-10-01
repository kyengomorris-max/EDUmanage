export const PERMISSIONS = [
  ["platform.schools", "Create and manage schools on the platform"],
  ["users.read", "View user accounts"],
  ["users.write", "Create users and change roles or access"],
  ["students.read", "View student records"],
  ["students.write", "Create and update student records"],
  ["teachers.read", "View teacher records"],
  ["teachers.write", "Create and update teacher records"],
  ["academics.read", "View classes, subjects, timetables, and results"],
  ["academics.write", "Manage classes, subjects, years, terms, and timetables"],
  ["attendance.read", "View attendance"],
  ["attendance.write", "Mark attendance"],
  ["grades.read", "View grades and report cards"],
  ["grades.write", "Enter marks and report remarks"],
  ["fees.read", "View fees, invoices, and balances"],
  ["fees.write", "Manage fee structures and scholarships"],
  ["payments.write", "Record payments and issue receipts"],
  ["assignments.read", "View assignments"],
  ["assignments.write", "Create assignments and grade submissions"],
  ["assignments.submit", "Submit assignment work"],
  ["materials.read", "View learning materials"],
  ["materials.write", "Upload learning materials"],
  ["announcements.read", "View announcements"],
  ["announcements.write", "Publish announcements"],
  ["messages.read", "Read messages"],
  ["messages.write", "Send messages"],
  ["events.read", "View school events"],
  ["events.write", "Create and update events"],
  ["library.read", "View the library catalogue"],
  ["library.write", "Manage books and loans"],
  ["discipline.read", "View discipline records"],
  ["discipline.write", "Record and update discipline incidents"],
  ["documents.read", "View documents"],
  ["documents.write", "Upload and manage documents"],
  ["reports.read", "Generate and export reports"],
  ["settings.read", "View school settings"],
  ["settings.write", "Update school settings"],
  ["audit.read", "View the audit log"],
  ["dashboard.read", "View the dashboard"],
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number][0];

export const ALL_PERMISSION_KEYS: PermissionKey[] = PERMISSIONS.map(([key]) => key);

const SCHOOL_ADMIN = ALL_PERMISSION_KEYS.filter((key) => key !== "platform.schools");

const PRINCIPAL: PermissionKey[] = [
  "dashboard.read",
  "users.read",
  "students.read",
  "teachers.read",
  "academics.read",
  "attendance.read",
  "grades.read",
  "grades.write",
  "fees.read",
  "assignments.read",
  "materials.read",
  "announcements.read",
  "announcements.write",
  "messages.read",
  "messages.write",
  "events.read",
  "events.write",
  "discipline.read",
  "discipline.write",
  "documents.read",
  "reports.read",
  "settings.read",
  "audit.read",
];

const TEACHER: PermissionKey[] = [
  "dashboard.read",
  "students.read",
  "teachers.read",
  "academics.read",
  "attendance.read",
  "attendance.write",
  "grades.read",
  "grades.write",
  "assignments.read",
  "assignments.write",
  "materials.read",
  "materials.write",
  "announcements.read",
  "announcements.write",
  "messages.read",
  "messages.write",
  "events.read",
  "documents.read",
  "documents.write",
];

const STUDENT: PermissionKey[] = [
  "dashboard.read",
  "academics.read",
  "attendance.read",
  "grades.read",
  "fees.read",
  "assignments.read",
  "assignments.submit",
  "materials.read",
  "announcements.read",
  "messages.read",
  "messages.write",
  "events.read",
  "documents.read",
  "library.read",
];

const PARENT: PermissionKey[] = [
  "dashboard.read",
  "students.read",
  "academics.read",
  "attendance.read",
  "grades.read",
  "fees.read",
  "announcements.read",
  "messages.read",
  "messages.write",
  "events.read",
  "documents.read",
];

const ACCOUNTANT: PermissionKey[] = [
  "dashboard.read",
  "students.read",
  "fees.read",
  "fees.write",
  "payments.write",
  "reports.read",
  "announcements.read",
  "documents.read",
];

const LIBRARIAN: PermissionKey[] = [
  "dashboard.read",
  "students.read",
  "library.read",
  "library.write",
  "announcements.read",
  "documents.read",
];

export const ROLES = [
  ["SUPER_ADMIN", "Super Admin", "Platform owner with access to every school"],
  ["SCHOOL_ADMIN", "School Administrator", "Runs day-to-day school operations"],
  ["PRINCIPAL", "Principal", "Monitors performance, conduct, and school reports"],
  ["TEACHER", "Teacher", "Teaches classes, marks attendance, and enters results"],
  ["STUDENT", "Student", "Views learning, attendance, results, and fees"],
  ["PARENT", "Parent / Guardian", "Follows a child's attendance, results, and fees"],
  ["ACCOUNTANT", "Accountant", "Manages fees, payments, and financial reports"],
  ["LIBRARIAN", "Librarian", "Manages the library catalogue and loans"],
] as const;

export type RoleKey = (typeof ROLES)[number][0];

export const ROLE_PERMISSIONS: Record<RoleKey, readonly PermissionKey[]> = {
  SUPER_ADMIN: ALL_PERMISSION_KEYS,
  SCHOOL_ADMIN,
  PRINCIPAL,
  TEACHER,
  STUDENT,
  PARENT,
  ACCOUNTANT,
  LIBRARIAN,
};

export function hasPermission(permissions: readonly string[], key: string) {
  return permissions.includes("*") || permissions.includes(key);
}

export function hasAnyPermission(permissions: readonly string[], keys: readonly string[]) {
  return keys.some((key) => hasPermission(permissions, key));
}

const ROLE_RANK: RoleKey[] = [
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "PRINCIPAL",
  "ACCOUNTANT",
  "LIBRARIAN",
  "TEACHER",
  "PARENT",
  "STUDENT",
];

export function primaryRole(roles: readonly string[]): RoleKey | null {
  for (const role of ROLE_RANK) {
    if (roles.includes(role)) return role;
  }
  return null;
}
