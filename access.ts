import { hasPermission, type RoleKey } from "@edumanage/shared";
import type { UserStatus } from "@prisma/client";
import { AppError, forbidden } from "./errors.js";

export type Actor = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  schoolId: string | null;
  status: UserStatus;
  roles: string[];
  permissions: string[];
  themePreference: string;
  sidebarCollapsed: boolean;
  notifyInApp: boolean;
  notifyEmail: boolean;
};

export function resolveSchoolId(actor: Actor, requested?: string | null) {
  if (actor.roles.includes("SUPER_ADMIN")) {
    const schoolId = requested || actor.schoolId;
    if (!schoolId) throw new AppError(400, "SCHOOL_REQUIRED", "Select a school to continue.");
    return schoolId;
  }
  if (!actor.schoolId) throw forbidden("This account is not assigned to a school.");
  if (requested && requested !== actor.schoolId) throw forbidden("You cannot access another school's records.");
  return actor.schoolId;
}

export function assertSchoolAccess(actor: Actor, schoolId: string) {
  if (actor.roles.includes("SUPER_ADMIN")) return;
  if (actor.schoolId !== schoolId) throw forbidden("You cannot access another school's records.");
}

export function can(actor: Actor, permission: string) {
  return hasPermission(actor.permissions, permission);
}

export function isRole(actor: Actor, role: RoleKey) {
  return actor.roles.includes(role);
}

export function isStaffManager(actor: Actor) {
  return actor.roles.some((role) => ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"].includes(role));
}
