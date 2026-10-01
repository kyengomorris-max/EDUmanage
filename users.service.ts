import bcrypt from "bcryptjs";
import { z } from "zod";
import { ROLES, passwordSchema, type RoleKey } from "@edumanage/shared";
import { prisma } from "../../config/prisma.js";
import type { Actor } from "../../lib/access.js";
import { writeAudit } from "../../lib/audit.js";
import { AppError, forbidden, notFound } from "../../lib/errors.js";
import { readPage } from "../../lib/http.js";
import { clean, fullName } from "../../lib/serialize.js";
import { temporaryPassword } from "../../lib/tokens.js";

const roleKeys = ROLES.map((role) => role[0]) as [RoleKey, ...RoleKey[]];

const createUserSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: z.string().email(),
  phone: z.string().optional(),
  role: z.enum(roleKeys),
  password: passwordSchema.optional(),
  jobTitle: z.string().optional(),
  department: z.string().optional(),
});

export async function listUsers(schoolId: string, query: Record<string, unknown>) {
  const page = readPage(query);
  const role = typeof query.role === "string" ? query.role : "";
  const where = {
    schoolId,
    ...(role ? { roles: { some: { role: { key: role } } } } : {}),
    ...(page.search
      ? {
          OR: [
            { firstName: { contains: page.search, mode: "insensitive" as const } },
            { lastName: { contains: page.search, mode: "insensitive" as const } },
            { email: { contains: page.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      include: { roles: { include: { role: true } }, staff: true },
      orderBy: { lastName: page.dir },
      skip: page.skip,
      take: page.pageSize,
    }),
  ]);
  return {
    rows: rows.map((user) => ({
      id: user.id,
      name: fullName(user),
      email: user.email,
      phone: user.phone,
      status: user.status,
      roles: user.roles.map((item) => item.role.key),
      jobTitle: user.staff?.jobTitle ?? null,
      department: user.staff?.department ?? null,
    })),
    page,
    total,
  };
}

export async function createUser(actor: Actor, schoolId: string, body: unknown, ip?: string) {
  const input = createUserSchema.parse(body);
  if (input.role === "SUPER_ADMIN" && !actor.roles.includes("SUPER_ADMIN")) throw forbidden();
  const email = input.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) throw new AppError(409, "CONFLICT", "A user with that email already exists.");
  const role = await prisma.role.findUniqueOrThrow({ where: { key: input.role } });
  const password = input.password ?? temporaryPassword();
  const user = await prisma.user.create({
    data: {
      schoolId,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      firstName: input.firstName,
      lastName: input.lastName,
      phone: clean(input.phone),
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
      roles: { create: { roleId: role.id } },
      ...(input.role === "ACCOUNTANT" || input.role === "LIBRARIAN" || input.role === "SCHOOL_ADMIN" || input.role === "PRINCIPAL"
        ? {
            staff: {
              create: {
                schoolId,
                staffNumber: `S-${Date.now().toString().slice(-6)}`,
                jobTitle: clean(input.jobTitle) ?? input.role,
                department: clean(input.department),
              },
            },
          }
        : {}),
    },
  });
  await writeAudit({
    schoolId,
    userId: actor.id,
    action: "user.created",
    entity: "User",
    entityId: user.id,
    description: `Created ${input.role} account for ${input.email}`,
    ip,
  });
  return { id: user.id, temporaryPassword: input.password ? undefined : password };
}

export async function updateUserStatus(actor: Actor, schoolId: string, id: string, status: "ACTIVE" | "INACTIVE", ip?: string) {
  const user = await prisma.user.findFirst({ where: { id, schoolId } });
  if (!user) throw notFound("User not found.");
  if (user.id === actor.id) throw new AppError(400, "BAD_REQUEST", "You cannot deactivate your own account.");
  await prisma.user.update({ where: { id }, data: { status } });
  await writeAudit({
    schoolId,
    userId: actor.id,
    action: "user.status_changed",
    entity: "User",
    entityId: id,
    description: `Set account status to ${status}`,
    ip,
  });
}

export async function setUserRoles(actor: Actor, schoolId: string, id: string, roles: string[], ip?: string) {
  const user = await prisma.user.findFirst({ where: { id, schoolId } });
  if (!user) throw notFound("User not found.");
  const allowed = roles.filter((role): role is RoleKey => roleKeys.includes(role as RoleKey));
  if (allowed.includes("SUPER_ADMIN") && !actor.roles.includes("SUPER_ADMIN")) throw forbidden();
  const records = await prisma.role.findMany({ where: { key: { in: allowed } } });
  await prisma.userRole.deleteMany({ where: { userId: id } });
  await prisma.userRole.createMany({ data: records.map((role) => ({ userId: id, roleId: role.id })) });
  await writeAudit({
    schoolId,
    userId: actor.id,
    action: "user.permissions_changed",
    entity: "User",
    entityId: id,
    description: `Updated roles to ${allowed.join(", ")}`,
    ip,
    meta: { roles: allowed },
  });
}

export async function listSchools(actor: Actor) {
  if (!actor.roles.includes("SUPER_ADMIN")) throw forbidden();
  return prisma.school.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { students: true, teachers: true, users: true } } },
  });
}

const schoolSchema = z.object({
  name: z.string().trim().min(2).max(120),
  motto: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  website: z.string().optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  timezone: z.string().optional(),
});

export async function createSchool(actor: Actor, body: unknown, ip?: string) {
  if (!actor.roles.includes("SUPER_ADMIN")) throw forbidden();
  const input = schoolSchema.parse(body);
  const code = input.name.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 10) + Math.floor(100 + Math.random() * 900);
  const school = await prisma.school.create({
    data: {
      name: input.name,
      code,
      motto: clean(input.motto),
      address: clean(input.address),
      phone: clean(input.phone),
      email: clean(input.email),
      website: clean(input.website),
      primaryColor: input.primaryColor,
      timezone: input.timezone,
    },
  });
  await writeAudit({
    schoolId: school.id,
    userId: actor.id,
    action: "school.created",
    entity: "School",
    entityId: school.id,
    description: `Created school ${school.name}`,
    ip,
  });
  return school;
}
