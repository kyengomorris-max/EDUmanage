import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  preferencesSchema,
  registerSchoolSchema,
  resetPasswordSchema,
} from "@edumanage/shared";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { writeAudit } from "../../lib/audit.js";
import { AppError } from "../../lib/errors.js";
import { sendMail } from "../../lib/mail.js";
import { hashToken, randomToken, signAccessToken } from "../../lib/tokens.js";
import { loadActor } from "../../middleware/auth.js";

const REFRESH_COOKIE = "edumanage_refresh";
const REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
const DUMMY_HASH = bcrypt.hashSync("edumanage-timing-placeholder", 10);

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.NODE_ENV === "production",
    path: "/api/auth",
    maxAge: REFRESH_MS,
  };
}

export function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, cookieOptions());
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(), maxAge: 0 });
}

async function issueSession(userId: string, req: Request, res: Response) {
  const raw = randomToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + REFRESH_MS),
      userAgent: req.header("user-agent")?.slice(0, 255),
      ip: req.ip,
    },
  });
  setRefreshCookie(res, raw);
  return signAccessToken(userId);
}

async function publicUser(userId: string) {
  const actor = await loadActor(userId);
  if (!actor) throw new AppError(401, "UNAUTHENTICATED", "Sign in to continue.");
  const school = actor.schoolId
    ? await prisma.school.findUnique({
        where: { id: actor.schoolId },
        select: {
          id: true,
          name: true,
          code: true,
          motto: true,
          logoUrl: true,
          primaryColor: true,
          timezone: true,
          isDemo: true,
          address: true,
          phone: true,
          email: true,
          website: true,
        },
      })
    : null;
  return { ...actor, school };
}

export async function login(req: Request, res: Response) {
  const body = loginSchema.parse(req.body);
  const email = body.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  const matches = await bcrypt.compare(body.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !matches) throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  if (user.status === "INACTIVE") throw new AppError(403, "ACCOUNT_DISABLED", "This account has been deactivated.");
  if (!user.emailVerifiedAt || user.status === "PENDING") {
    throw new AppError(403, "EMAIL_UNVERIFIED", "Verify your email before signing in.");
  }
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const accessToken = await issueSession(user.id, req, res);
  await writeAudit({
    schoolId: user.schoolId,
    userId: user.id,
    action: "auth.login",
    entity: "User",
    entityId: user.id,
    description: "Signed in",
    ip: req.ip,
  });
  const profile = await publicUser(user.id);
  return { accessToken, user: profile };
}

export async function refresh(req: Request, res: Response) {
  const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (!raw) throw new AppError(401, "UNAUTHENTICATED", "Sign in to continue.");
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!existing || existing.expiresAt < new Date()) {
    clearRefreshCookie(res);
    throw new AppError(401, "UNAUTHENTICATED", "Your session has expired. Sign in again.");
  }
  if (existing.revokedAt) {
    const justRotated = Date.now() - existing.revokedAt.getTime() < 15_000;
    if (!justRotated) {
      clearRefreshCookie(res);
      throw new AppError(401, "UNAUTHENTICATED", "Your session has expired. Sign in again.");
    }
    const user = await publicUser(existing.userId);
    if (user.status === "INACTIVE") throw new AppError(403, "ACCOUNT_DISABLED", "This account has been deactivated.");
    return { accessToken: signAccessToken(existing.userId), user };
  }
  await prisma.refreshToken.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });
  const accessToken = await issueSession(existing.userId, req, res);
  const user = await publicUser(existing.userId);
  if (user.status === "INACTIVE") throw new AppError(403, "ACCOUNT_DISABLED", "This account has been deactivated.");
  return { accessToken, user };
}

export async function logout(req: Request, res: Response) {
  const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (raw) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(raw), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  clearRefreshCookie(res);
  if (req.actor) {
    await writeAudit({
      schoolId: req.actor.schoolId,
      userId: req.actor.id,
      action: "auth.logout",
      entity: "User",
      entityId: req.actor.id,
      description: "Signed out",
      ip: req.ip,
    });
  }
}

export async function me(req: Request) {
  if (!req.actor) throw new AppError(401, "UNAUTHENTICATED", "Sign in to continue.");
  return publicUser(req.actor.id);
}

export async function updateMe(req: Request) {
  if (!req.actor) throw new AppError(401, "UNAUTHENTICATED", "Sign in to continue.");
  const body = preferencesSchema.parse(req.body);
  await prisma.user.update({
    where: { id: req.actor.id },
    data: {
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone === "" ? null : body.phone,
      themePreference: body.themePreference,
      sidebarCollapsed: body.sidebarCollapsed,
      notifyInApp: body.notifyInApp,
      notifyEmail: body.notifyEmail,
    },
  });
  return publicUser(req.actor.id);
}

export async function changePassword(req: Request) {
  if (!req.actor) throw new AppError(401, "UNAUTHENTICATED", "Sign in to continue.");
  const body = changePasswordSchema.parse(req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.actor.id } });
  const matches = await bcrypt.compare(body.currentPassword, user.passwordHash);
  if (!matches) throw new AppError(400, "INVALID_PASSWORD", "The current password is incorrect.");
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(body.newPassword, 12) },
  });
  await prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await writeAudit({
    schoolId: user.schoolId,
    userId: user.id,
    action: "auth.password_changed",
    entity: "User",
    entityId: user.id,
    description: "Changed password",
    ip: req.ip,
  });
}

async function storeEmailToken(userId: string, kind: "reset" | "verify") {
  const raw = randomToken();
  const data = { userId, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + 1000 * 60 * 60) };
  if (kind === "reset") await prisma.passwordResetToken.create({ data });
  else await prisma.emailVerificationToken.create({ data });
  return raw;
}

export async function forgotPassword(req: Request) {
  const body = forgotPasswordSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
  if (!user || user.status === "INACTIVE") return { sent: true };
  const token = await storeEmailToken(user.id, "reset");
  const url = `${env.APP_URL}/reset-password?token=${token}`;
  const mail = await sendMail({
    to: user.email,
    subject: "Reset your EduManage password",
    text: `Use this link within one hour to choose a new password:\n${url}`,
  });
  return { sent: true, ...(mail.delivered || env.NODE_ENV === "production" ? {} : { devResetUrl: url }) };
}

export async function resetPassword(req: Request) {
  const body = resetPasswordSchema.parse(req.body);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(body.token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new AppError(400, "INVALID_TOKEN", "This reset link is invalid or has expired.");
  }
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: await bcrypt.hash(body.password, 12) },
    }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.refreshToken.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
}

export async function verifyEmail(req: Request) {
  const token = String(req.body?.token || "");
  const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new AppError(400, "INVALID_TOKEN", "This verification link is invalid or has expired.");
  }
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: new Date(), status: "ACTIVE" },
    }),
    prisma.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);
}

export async function resendVerification(req: Request) {
  const body = forgotPasswordSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
  if (!user || user.emailVerifiedAt) return { sent: true };
  const token = await storeEmailToken(user.id, "verify");
  const url = `${env.APP_URL}/verify-email?token=${token}`;
  const mail = await sendMail({
    to: user.email,
    subject: "Verify your EduManage email",
    text: `Confirm your email address:\n${url}`,
  });
  return { sent: true, ...(mail.delivered || env.NODE_ENV === "production" ? {} : { devVerificationUrl: url }) };
}

export async function sessions(req: Request) {
  if (!req.actor) throw new AppError(401, "UNAUTHENTICATED", "Sign in to continue.");
  const rows = await prisma.refreshToken.findMany({
    where: { userId: req.actor.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, userAgent: true, ip: true, createdAt: true, expiresAt: true },
  });
  return rows;
}

export async function revokeSession(req: Request) {
  if (!req.actor) throw new AppError(401, "UNAUTHENTICATED", "Sign in to continue.");
  await prisma.refreshToken.updateMany({
    where: { id: req.params.id, userId: req.actor.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

function schoolCode(name: string) {
  const base = name.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 10) || "SCHOOL";
  return `${base}${Math.floor(100 + Math.random() * 900)}`;
}

export async function registerSchool(req: Request) {
  const body = registerSchoolSchema.parse(req.body);
  const email = body.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError(409, "CONFLICT", "An account with that email already exists.");
  const role = await prisma.role.findUnique({ where: { key: "SCHOOL_ADMIN" } });
  if (!role) throw new AppError(500, "SERVER_ERROR", "The access catalogue is not ready yet.");
  const year = new Date().getFullYear();
  const passwordHash = await bcrypt.hash(body.password, 12);
  const created = await prisma.school.create({
    data: {
      name: body.schoolName.trim(),
      code: schoolCode(body.schoolName),
      phone: body.phone || null,
      email,
      users: {
        create: {
          email,
          passwordHash,
          firstName: body.adminFirstName.trim(),
          lastName: body.adminLastName.trim(),
          phone: body.phone || null,
          status: "PENDING",
          roles: { create: { roleId: role.id } },
        },
      },
      academicYears: {
        create: {
          name: String(year),
          startDate: new Date(Date.UTC(year, 0, 6)),
          endDate: new Date(Date.UTC(year, 11, 15)),
          isCurrent: true,
        },
      },
      gradeScales: {
        create: {
          name: "Default secondary scale",
          isDefault: true,
          bands: {
            create: [
              { minScore: 80, maxScore: 100, letter: "A", points: 12, remark: "Excellent", sortOrder: 1 },
              { minScore: 70, maxScore: 79, letter: "B", points: 10, remark: "Very good", sortOrder: 2 },
              { minScore: 60, maxScore: 69, letter: "C", points: 8, remark: "Good", sortOrder: 3 },
              { minScore: 50, maxScore: 59, letter: "D", points: 6, remark: "Pass", sortOrder: 4 },
              { minScore: 0, maxScore: 49, letter: "E", points: 4, remark: "Needs improvement", sortOrder: 5 },
            ],
          },
        },
      },
      settings: {
        create: { key: "academics.computePositions", value: true },
      },
    },
    include: { users: true },
  });
  const admin = created.users[0];
  const token = await storeEmailToken(admin.id, "verify");
  const url = `${env.APP_URL}/verify-email?token=${token}`;
  const mail = await sendMail({
    to: email,
    subject: "Verify your EduManage school",
    text: `Confirm ${created.name} and activate your administrator account:\n${url}`,
  });
  await writeAudit({
    schoolId: created.id,
    userId: admin.id,
    action: "school.registered",
    entity: "School",
    entityId: created.id,
    description: `Registered school ${created.name}`,
    ip: req.ip,
  });
  return {
    schoolId: created.id,
    ...(mail.delivered || env.NODE_ENV === "production" ? {} : { devVerificationUrl: url }),
  };
}

export async function demoAccounts() {
  if (!env.DEMO_MODE) return [];
  return [
    { role: "Super Admin", email: "super@edumanage.dev" },
    { role: "School Administrator", email: "admin@greenfield.demo" },
    { role: "Principal", email: "principal@greenfield.demo" },
    { role: "Teacher", email: "grace.adebayo@greenfield.demo" },
    { role: "Student", email: "student01@greenfield.demo" },
    { role: "Parent", email: "parent1@greenfield.demo" },
    { role: "Accountant", email: "accounts@greenfield.demo" },
    { role: "Librarian", email: "library@greenfield.demo" },
  ];
}
