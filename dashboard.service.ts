import { primaryRole } from "@edumanage/shared";
import { prisma } from "../../config/prisma.js";
import type { Actor } from "../../lib/access.js";
import { fullName, isoDate, num } from "../../lib/serialize.js";
import { summary as attendanceSummary } from "../attendance/attendance.service.js";
import { feeSummary } from "../fees/fees.service.js";
import { librarySummary } from "../library/library.service.js";

export async function dashboard(actor: Actor, schoolId: string | null) {
  const role = primaryRole(actor.roles);
  if (role === "SUPER_ADMIN" && !schoolId) {
    const [schools, users, students] = await Promise.all([
      prisma.school.count(),
      prisma.user.count(),
      prisma.student.count(),
    ]);
    return {
      role,
      cards: [
        { label: "Schools", value: schools, href: "/app/settings" },
        { label: "Users", value: users, href: "/app/users" },
        { label: "Students", value: students, href: "/app/students" },
      ],
      charts: {},
      lists: { schools: await prisma.school.findMany({ take: 8, orderBy: { name: "asc" }, include: { _count: { select: { students: true } } } }) },
    };
  }
  if (!schoolId) return { role, cards: [], charts: {}, lists: {} };

  if (role === "TEACHER") return teacherDashboard(actor, schoolId);
  if (role === "STUDENT") return studentDashboard(actor, schoolId);
  if (role === "PARENT") return parentDashboard(actor, schoolId);
  if (role === "ACCOUNTANT") return financeDashboard(schoolId);
  if (role === "LIBRARIAN") return libraryDashboard(schoolId);
  return adminDashboard(schoolId);
}

async function adminDashboard(schoolId: string) {
  const today = new Date();
  const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const [students, teachers, classes, attendance, fees, exams, activity, events, payments, announcements, enrollment, distribution] = await Promise.all([
    prisma.student.count({ where: { schoolId, status: "ACTIVE" } }),
    prisma.teacher.count({ where: { schoolId, status: "ACTIVE" } }),
    prisma.classSection.count({ where: { schoolId } }),
    attendanceSummary({ permissions: ["attendance.read"], roles: ["SCHOOL_ADMIN"] } as Actor, schoolId),
    feeSummary(schoolId),
    prisma.exam.count({ where: { schoolId, endDate: { gte: day } } }),
    prisma.auditLog.findMany({ where: { schoolId }, orderBy: { createdAt: "desc" }, take: 8, include: { user: true } }),
    prisma.event.findMany({ where: { schoolId, startsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" }, take: 5 }),
    prisma.payment.findMany({ where: { schoolId }, orderBy: { paidAt: "desc" }, take: 5, include: { invoice: { include: { student: { include: { user: true } } } } } }),
    prisma.announcement.findMany({ where: { schoolId }, orderBy: { publishAt: "desc" }, take: 4, include: { author: true } }),
    prisma.enrollment.groupBy({ by: ["classSectionId"], where: { schoolId, status: "ACTIVE" }, _count: true }),
    prisma.student.groupBy({ by: ["gender"], where: { schoolId, status: "ACTIVE" }, _count: true }),
  ]);
  const sections = await prisma.classSection.findMany({ where: { id: { in: enrollment.map((row) => row.classSectionId) } } });
  const sectionName = new Map(sections.map((section) => [section.id, section.name]));
  return {
    role: "SCHOOL_ADMIN",
    cards: [
      { label: "Total students", value: students, href: "/app/students" },
      { label: "Total teachers", value: teachers, href: "/app/teachers" },
      { label: "Total classes", value: classes, href: "/app/classes" },
      { label: "Attendance today", value: `${attendance.today.rate}%`, href: "/app/attendance" },
      { label: "Outstanding fees", value: fees.outstanding, href: "/app/fees" },
      { label: "Upcoming exams", value: exams, href: "/app/exams" },
    ],
    charts: {
      enrollment: enrollment.map((row) => ({ name: sectionName.get(row.classSectionId) ?? "Class", value: row._count })),
      attendance: attendance.trend,
      fees: [
        { name: "Collected", value: fees.collected },
        { name: "Outstanding", value: fees.outstanding },
      ],
      distribution: distribution.map((row) => ({ name: row.gender, value: row._count })),
    },
    lists: {
      activity: activity.map((item) => ({ id: item.id, description: item.description, at: item.createdAt, user: item.user ? fullName(item.user) : "System" })),
      events,
      payments: payments.map((payment) => ({ id: payment.id, amount: num(payment.amount), student: fullName(payment.invoice.student.user), at: payment.paidAt })),
      announcements: announcements.map((item) => ({ id: item.id, title: item.title, author: fullName(item.author), at: item.publishAt })),
    },
  };
}

async function teacherDashboard(actor: Actor, schoolId: string) {
  const teacher = await prisma.teacher.findUnique({ where: { userId: actor.id } });
  const assignments = teacher
    ? await prisma.teachingAssignment.findMany({ where: { teacherId: teacher.id }, include: { classSection: true, subject: true } })
    : [];
  const classIds = [...new Set(assignments.map((item) => item.classSectionId))];
  const [pending, upcoming] = await Promise.all([
    prisma.submission.count({ where: { assignment: { teacherId: teacher?.id, schoolId }, status: { in: ["SUBMITTED", "LATE"] } } }),
    prisma.assignment.findMany({ where: { teacherId: teacher?.id, dueAt: { gte: new Date() } }, orderBy: { dueAt: "asc" }, take: 5, include: { classSection: true } }),
  ]);
  return {
    role: "TEACHER",
    cards: [
      { label: "My classes", value: classIds.length, href: "/app/classes" },
      { label: "Subjects", value: new Set(assignments.map((item) => item.subjectId)).size, href: "/app/subjects" },
      { label: "To grade", value: pending, href: "/app/assignments" },
    ],
    charts: {},
    lists: {
      classes: assignments.map((item) => ({ className: item.classSection.name, subject: item.subject.name })),
      assignments: upcoming.map((item) => ({ id: item.id, title: item.title, className: item.classSection.name, dueAt: item.dueAt })),
    },
  };
}

async function studentDashboard(actor: Actor, schoolId: string) {
  const student = await prisma.student.findFirst({ where: { userId: actor.id, schoolId }, include: { enrollments: { where: { status: "ACTIVE" }, include: { classSection: true } } } });
  if (!student) return { role: "STUDENT", cards: [], charts: {}, lists: {} };
  const classSectionId = student.enrollments[0]?.classSectionId;
  const [assignments, scores, slots, attendance] = await Promise.all([
    prisma.assignment.findMany({ where: { classSectionId, status: "PUBLISHED", dueAt: { gte: new Date() } }, orderBy: { dueAt: "asc" }, take: 5, include: { subject: true } }),
    prisma.examScore.findMany({ where: { studentId: student.id }, include: { examPaper: { include: { subject: true } } }, take: 8, orderBy: { updatedAt: "desc" } }),
    prisma.timetableSlot.findMany({ where: { classSectionId }, include: { subject: true }, orderBy: [{ day: "asc" }, { startTime: "asc" }] }),
    prisma.attendanceRecord.findMany({ where: { studentId: student.id }, take: 30, orderBy: { session: { date: "desc" } } }),
  ]);
  const present = attendance.filter((record) => record.status === "PRESENT" || record.status === "LATE").length;
  return {
    role: "STUDENT",
    cards: [
      { label: "Class", value: student.enrollments[0]?.classSection.name ?? "—", href: "/app/timetable" },
      { label: "Attendance", value: attendance.length ? `${Math.round((present / attendance.length) * 100)}%` : "—", href: "/app/attendance" },
      { label: "Open assignments", value: assignments.length, href: "/app/assignments" },
    ],
    charts: {
      performance: scores.map((score) => ({ name: score.examPaper.subject.name, value: Math.round((num(score.score) / num(score.examPaper.maxScore)) * 100) })),
    },
    lists: { assignments, timetable: slots.slice(0, 8).map((slot) => ({ day: slot.day, startTime: slot.startTime, subject: slot.subject.name, room: slot.room })) },
  };
}

async function parentDashboard(actor: Actor, schoolId: string) {
  const links = await prisma.studentGuardian.findMany({
    where: { guardian: { userId: actor.id, schoolId } },
    include: { student: { include: { user: true, enrollments: { where: { status: "ACTIVE" }, include: { classSection: true } }, invoices: { include: { lines: true, payments: true } } } } },
  });
  const children = await Promise.all(links.map(async (link) => {
    const records = await prisma.attendanceRecord.findMany({ where: { studentId: link.studentId }, take: 20 });
    const present = records.filter((record) => record.status === "PRESENT" || record.status === "LATE").length;
    const balance = link.student.invoices.reduce((sum, invoice) => {
      const total = invoice.lines.reduce((lineSum, line) => lineSum + num(line.amount), 0);
      const paid = invoice.payments.reduce((paySum, payment) => paySum + num(payment.amount), 0);
      return sum + Math.max(0, total - num(invoice.discount) - paid);
    }, 0);
    return {
      id: link.studentId,
      name: fullName(link.student.user),
      className: link.student.enrollments[0]?.classSection.name ?? "Unassigned",
      attendance: records.length ? Math.round((present / records.length) * 100) : null,
      balance,
    };
  }));
  return {
    role: "PARENT",
    cards: [
      { label: "Children", value: children.length, href: "/app/students" },
      { label: "Outstanding", value: children.reduce((sum, child) => sum + child.balance, 0), href: "/app/fees" },
    ],
    charts: {},
    lists: { children },
  };
}

async function financeDashboard(schoolId: string) {
  const fees = await feeSummary(schoolId);
  const payments = await prisma.payment.findMany({
    where: { schoolId },
    orderBy: { paidAt: "desc" },
    take: 8,
    include: { invoice: { include: { student: { include: { user: true } } } } },
  });
  return {
    role: "ACCOUNTANT",
    cards: [
      { label: "Billed", value: fees.billed, href: "/app/fees" },
      { label: "Collected", value: fees.collected, href: "/app/fees" },
      { label: "Outstanding", value: fees.outstanding, href: "/app/fees" },
    ],
    charts: { fees: Object.entries(fees.byStatus).map(([name, value]) => ({ name, value })) },
    lists: { payments: payments.map((payment) => ({ id: payment.id, amount: num(payment.amount), student: fullName(payment.invoice.student.user), at: isoDate(payment.paidAt) })) },
  };
}

async function libraryDashboard(schoolId: string) {
  const summary = await librarySummary(schoolId);
  const loans = await prisma.bookLoan.findMany({ where: { schoolId, status: { in: ["BORROWED", "OVERDUE"] } }, include: { book: true, borrower: true }, take: 8 });
  return {
    role: "LIBRARIAN",
    cards: [
      { label: "Total books", value: summary.totalBooks, href: "/app/library" },
      { label: "Available", value: summary.available, href: "/app/library" },
      { label: "Borrowed", value: summary.borrowed, href: "/app/library" },
      { label: "Overdue", value: summary.overdue, href: "/app/library" },
    ],
    charts: {},
    lists: { loans: loans.map((loan) => ({ id: loan.id, book: loan.book.title, borrower: fullName(loan.borrower), dueAt: loan.dueAt, status: loan.status })) },
  };
}
