import { announcementSchema, eventSchema, messageSchema } from "@edumanage/shared";
import type { AudienceType, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import type { Actor } from "../../lib/access.js";
import { can, isStaffManager } from "../../lib/access.js";
import { forbidden, notFound } from "../../lib/errors.js";
import { notifyUsers } from "../../lib/notify.js";
import { clean, fullName } from "../../lib/serialize.js";

async function audienceUserIds(schoolId: string, audienceType: AudienceType, audienceRole?: string | null, classSectionId?: string | null) {
  if (audienceType === "ROLE" && audienceRole) {
    const users = await prisma.user.findMany({ where: { schoolId, status: "ACTIVE", roles: { some: { role: { key: audienceRole } } } }, select: { id: true } });
    return users.map((user) => user.id);
  }
  if (audienceType === "CLASS" && classSectionId) {
    const enrollments = await prisma.enrollment.findMany({
      where: { classSectionId, status: "ACTIVE" },
      include: { student: { include: { guardians: { include: { guardian: true } } } } },
    });
    const teachers = await prisma.teachingAssignment.findMany({ where: { classSectionId }, include: { teacher: true } });
    return [
      ...enrollments.map((item) => item.student.userId),
      ...enrollments.flatMap((item) => item.student.guardians.map((link) => link.guardian.userId)),
      ...teachers.map((item) => item.teacher.userId),
    ];
  }
  const users = await prisma.user.findMany({ where: { schoolId, status: "ACTIVE" }, select: { id: true } });
  return users.map((user) => user.id);
}

function visibleAnnouncement(actor: Actor): Prisma.AnnouncementWhereInput {
  if (isStaffManager(actor)) return {};
  const roles = actor.roles;
  return {
    OR: [
      { audienceType: "SCHOOL" },
      { audienceType: "ROLE", audienceRole: { in: roles } },
      ...(actor.roles.includes("TEACHER") || actor.roles.includes("STUDENT") || actor.roles.includes("PARENT") ? [{ audienceType: "CLASS" as const }] : []),
    ],
  };
}

export async function listAnnouncements(actor: Actor, schoolId: string) {
  if (!can(actor, "announcements.read")) throw forbidden();
  const rows = await prisma.announcement.findMany({
    where: { schoolId, AND: [visibleAnnouncement(actor)], OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    include: { author: true, classSection: true },
    orderBy: { publishAt: "desc" },
    take: 100,
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    priority: row.priority,
    audienceType: row.audienceType,
    audienceRole: row.audienceRole,
    className: row.classSection?.name ?? null,
    classSectionId: row.classSectionId,
    author: fullName(row.author),
    publishAt: row.publishAt,
    fileName: row.fileName,
    storedName: row.storedName,
  }));
}

export async function createAnnouncement(actor: Actor, schoolId: string, body: unknown, file?: Express.Multer.File) {
  if (!can(actor, "announcements.write")) throw forbidden();
  const input = announcementSchema.parse(body);
  if (!isStaffManager(actor) && input.audienceType === "SCHOOL") throw forbidden("Teachers can announce to a class or role, not the whole school.");
  const row = await prisma.announcement.create({
    data: {
      schoolId,
      title: input.title,
      body: input.body,
      priority: input.priority,
      audienceType: input.audienceType,
      audienceRole: clean(input.audienceRole),
      classSectionId: clean(input.classSectionId),
      authorId: actor.id,
      fileName: file?.originalname,
      storedName: file?.filename,
      mimeType: file?.mimetype,
      size: file?.size,
    },
  });
  const ids = await audienceUserIds(schoolId, input.audienceType, input.audienceRole, input.classSectionId);
  await notifyUsers(ids.filter((id) => id !== actor.id), {
    schoolId,
    type: "ANNOUNCEMENT",
    title: input.title,
    body: input.body.slice(0, 180),
    link: "/app/announcements",
  });
  return row;
}

export async function listNotifications(actor: Actor) {
  return prisma.notification.findMany({
    where: { userId: actor.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
}

export async function markNotification(actor: Actor, id: string) {
  await prisma.notification.updateMany({ where: { id, userId: actor.id }, data: { readAt: new Date() } });
}

export async function markAllNotifications(actor: Actor) {
  await prisma.notification.updateMany({ where: { userId: actor.id, readAt: null }, data: { readAt: new Date() } });
}

async function assertCanMessage(actor: Actor, schoolId: string, recipientId: string) {
  if (recipientId === actor.id) throw forbidden("Choose someone else.");
  const recipient = await prisma.user.findFirst({ where: { id: recipientId, schoolId, status: "ACTIVE" }, include: { roles: { include: { role: true } }, student: true, teacher: true, guardian: true } });
  if (!recipient) throw notFound("Recipient not found.");
  if (isStaffManager(actor)) return recipient;
  const recipientRoles = recipient.roles.map((item) => item.role.key);
  if (actor.roles.includes("TEACHER")) {
    const teacher = await prisma.teacher.findUnique({ where: { userId: actor.id } });
    const classIds = teacher
      ? (await prisma.teachingAssignment.findMany({ where: { teacherId: teacher.id }, select: { classSectionId: true } })).map((item) => item.classSectionId)
      : [];
    if (recipient.student) {
      const enrolled = await prisma.enrollment.findFirst({ where: { studentId: recipient.student.id, classSectionId: { in: classIds }, status: "ACTIVE" } });
      if (!enrolled) throw forbidden("You can message students in your classes.");
    } else if (recipient.guardian) {
      const link = await prisma.studentGuardian.findFirst({
        where: { guardianId: recipient.guardian.id, student: { enrollments: { some: { classSectionId: { in: classIds }, status: "ACTIVE" } } } },
      });
      if (!link) throw forbidden("You can message parents of students in your classes.");
    } else if (!recipientRoles.includes("SCHOOL_ADMIN") && !recipientRoles.includes("PRINCIPAL")) {
      throw forbidden("You cannot message that account.");
    }
    return recipient;
  }
  if (actor.roles.includes("PARENT") || actor.roles.includes("STUDENT")) {
    if (!recipient.teacher && !recipientRoles.includes("SCHOOL_ADMIN") && !recipientRoles.includes("PRINCIPAL")) {
      throw forbidden("You can message teachers and school leadership.");
    }
    return recipient;
  }
  throw forbidden();
}

export async function listRecipients(actor: Actor, schoolId: string) {
  const users = await prisma.user.findMany({
    where: { schoolId, status: "ACTIVE", NOT: { id: actor.id } },
    include: { roles: { include: { role: true } } },
    orderBy: { lastName: "asc" },
    take: 80,
  });
  const allowed = [];
  for (const user of users) {
    try {
      await assertCanMessage(actor, schoolId, user.id);
      allowed.push({ id: user.id, name: fullName(user) });
    } catch {
      // This account is outside the sender's messaging permission.
    }
  }
  return allowed;
}

export async function listMessages(actor: Actor, schoolId: string, box: string, search: string) {
  if (!can(actor, "messages.read")) throw forbidden();
  const where: Prisma.MessageWhereInput = {
    schoolId,
    ...(box === "sent" ? { senderId: actor.id } : { recipientId: actor.id }),
    ...(search
      ? { OR: [{ subject: { contains: search, mode: "insensitive" } }, { body: { contains: search, mode: "insensitive" } }] }
      : {}),
  };
  const rows = await prisma.message.findMany({
    where,
    include: { sender: true, recipient: true },
    orderBy: { createdAt: "desc" },
    take: 80,
  });
  return rows.map((row) => ({
    id: row.id,
    subject: row.subject,
    body: row.body,
    readAt: row.readAt,
    createdAt: row.createdAt,
    parentId: row.parentId,
    sender: { id: row.senderId, name: fullName(row.sender) },
    recipient: { id: row.recipientId, name: fullName(row.recipient) },
  }));
}

export async function sendMessage(actor: Actor, schoolId: string, body: unknown) {
  if (!can(actor, "messages.write")) throw forbidden();
  const input = messageSchema.parse(body);
  await assertCanMessage(actor, schoolId, input.recipientId);
  const message = await prisma.message.create({
    data: {
      schoolId,
      senderId: actor.id,
      recipientId: input.recipientId,
      subject: input.subject,
      body: input.body,
      parentId: clean(input.parentId),
    },
  });
  await notifyUsers([input.recipientId], {
    schoolId,
    type: "MESSAGE",
    title: `Message from ${actor.firstName} ${actor.lastName}`,
    body: input.subject,
    link: "/app/messages",
  });
  return message;
}

export async function markMessage(actor: Actor, id: string) {
  await prisma.message.updateMany({ where: { id, recipientId: actor.id }, data: { readAt: new Date() } });
}

export async function listEvents(schoolId: string) {
  const rows = await prisma.event.findMany({
    where: { schoolId },
    include: { organizer: true, classSection: true },
    orderBy: { startsAt: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    location: row.location,
    audienceType: row.audienceType,
    audienceRole: row.audienceRole,
    className: row.classSection?.name ?? null,
    classSectionId: row.classSectionId,
    organizer: row.organizer ? fullName(row.organizer) : null,
  }));
}

export async function createEvent(actor: Actor, schoolId: string, body: unknown) {
  if (!can(actor, "events.write")) throw forbidden();
  const input = eventSchema.parse(body);
  const event = await prisma.event.create({
    data: {
      schoolId,
      name: input.name,
      description: input.description,
      startsAt: new Date(input.startsAt),
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      location: clean(input.location),
      organizerId: actor.id,
      audienceType: input.audienceType,
      audienceRole: clean(input.audienceRole),
      classSectionId: clean(input.classSectionId),
    },
  });
  const ids = await audienceUserIds(schoolId, input.audienceType, input.audienceRole, input.classSectionId);
  await notifyUsers(ids, { schoolId, type: "EVENT", title: input.name, body: input.description.slice(0, 180), link: "/app/events" });
  return event;
}

export async function updateEvent(actor: Actor, schoolId: string, id: string, body: unknown) {
  if (!can(actor, "events.write")) throw forbidden();
  const existing = await prisma.event.findFirst({ where: { id, schoolId } });
  if (!existing) throw notFound("Event not found.");
  const input = eventSchema.partial().parse(body);
  return prisma.event.update({
    where: { id },
    data: {
      name: input.name,
      description: input.description,
      startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
      endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
      location: input.location === undefined ? undefined : clean(input.location),
    },
  });
}

export async function deleteEvent(actor: Actor, schoolId: string, id: string) {
  if (!can(actor, "events.write")) throw forbidden();
  const existing = await prisma.event.findFirst({ where: { id, schoolId } });
  if (!existing) throw notFound("Event not found.");
  await prisma.event.delete({ where: { id } });
}
