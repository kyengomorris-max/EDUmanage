import { attendanceMarkSchema } from "@edumanage/shared";
import { prisma } from "../../config/prisma.js";
import type { Actor } from "../../lib/access.js";
import { can, isStaffManager } from "../../lib/access.js";
import { forbidden, notFound } from "../../lib/errors.js";
import { dateOnly, fullName, isoDate } from "../../lib/serialize.js";
import { notifyUsers } from "../../lib/notify.js";

async function assertCanMark(actor: Actor, schoolId: string, classSectionId: string) {
  if (!can(actor, "attendance.write")) throw forbidden();
  if (isStaffManager(actor)) return;
  const teacher = await prisma.teacher.findUnique({ where: { userId: actor.id } });
  if (!teacher) throw forbidden();
  const allowed = await prisma.classSection.findFirst({
    where: {
      id: classSectionId,
      schoolId,
      OR: [{ classTeacherId: teacher.id }, { teaching: { some: { teacherId: teacher.id } } }],
    },
  });
  if (!allowed) throw forbidden("You can only mark attendance for your classes.");
}

export async function roster(actor: Actor, schoolId: string, classSectionId: string, date: string) {
  if (!can(actor, "attendance.read") && !can(actor, "attendance.write")) throw forbidden();
  const section = await prisma.classSection.findFirst({ where: { id: classSectionId, schoolId } });
  if (!section) throw notFound("Class not found.");
  const day = dateOnly(date);
  if (!day) throw notFound("Choose a date.");
  const [enrollments, session] = await Promise.all([
    prisma.enrollment.findMany({
      where: { classSectionId, status: "ACTIVE", student: { status: "ACTIVE" } },
      include: { student: { include: { user: true } } },
      orderBy: { student: { user: { lastName: "asc" } } },
    }),
    prisma.attendanceSession.findUnique({
      where: { classSectionId_date: { classSectionId, date: day } },
      include: { records: true },
    }),
  ]);
  const saved = new Map(session?.records.map((record) => [record.studentId, record]));
  return {
    className: section.name,
    date: isoDate(day),
    sessionId: session?.id ?? null,
    students: enrollments.map((enrollment) => {
      const record = saved.get(enrollment.studentId);
      return {
        studentId: enrollment.studentId,
        name: fullName(enrollment.student.user),
        admissionNumber: enrollment.student.admissionNumber,
        status: record?.status ?? "PRESENT",
        reason: record?.reason ?? "",
      };
    }),
  };
}

export async function markAttendance(actor: Actor, schoolId: string, body: unknown) {
  const input = attendanceMarkSchema.parse(body);
  await assertCanMark(actor, schoolId, input.classSectionId);
  const day = dateOnly(input.date);
  if (!day) throw notFound("Choose a date.");
  const studentIds = input.records.map((record) => record.studentId);
  const enrolled = await prisma.enrollment.count({
    where: { classSectionId: input.classSectionId, status: "ACTIVE", studentId: { in: studentIds }, schoolId },
  });
  if (enrolled !== studentIds.length) throw forbidden("One or more students are not in this class.");
  const session = await prisma.attendanceSession.upsert({
    where: { classSectionId_date: { classSectionId: input.classSectionId, date: day } },
    update: { takenById: actor.id },
    create: { schoolId, classSectionId: input.classSectionId, date: day, takenById: actor.id },
  });
  for (const record of input.records) {
    await prisma.attendanceRecord.upsert({
      where: { sessionId_studentId: { sessionId: session.id, studentId: record.studentId } },
      update: { status: record.status, reason: record.reason || null },
      create: { sessionId: session.id, studentId: record.studentId, status: record.status, reason: record.reason || null },
    });
  }
  const absent = input.records.filter((record) => record.status === "ABSENT");
  if (absent.length) {
    const guardians = await prisma.studentGuardian.findMany({
      where: { studentId: { in: absent.map((item) => item.studentId) } },
      include: { guardian: true, student: { include: { user: true } } },
    });
    await notifyUsers(
      guardians.map((link) => link.guardian.userId),
      {
        schoolId,
        type: "ATTENDANCE",
        title: "Attendance alert",
        body: "A child linked to your account was marked absent.",
        link: "/app/attendance",
      },
    );
  }
  return { sessionId: session.id, saved: input.records.length };
}

export async function summary(actor: Actor, schoolId: string) {
  if (!can(actor, "attendance.read")) throw forbidden();
  const today = new Date();
  const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const since = new Date(day);
  since.setUTCDate(since.getUTCDate() - 14);
  const records = await prisma.attendanceRecord.findMany({
    where: { session: { schoolId, date: { gte: since } } },
    include: { session: { select: { date: true, classSectionId: true, classSection: { select: { name: true } } } }, student: { include: { user: true } } },
  });
  const todayRecords = records.filter((record) => record.session.date.getTime() === day.getTime());
  const presentish = todayRecords.filter((record) => record.status === "PRESENT" || record.status === "LATE").length;
  const byDate = new Map<string, { present: number; total: number }>();
  const absences = new Map<string, { name: string; count: number }>();
  const byClass = new Map<string, { name: string; present: number; total: number }>();
  for (const record of records) {
    const key = isoDate(record.session.date)!;
    const bucket = byDate.get(key) ?? { present: 0, total: 0 };
    bucket.total += 1;
    if (record.status === "PRESENT" || record.status === "LATE") bucket.present += 1;
    byDate.set(key, bucket);
    if (record.status === "ABSENT") {
      const current = absences.get(record.studentId) ?? { name: fullName(record.student.user), count: 0 };
      current.count += 1;
      absences.set(record.studentId, current);
    }
    const classBucket = byClass.get(record.session.classSectionId) ?? { name: record.session.classSection.name, present: 0, total: 0 };
    classBucket.total += 1;
    if (record.status === "PRESENT" || record.status === "LATE") classBucket.present += 1;
    byClass.set(record.session.classSectionId, classBucket);
  }
  return {
    today: {
      marked: todayRecords.length,
      rate: todayRecords.length ? Math.round((presentish / todayRecords.length) * 1000) / 10 : 0,
    },
    trend: [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({
      date,
      rate: value.total ? Math.round((value.present / value.total) * 1000) / 10 : 0,
    })),
    frequentAbsences: [...absences.values()].sort((a, b) => b.count - a.count).slice(0, 5),
    classes: [...byClass.values()].map((value) => ({
      name: value.name,
      rate: value.total ? Math.round((value.present / value.total) * 1000) / 10 : 0,
    })),
  };
}
