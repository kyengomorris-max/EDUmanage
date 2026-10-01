import type { NotificationType } from "@prisma/client";
import { prisma } from "../config/prisma.js";

export async function notifyUsers(
  userIds: string[],
  input: { schoolId: string; type: NotificationType; title: string; body: string; link?: string },
) {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return;
  const users = await prisma.user.findMany({
    where: { id: { in: unique }, notifyInApp: true, status: "ACTIVE" },
    select: { id: true },
  });
  if (users.length === 0) return;
  await prisma.notification.createMany({
    data: users.map((user) => ({
      schoolId: input.schoolId,
      userId: user.id,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link,
    })),
  });
}
