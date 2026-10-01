import { schoolProfileSchema } from "@edumanage/shared";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import type { Actor } from "../../lib/access.js";
import { can } from "../../lib/access.js";
import { forbidden, notFound } from "../../lib/errors.js";
import { clean } from "../../lib/serialize.js";
import { DEFAULT_BRAND } from "@edumanage/shared";

export async function getSchool(schoolId: string) {
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) throw notFound("School not found.");
  const positions = await prisma.schoolSetting.findUnique({ where: { schoolId_key: { schoolId, key: "academics.computePositions" } } });
  return { ...school, computePositions: positions?.value !== false };
}

export async function updateSchool(actor: Actor, schoolId: string, body: unknown, logo?: string) {
  if (!can(actor, "settings.write")) throw forbidden();
  const input = schoolProfileSchema.parse(body);
  return prisma.school.update({
    where: { id: schoolId },
    data: {
      name: input.name,
      motto: clean(input.motto),
      address: clean(input.address),
      phone: clean(input.phone),
      email: clean(input.email),
      website: clean(input.website),
      primaryColor: input.primaryColor,
      timezone: input.timezone,
      logoUrl: logo,
    },
  });
}

export async function updateAcademicFlags(actor: Actor, schoolId: string, body: unknown) {
  if (!can(actor, "settings.write") && !can(actor, "academics.write")) throw forbidden();
  const input = z.object({ computePositions: z.boolean() }).parse(body);
  return prisma.schoolSetting.upsert({
    where: { schoolId_key: { schoolId, key: "academics.computePositions" } },
    update: { value: input.computePositions },
    create: { schoolId, key: "academics.computePositions", value: input.computePositions },
  });
}

export async function publicBranding() {
  const [name, tagline, stats] = await Promise.all([
    prisma.platformSetting.findUnique({ where: { key: "branding.name" } }),
    prisma.platformSetting.findUnique({ where: { key: "branding.tagline" } }),
    prisma.platformSetting.findUnique({ where: { key: "landing.stats" } }),
  ]);
  return {
    name: typeof name?.value === "string" ? name.value : DEFAULT_BRAND.name,
    tagline: typeof tagline?.value === "string" ? tagline.value : DEFAULT_BRAND.tagline,
    description: DEFAULT_BRAND.description,
    stats: (stats?.value as { students?: number; teachers?: number; classes?: number; attendance?: number } | null) ?? {
      students: 0,
      teachers: 0,
      classes: 0,
      attendance: 0,
    },
  };
}

export async function listAudit(actor: Actor, schoolId: string) {
  if (!can(actor, "audit.read")) throw forbidden();
  const rows = await prisma.auditLog.findMany({
    where: actor.roles.includes("SUPER_ADMIN") ? { OR: [{ schoolId }, { schoolId: null }] } : { schoolId },
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    description: row.description,
    entity: row.entity,
    ip: row.ip,
    createdAt: row.createdAt,
    user: row.user ? `${row.user.firstName} ${row.user.lastName}` : "System",
  }));
}
