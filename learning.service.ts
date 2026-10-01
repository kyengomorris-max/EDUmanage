import { z } from "zod";
import type { AssignmentState } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import type { Actor } from "../../lib/access.js";
import { can, isStaffManager } from "../../lib/access.js";
import { forbidden, notFound } from "../../lib/errors.js";
import { notifyUsers } from "../../lib/notify.js";
import { clean, fullName } from "../../lib/serialize.js";

const assignmentSchema = z.object({
  classSectionId: z.string().uuid(),
  subjectId: z.string().uuid(),
  title: z.string().trim().min(2).max(160),
  instructions: z.string().trim().min(2).max(8000),
  dueAt: z.string(),
  maxScore: z.coerce.number().positive().max(1000).default(100),
  status: z.enum(["DRAFT", "PUBLISHED", "CLOSED"]).default("PUBLISHED"),
});

async function teacherOf(actor: Actor) {
  return prisma.teacher.findUnique({ where: { userId: actor.id } });
}

async function classIdsFor(actor: Actor, schoolId: string) {
  if (isStaffManager(actor)) return null;
  if (actor.roles.includes("TEACHER")) {
    const teacher = await teacherOf(actor);
    if (!teacher) return [];
    const rows = await prisma.teachingAssignment.findMany({ where: { teacherId: teacher.id }, select: { classSectionId: true } });
    const homeroom = await prisma.classSection.findMany({ where: { classTeacherId: teacher.id }, select: { id: true } });
    return [...new Set([...rows.map((row) => row.classSectionId), ...homeroom.map((row) => row.id)])];
  }
  if (actor.roles.includes("STUDENT")) {
    const student = await prisma.student.findFirst({ where: { userId: actor.id, schoolId }, include: { enrollments: { where: { status: "ACTIVE" } } } });
    return student?.enrollments.map((item) => item.classSectionId) ?? [];
  }
  if (actor.roles.includes("PARENT")) {
    const links = await prisma.studentGuardian.findMany({
      where: { guardian: { userId: actor.id } },
      include: { student: { include: { enrollments: { where: { status: "ACTIVE" } } } } },
    });
    return links.flatMap((link) => link.student.enrollments.map((item) => item.classSectionId));
  }
  return [];
}

export async function listAssignments(actor: Actor, schoolId: string) {
  if (!can(actor, "assignments.read")) throw forbidden();
  const classIds = await classIdsFor(actor, schoolId);
  const rows = await prisma.assignment.findMany({
    where: {
      schoolId,
      ...(classIds ? { classSectionId: { in: classIds } } : {}),
      ...(actor.roles.includes("STUDENT") || actor.roles.includes("PARENT") ? { status: { not: "DRAFT" } } : {}),
    },
    include: {
      subject: true,
      classSection: true,
      teacher: { include: { user: true } },
      submissions: { include: { student: { include: { user: true } } } },
      attachments: true,
    },
    orderBy: { dueAt: "asc" },
  });
  const student = actor.roles.includes("STUDENT") ? await prisma.student.findFirst({ where: { userId: actor.id } }) : null;
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    instructions: row.instructions,
    dueAt: row.dueAt,
    maxScore: Number(row.maxScore),
    status: row.status,
    subject: row.subject.name,
    subjectId: row.subjectId,
    className: row.classSection.name,
    classSectionId: row.classSectionId,
    teacher: fullName(row.teacher.user),
    attachments: row.attachments.map((file) => ({ id: file.id, fileName: file.fileName, storedName: file.storedName })),
    submissionCount: row.submissions.length,
    mySubmission: student ? row.submissions.find((item) => item.studentId === student.id) ?? null : null,
    submissions: isStaffManager(actor) || actor.roles.includes("TEACHER")
      ? row.submissions.map((item) => ({
          id: item.id,
          studentId: item.studentId,
          student: fullName(item.student.user),
          body: item.body,
          fileName: item.fileName,
          storedName: item.storedName,
          submittedAt: item.submittedAt,
          score: item.score == null ? null : Number(item.score),
          feedback: item.feedback,
          status: item.status,
        }))
      : [],
  }));
}

export async function createAssignment(actor: Actor, schoolId: string, body: unknown, file?: Express.Multer.File) {
  if (!can(actor, "assignments.write")) throw forbidden();
  const input = assignmentSchema.parse(body);
  const teacher = await teacherOf(actor);
  if (!teacher && !isStaffManager(actor)) throw forbidden();
  const teacherId = teacher?.id ?? (await prisma.teacher.findFirst({ where: { schoolId } }))?.id;
  if (!teacherId) throw forbidden("Assign a teacher before creating work.");
  const assignment = await prisma.assignment.create({
    data: {
      schoolId,
      classSectionId: input.classSectionId,
      subjectId: input.subjectId,
      teacherId,
      title: input.title,
      instructions: input.instructions,
      dueAt: new Date(input.dueAt),
      maxScore: input.maxScore,
      status: input.status as AssignmentState,
      ...(file
        ? { attachments: { create: { fileName: file.originalname, storedName: file.filename, mimeType: file.mimetype, size: file.size } } }
        : {}),
    },
  });
  if (input.status === "PUBLISHED") {
    const enrollments = await prisma.enrollment.findMany({ where: { classSectionId: input.classSectionId, status: "ACTIVE" }, include: { student: true } });
    await notifyUsers(enrollments.map((item) => item.student.userId), {
      schoolId,
      type: "ASSIGNMENT",
      title: "New assignment",
      body: input.title,
      link: "/app/assignments",
    });
  }
  return assignment;
}

export async function submitAssignment(actor: Actor, schoolId: string, assignmentId: string, body: { text?: string }, file?: Express.Multer.File) {
  if (!can(actor, "assignments.submit")) throw forbidden();
  const student = await prisma.student.findFirst({ where: { userId: actor.id, schoolId } });
  if (!student) throw forbidden();
  const assignment = await prisma.assignment.findFirst({ where: { id: assignmentId, schoolId, status: "PUBLISHED" } });
  if (!assignment) throw notFound("Assignment not found.");
  const enrolled = await prisma.enrollment.findFirst({ where: { studentId: student.id, classSectionId: assignment.classSectionId, status: "ACTIVE" } });
  if (!enrolled) throw forbidden("This assignment is not for your class.");
  const late = new Date() > assignment.dueAt;
  return prisma.submission.upsert({
    where: { assignmentId_studentId: { assignmentId, studentId: student.id } },
    update: {
      body: clean(body.text),
      fileName: file?.originalname,
      storedName: file?.filename,
      mimeType: file?.mimetype,
      size: file?.size,
      submittedAt: new Date(),
      status: late ? "LATE" : "SUBMITTED",
    },
    create: {
      assignmentId,
      studentId: student.id,
      body: clean(body.text),
      fileName: file?.originalname,
      storedName: file?.filename,
      mimeType: file?.mimetype,
      size: file?.size,
      status: late ? "LATE" : "SUBMITTED",
    },
  });
}

export async function gradeSubmission(actor: Actor, id: string, score: number, feedback?: string) {
  if (!can(actor, "assignments.write")) throw forbidden();
  const submission = await prisma.submission.findUnique({ where: { id }, include: { assignment: true, student: true } });
  if (!submission || (submission.assignment.schoolId !== (actor.schoolId ?? submission.assignment.schoolId) && !actor.roles.includes("SUPER_ADMIN"))) {
    throw notFound("Submission not found.");
  }
  if (!actor.roles.includes("SUPER_ADMIN") && actor.schoolId && submission.assignment.schoolId !== actor.schoolId) {
    throw notFound("Submission not found.");
  }
  const updated = await prisma.submission.update({
    where: { id },
    data: { score, feedback: clean(feedback), status: "GRADED", gradedAt: new Date() },
  });
  await notifyUsers([submission.student.userId], {
    schoolId: submission.assignment.schoolId,
    type: "ASSIGNMENT",
    title: "Assignment graded",
    body: feedback || "Your teacher published a grade.",
    link: "/app/assignments",
  });
  return updated;
}

const materialSchema = z.object({
  title: z.string().min(2),
  subjectId: z.string().uuid(),
  classSectionId: z.string().uuid().optional().or(z.literal("")),
  topic: z.string().optional(),
  description: z.string().optional(),
});

export async function listMaterials(actor: Actor, schoolId: string, query: Record<string, unknown>) {
  if (!can(actor, "materials.read")) throw forbidden();
  const classIds = await classIdsFor(actor, schoolId);
  return prisma.learningMaterial.findMany({
    where: {
      schoolId,
      ...(typeof query.subjectId === "string" ? { subjectId: query.subjectId } : {}),
      ...(typeof query.topic === "string" && query.topic ? { topic: { contains: String(query.topic), mode: "insensitive" } } : {}),
      ...(classIds ? { OR: [{ classSectionId: { in: classIds } }, { classSectionId: null }] } : {}),
    },
    include: { subject: true, teacher: { include: { user: true } }, classSection: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function createMaterial(actor: Actor, schoolId: string, body: unknown, file: Express.Multer.File) {
  if (!can(actor, "materials.write")) throw forbidden();
  const input = materialSchema.parse(body);
  const teacher = await teacherOf(actor);
  if (!teacher) throw forbidden("Only teachers can upload learning materials.");
  return prisma.learningMaterial.create({
    data: {
      schoolId,
      teacherId: teacher.id,
      subjectId: input.subjectId,
      classSectionId: clean(input.classSectionId),
      title: input.title,
      topic: clean(input.topic),
      description: clean(input.description),
      fileName: file.originalname,
      storedName: file.filename,
      mimeType: file.mimetype,
      size: file.size,
    },
  });
}
