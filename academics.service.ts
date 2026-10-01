import { z } from "zod";
import { timetableSlotSchema } from "@edumanage/shared";
import type { Weekday } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import type { Actor } from "../../lib/access.js";
import { can } from "../../lib/access.js";
import { forbidden, notFound } from "../../lib/errors.js";
import { clean, dateOnly, isoDate } from "../../lib/serialize.js";

const yearSchema = z.object({
  name: z.string().trim().min(2).max(40),
  startDate: z.string(),
  endDate: z.string(),
  isCurrent: z.boolean().optional(),
});

const termSchema = z.object({
  academicYearId: z.string().uuid(),
  name: z.string().trim().min(2).max(40),
  startDate: z.string(),
  endDate: z.string(),
  isCurrent: z.boolean().optional(),
});

const named = z.object({ name: z.string().trim().min(1).max(60), sortOrder: z.number().int().optional() });

const classSchema = z.object({
  classLevelId: z.string().uuid(),
  streamId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  name: z.string().trim().min(2).max(80).optional(),
  room: z.string().optional(),
  classTeacherId: z.string().uuid().optional().or(z.literal("")),
  capacity: z.number().int().positive().max(200).optional(),
});

const subjectSchema = z.object({
  name: z.string().trim().min(2).max(80),
  code: z.string().trim().min(2).max(12),
});

function assertWrite(actor: Actor) {
  if (!can(actor, "academics.write")) throw forbidden();
}

export async function listYears(schoolId: string) {
  const rows = await prisma.academicYear.findMany({ where: { schoolId }, orderBy: { startDate: "desc" }, include: { terms: true } });
  return rows.map((year) => ({ ...year, startDate: isoDate(year.startDate), endDate: isoDate(year.endDate), terms: year.terms.map((term) => ({ ...term, startDate: isoDate(term.startDate), endDate: isoDate(term.endDate) })) }));
}

export async function createYear(actor: Actor, schoolId: string, body: unknown) {
  assertWrite(actor);
  const input = yearSchema.parse(body);
  if (input.isCurrent) await prisma.academicYear.updateMany({ where: { schoolId }, data: { isCurrent: false } });
  return prisma.academicYear.create({
    data: { schoolId, name: input.name, startDate: dateOnly(input.startDate)!, endDate: dateOnly(input.endDate)!, isCurrent: input.isCurrent ?? false },
  });
}

export async function listTerms(schoolId: string) {
  const rows = await prisma.term.findMany({ where: { schoolId }, include: { academicYear: true }, orderBy: { startDate: "asc" } });
  return rows.map((term) => ({ id: term.id, name: term.name, isCurrent: term.isCurrent, academicYearId: term.academicYearId, academicYear: term.academicYear.name, startDate: isoDate(term.startDate), endDate: isoDate(term.endDate) }));
}

export async function createTerm(actor: Actor, schoolId: string, body: unknown) {
  assertWrite(actor);
  const input = termSchema.parse(body);
  if (input.isCurrent) await prisma.term.updateMany({ where: { schoolId }, data: { isCurrent: false } });
  return prisma.term.create({
    data: {
      schoolId,
      academicYearId: input.academicYearId,
      name: input.name,
      startDate: dateOnly(input.startDate)!,
      endDate: dateOnly(input.endDate)!,
      isCurrent: input.isCurrent ?? false,
    },
  });
}

export async function listLevels(schoolId: string) {
  return prisma.classLevel.findMany({ where: { schoolId }, orderBy: { sortOrder: "asc" } });
}

export async function createLevel(actor: Actor, schoolId: string, body: unknown) {
  assertWrite(actor);
  const input = named.parse(body);
  return prisma.classLevel.create({ data: { schoolId, name: input.name, sortOrder: input.sortOrder ?? 0 } });
}

export async function listStreams(schoolId: string) {
  return prisma.stream.findMany({ where: { schoolId }, orderBy: { name: "asc" } });
}

export async function createStream(actor: Actor, schoolId: string, body: unknown) {
  assertWrite(actor);
  const input = named.parse(body);
  return prisma.stream.create({ data: { schoolId, name: input.name } });
}

export async function listClasses(actor: Actor, schoolId: string) {
  const teacher = actor.roles.includes("TEACHER") && !actor.roles.some((role) => ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"].includes(role))
    ? await prisma.teacher.findUnique({ where: { userId: actor.id } })
    : null;
  const rows = await prisma.classSection.findMany({
    where: {
      schoolId,
      ...(teacher
        ? { OR: [{ classTeacherId: teacher.id }, { teaching: { some: { teacherId: teacher.id } } }] }
        : {}),
    },
    include: {
      classLevel: true,
      stream: true,
      academicYear: true,
      classTeacher: { include: { user: true } },
      _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
    },
    orderBy: { name: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    room: row.room,
    capacity: row.capacity,
    classLevelId: row.classLevelId,
    streamId: row.streamId,
    academicYearId: row.academicYearId,
    level: row.classLevel.name,
    stream: row.stream.name,
    academicYear: row.academicYear.name,
    classTeacherId: row.classTeacherId,
    classTeacher: row.classTeacher ? `${row.classTeacher.user.firstName} ${row.classTeacher.user.lastName}` : null,
    students: row._count.enrollments,
  }));
}

export async function createClass(actor: Actor, schoolId: string, body: unknown) {
  assertWrite(actor);
  const input = classSchema.parse(body);
  const [level, stream] = await Promise.all([
    prisma.classLevel.findFirst({ where: { id: input.classLevelId, schoolId } }),
    prisma.stream.findFirst({ where: { id: input.streamId, schoolId } }),
  ]);
  if (!level || !stream) throw notFound("Class level or stream not found.");
  return prisma.classSection.create({
    data: {
      schoolId,
      classLevelId: level.id,
      streamId: stream.id,
      academicYearId: input.academicYearId,
      name: input.name?.trim() || `${level.name} ${stream.name}`,
      room: clean(input.room),
      classTeacherId: clean(input.classTeacherId),
      capacity: input.capacity ?? 40,
    },
  });
}

export async function updateClass(actor: Actor, schoolId: string, id: string, body: unknown) {
  assertWrite(actor);
  const existing = await prisma.classSection.findFirst({ where: { id, schoolId } });
  if (!existing) throw notFound("Class not found.");
  const input = classSchema.partial().parse(body);
  return prisma.classSection.update({
    where: { id },
    data: {
      name: input.name,
      room: input.room === undefined ? undefined : clean(input.room),
      capacity: input.capacity,
      classTeacherId: input.classTeacherId === undefined ? undefined : clean(input.classTeacherId),
    },
  });
}

export async function enrollStudent(actor: Actor, schoolId: string, classSectionId: string, studentId: string) {
  assertWrite(actor);
  const section = await prisma.classSection.findFirst({ where: { id: classSectionId, schoolId } });
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
  if (!section || !student) throw notFound("Class or student not found.");
  await prisma.enrollment.updateMany({ where: { studentId, status: "ACTIVE" }, data: { status: "TRANSFERRED" } });
  return prisma.enrollment.upsert({
    where: { studentId_classSectionId: { studentId, classSectionId } },
    update: { status: "ACTIVE" },
    create: { schoolId, studentId, classSectionId, academicYearId: section.academicYearId },
  });
}

export async function listSubjects(schoolId: string) {
  const rows = await prisma.subject.findMany({
    where: { schoolId },
    include: { classes: { include: { classSection: true } }, teaching: { include: { teacher: { include: { user: true } }, classSection: true } } },
    orderBy: { name: "asc" },
  });
  return rows.map((subject) => ({
    id: subject.id,
    name: subject.name,
    code: subject.code,
    isActive: subject.isActive,
    classes: subject.classes.map((item) => ({ id: item.classSectionId, name: item.classSection.name })),
    teachers: subject.teaching.map((item) => ({
      id: item.teacherId,
      name: `${item.teacher.user.firstName} ${item.teacher.user.lastName}`,
      className: item.classSection.name,
      classSectionId: item.classSectionId,
    })),
  }));
}

export async function createSubject(actor: Actor, schoolId: string, body: unknown) {
  assertWrite(actor);
  const input = subjectSchema.parse(body);
  return prisma.subject.create({ data: { schoolId, name: input.name, code: input.code.toUpperCase() } });
}

export async function updateSubject(actor: Actor, schoolId: string, id: string, body: unknown) {
  assertWrite(actor);
  const input = subjectSchema.partial().extend({ isActive: z.boolean().optional() }).parse(body);
  const existing = await prisma.subject.findFirst({ where: { id, schoolId } });
  if (!existing) throw notFound("Subject not found.");
  return prisma.subject.update({
    where: { id },
    data: { name: input.name, code: input.code?.toUpperCase(), isActive: input.isActive },
  });
}

export async function assignSubject(actor: Actor, schoolId: string, subjectId: string, classSectionId: string, teacherId?: string) {
  assertWrite(actor);
  const [subject, section] = await Promise.all([
    prisma.subject.findFirst({ where: { id: subjectId, schoolId } }),
    prisma.classSection.findFirst({ where: { id: classSectionId, schoolId } }),
  ]);
  if (!subject || !section) throw notFound("Subject or class not found.");
  await prisma.classSubject.upsert({
    where: { classSectionId_subjectId: { classSectionId, subjectId } },
    update: {},
    create: { classSectionId, subjectId },
  });
  if (teacherId) {
    const teacher = await prisma.teacher.findFirst({ where: { id: teacherId, schoolId } });
    if (!teacher) throw notFound("Teacher not found.");
    await prisma.teachingAssignment.upsert({
      where: { teacherId_classSectionId_subjectId: { teacherId, classSectionId, subjectId } },
      update: {},
      create: { schoolId, teacherId, classSectionId, subjectId },
    });
  }
}

export async function listTimetable(schoolId: string, query: Record<string, unknown>) {
  const classSectionId = typeof query.classSectionId === "string" ? query.classSectionId : undefined;
  const teacherId = typeof query.teacherId === "string" ? query.teacherId : undefined;
  const slots = await prisma.timetableSlot.findMany({
    where: { schoolId, classSectionId, teacherId },
    include: { subject: true, teacher: { include: { user: true } }, classSection: true },
    orderBy: [{ day: "asc" }, { startTime: "asc" }],
  });
  return slots.map((slot) => ({
    id: slot.id,
    day: slot.day,
    startTime: slot.startTime,
    endTime: slot.endTime,
    room: slot.room,
    classSectionId: slot.classSectionId,
    className: slot.classSection.name,
    subjectId: slot.subjectId,
    subject: slot.subject.name,
    teacherId: slot.teacherId,
    teacher: slot.teacher ? `${slot.teacher.user.firstName} ${slot.teacher.user.lastName}` : null,
  }));
}

export async function saveSlot(actor: Actor, schoolId: string, body: unknown, id?: string) {
  assertWrite(actor);
  const input = timetableSlotSchema.parse(body);
  const data = {
    schoolId,
    classSectionId: input.classSectionId,
    subjectId: input.subjectId,
    teacherId: clean(input.teacherId),
    day: input.day as Weekday,
    startTime: input.startTime,
    endTime: input.endTime,
    room: clean(input.room),
  };
  if (id) {
    const existing = await prisma.timetableSlot.findFirst({ where: { id, schoolId } });
    if (!existing) throw notFound("Timetable slot not found.");
    return prisma.timetableSlot.update({ where: { id }, data });
  }
  return prisma.timetableSlot.create({ data });
}

export async function deleteSlot(actor: Actor, schoolId: string, id: string) {
  assertWrite(actor);
  const existing = await prisma.timetableSlot.findFirst({ where: { id, schoolId } });
  if (!existing) throw notFound("Timetable slot not found.");
  await prisma.timetableSlot.delete({ where: { id } });
}
