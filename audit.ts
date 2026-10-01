import type { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";

export async function writeAudit(entry: {
  schoolId?: string | null;
  userId?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  description: string;
  ip?: string | null;
  meta?: Prisma.InputJsonValue;
}) {
  await prisma.auditLog.create({
    data: {
      schoolId: entry.schoolId ?? null,
      userId: entry.userId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      description: entry.description,
      ip: entry.ip ?? null,
      meta: entry.meta,
    },
  });
}
