import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { teacherSchema } from "@edumanage/shared";
import { prisma } from "../../config/prisma.js";
import type { Actor } from "../../lib/access.js";
import { can } from "../../lib/access.js";
import { writeAudit } from "../../lib/audit.js";
import { AppError, forbidden, notFound } from "../../lib/errors.js";
import { readPage } from "../../lib/http.js";
import { clean, dateOnly, fullName, isoDate } from "../../lib/serialize.js";
import { temporaryPassword } from "../../lib/tokens.js";

function shape(teacher: Prisma.TeacherGetPayload<{ include: { user: true; assignments: { include: { subject: true; classSection: true } }; classTeacherOf: true } }>) {
  return {
    id: teacher.id,
    staffNumber: teacher.staffNumber,
    qualifications: teacher.qualifications,
    employmentType: teacher.employmentType,
    hireDate: isoDate(teacher.hireDate),
    status: teacher.status,
    name: fullName(teacher.user),
    user: {
      id: teacher.user.id,
      firstName: teacher.user.firstName,
      lastName: teacher.user.lastName,
      email: teacher.user.email,
      phone: teacher.user.phone,
    },
    subjects: [...new Set(teacher.assignments.map((item) => item.subject.name))],
    classes: [...new Set([...teacher.assignments.map((item) => item.classSection.name), ...teacher.classTeacherOf.map((item) => item.name)])],
    assignments: teacher.assignments.map((item) => ({
      id: item.id,
      subjectId: item.subjectId,
      subject: item.subject.name,
      classSectionId: item.classSectionId,
      className: item.classSection.name,
    })),
  };
}

const include = {
  user: true,
  assignments: { include: { subject: true, classSection: true } },
  classTeacherOf: true,
} satisfies Prisma.TeacherInclude;

export async function listTeachers(actor: Actor, schoolId: string, query: Record<string, unknown>) {
  if (!can(actor, "teachers.read") && !can(actor, "academics.read")) throw forbidden();
  const page = readPage(query);
  const where: Prisma.TeacherWhereInput = {
    schoolId,
    ...(page.search
      ? {
          OR: [
            { staffNumber: { contains: page.search, mode: "insensitive" } },
            { user: { firstName: { contains: page.search, mode: "insensitive" } } },
            { user: { lastName: { contains: page.search, mode: "insensitive" } } },
            { user: { email: { contains: page.search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.teacher.count({ where }),
    prisma.teacher.findMany({
      where,
      include,
      orderBy: { user: { lastName: page.dir } },
      skip: page.skip,
      take: page.pageSize,
    }),
  ]);
  return { rows: rows.map(shape), page, total };
}

export async function getTeacher(actor: Actor, schoolId: string, id: string) {
  if (!can(actor, "teachers.read") && actor.roles.includes("TEACHER")) {
    const own = await prisma.teacher.findFirst({ where: { id, userId: actor.id, schoolId }, include });
    if (!own) throw notFound("Teacher not found.");
    return shape(own);
  }
  if (!can(actor, "teachers.read")) throw forbidden();
  const teacher = await prisma.teacher.findFirst({ where: { id, schoolId }, include });
  if (!teacher) throw notFound("Teacher not found.");
  return shape(teacher);
}

async function nextStaff(schoolId: string) {
  const count = await prisma.teacher.count({ where: { schoolId } });
  return `T-${String(count + 1).padStart(3, "0")}`;
}

export async function createTeacher(actor: Actor, schoolId: string, body: unknown, ip?: string) {
  if (!can(actor, "teachers.write")) throw forbidden();
  const input = teacherSchema.parse(body);
  const email = input.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) throw new AppError(409, "CONFLICT", "A user with that email already exists.");
  const role = await prisma.role.findUniqueOrThrow({ where: { key: "TEACHER" } });
  const password = temporaryPassword();
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
    },
  });
  const teacher = await prisma.teacher.create({
    data: {
      schoolId,
      userId: user.id,
      staffNumber: clean(input.staffNumber) ?? (await nextStaff(schoolId)),
      qualifications: clean(input.qualifications),
      employmentType: input.employmentType,
      hireDate: dateOnly(input.hireDate),
    },
  });
  await writeAudit({
    schoolId,
    userId: actor.id,
    action: "teacher.created",
    entity: "Teacher",
    entityId: teacher.id,
    description: `Created teacher ${input.firstName} ${input.lastName}`,
    ip,
  });
  return { teacher: await getTeacher(actor, schoolId, teacher.id), temporaryPassword: password };
}

export async function updateTeacher(actor: Actor, schoolId: string, id: string, body: unknown, ip?: string) {
  if (!can(actor, "teachers.write")) throw forbidden();
  const existing = await prisma.teacher.findFirst({ where: { id, schoolId } });
  if (!existing) throw notFound("Teacher not found.");
  const input = teacherSchema.partial().parse(body);
  await prisma.teacher.update({
    where: { id },
    data: {
      staffNumber: clean(input.staffNumber) ?? undefined,
      qualifications: input.qualifications === undefined ? undefined : clean(input.qualifications),
      employmentType: input.employmentType,
      hireDate: input.hireDate === undefined ? undefined : dateOnly(input.hireDate),
      user: {
        update: {
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email?.toLowerCase(),
          phone: input.phone === undefined ? undefined : clean(input.phone),
        },
      },
    },
  });
  await writeAudit({
    schoolId,
    userId: actor.id,
    action: "teacher.updated",
    entity: "Teacher",
    entityId: id,
    description: "Updated a teacher record",
    ip,
  });
  return getTeacher(actor, schoolId, id);
}

export async function teacherTimetable(schoolId: string, id: string) {
  const slots = await prisma.timetableSlot.findMany({
    where: { schoolId, teacherId: id },
    include: { subject: true, classSection: true },
    orderBy: [{ day: "asc" }, { startTime: "asc" }],
  });
  return slots.map((slot) => ({
    id: slot.id,
    day: slot.day,
    startTime: slot.startTime,
    endTime: slot.endTime,
    room: slot.room,
    subject: slot.subject.name,
    className: slot.classSection.name,
  }));
}
