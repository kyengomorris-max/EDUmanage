import type { NextFunction, Request, Response } from "express";
import { hasAnyPermission } from "@edumanage/shared";
import { prisma } from "../config/prisma.js";
import { AppError, forbidden } from "../lib/errors.js";
import { verifyAccessToken } from "../lib/tokens.js";
import type { Actor } from "../lib/access.js";
import { resolveSchoolId } from "../lib/access.js";

const userArgs = {
  include: {
    school: true,
    roles: {
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
      },
    },
  },
} as const;

export async function loadActor(userId: string): Promise<Actor | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, ...userArgs });
  if (!user) return null;
  const roles = user.roles.map((entry) => entry.role.key);
  const permissions = [
    ...new Set(user.roles.flatMap((entry) => entry.role.permissions.map((item) => item.permission.key))),
  ];
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    schoolId: user.schoolId,
    status: user.status,
    roles,
    permissions,
    themePreference: user.themePreference,
    sidebarCollapsed: user.sidebarCollapsed,
    notifyInApp: user.notifyInApp,
    notifyEmail: user.notifyEmail,
  };
}

export function presentActor(actor: Actor, school?: { id: string; name: string; code: string; motto: string | null; logoUrl: string | null; primaryColor: string; timezone: string; isDemo: boolean } | null) {
  return { ...actor, school: school ?? null };
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.header("authorization");
    if (!header?.startsWith("Bearer ")) throw new AppError(401, "UNAUTHENTICATED", "Sign in to continue.");
    const userId = verifyAccessToken(header.slice(7));
    const actor = await loadActor(userId);
    if (!actor || actor.status === "INACTIVE") throw new AppError(401, "UNAUTHENTICATED", "Sign in to continue.");
    req.actor = actor;
    next();
  } catch (error) {
    if (error instanceof AppError) return next(error);
    next(new AppError(401, "UNAUTHENTICATED", "Your session has expired. Sign in again."));
  }
}

export function requirePermission(...keys: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.actor) return next(new AppError(401, "UNAUTHENTICATED", "Sign in to continue."));
    if (!hasAnyPermission(req.actor.permissions, keys)) return next(forbidden());
    next();
  };
}

export function requireSchool(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.actor) throw new AppError(401, "UNAUTHENTICATED", "Sign in to continue.");
    req.schoolId = resolveSchoolId(req.actor, req.header("x-school-id"));
    next();
  } catch (error) {
    next(error);
  }
}

declare global {
  namespace Express {
    interface Request {
      actor?: Actor;
      schoolId?: string;
    }
  }
}
