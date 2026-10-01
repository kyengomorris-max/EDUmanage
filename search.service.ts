import { prisma } from "../../config/prisma.js";
import type { Actor } from "../../lib/access.js";
import { can } from "../../lib/access.js";
import { fullName } from "../../lib/serialize.js";

export async function search(actor: Actor, schoolId: string, q: string) {
  const term = q.trim();
  if (term.length < 2) return { students: [], teachers: [], classes: [], subjects: [], events: [], announcements: [], books: [], documents: [] };
  const contains = { contains: term, mode: "insensitive" as const };
  const [students, teachers, classes, subjects, events, announcements, books, documents] = await Promise.all([
    can(actor, "students.read")
      ? prisma.student.findMany({ where: { schoolId, OR: [{ admissionNumber: contains }, { user: { firstName: contains } }, { user: { lastName: contains } }] }, include: { user: true }, take: 8 })
      : [],
    can(actor, "teachers.read")
      ? prisma.teacher.findMany({ where: { schoolId, OR: [{ staffNumber: contains }, { user: { firstName: contains } }, { user: { lastName: contains } }] }, include: { user: true }, take: 8 })
      : [],
    can(actor, "academics.read") ? prisma.classSection.findMany({ where: { schoolId, name: contains }, take: 8 }) : [],
    can(actor, "academics.read") ? prisma.subject.findMany({ where: { schoolId, OR: [{ name: contains }, { code: contains }] }, take: 8 }) : [],
    can(actor, "events.read") ? prisma.event.findMany({ where: { schoolId, name: contains }, take: 8 }) : [],
    can(actor, "announcements.read") ? prisma.announcement.findMany({ where: { schoolId, title: contains }, take: 8 }) : [],
    can(actor, "library.read") ? prisma.book.findMany({ where: { schoolId, OR: [{ title: contains }, { author: contains }, { isbn: contains }] }, take: 8 }) : [],
    can(actor, "documents.read") ? prisma.document.findMany({ where: { schoolId, title: contains }, take: 8 }) : [],
  ]);
  return {
    students: students.map((student) => ({ id: student.id, label: fullName(student.user), hint: student.admissionNumber, href: `/app/students/${student.id}` })),
    teachers: teachers.map((teacher) => ({ id: teacher.id, label: fullName(teacher.user), hint: teacher.staffNumber, href: `/app/teachers/${teacher.id}` })),
    classes: classes.map((item) => ({ id: item.id, label: item.name, hint: item.room, href: "/app/classes" })),
    subjects: subjects.map((item) => ({ id: item.id, label: item.name, hint: item.code, href: "/app/subjects" })),
    events: events.map((item) => ({ id: item.id, label: item.name, hint: item.location, href: "/app/events" })),
    announcements: announcements.map((item) => ({ id: item.id, label: item.title, hint: item.priority, href: "/app/announcements" })),
    books: books.map((item) => ({ id: item.id, label: item.title, hint: item.author, href: "/app/library" })),
    documents: documents.map((item) => ({ id: item.id, label: item.title, hint: item.category, href: "/app/documents" })),
  };
}
