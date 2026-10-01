import { z } from "zod";
import type { DocumentCategory } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import type { Actor } from "../../lib/access.js";
import { can } from "../../lib/access.js";
import { writeAudit } from "../../lib/audit.js";
import { forbidden, notFound } from "../../lib/errors.js";
import { clean, fullName } from "../../lib/serialize.js";

const disciplineSchema = z.object({
  studentId: z.string().uuid(),
  incident: z.string().trim().min(2).max(160),
  description: z.string().trim().min(2).max(4000),
  actionTaken: z.string().optional(),
  occurredOn: z.string(),
  status: z.enum(["OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"]).default("OPEN"),
});

export async function listDiscipline(actor: Actor, schoolId: string) {
  if (!can(actor, "discipline.read")) throw forbidden();
  const rows = await prisma.disciplineRecord.findMany({
    where: { schoolId },
    include: { student: { include: { user: true } }, reportedBy: true },
    orderBy: { occurredOn: "desc" },
  });
  return rows.map((row) => ({
    id: row.id,
    incident: row.incident,
    description: row.description,
    actionTaken: row.actionTaken,
    occurredOn: row.occurredOn,
    status: row.status,
    studentId: row.studentId,
    student: fullName(row.student.user),
    reportedBy: row.reportedBy ? fullName(row.reportedBy) : null,
  }));
}

export async function saveDiscipline(actor: Actor, schoolId: string, body: unknown, id?: string) {
  if (!can(actor, "discipline.write")) throw forbidden();
  const input = disciplineSchema.parse(body);
  const student = await prisma.student.findFirst({ where: { id: input.studentId, schoolId } });
  if (!student) throw notFound("Student not found.");
  if (id) {
    const existing = await prisma.disciplineRecord.findFirst({ where: { id, schoolId } });
    if (!existing) throw notFound("Record not found.");
    return prisma.disciplineRecord.update({ where: { id }, data: { ...input, occurredOn: new Date(input.occurredOn), actionTaken: clean(input.actionTaken) } });
  }
  return prisma.disciplineRecord.create({
    data: {
      schoolId,
      studentId: input.studentId,
      incident: input.incident,
      description: input.description,
      actionTaken: clean(input.actionTaken),
      occurredOn: new Date(input.occurredOn),
      status: input.status,
      reportedById: actor.id,
    },
  });
}

export async function listDocuments(actor: Actor, schoolId: string, query: Record<string, unknown>) {
  if (!can(actor, "documents.read")) throw forbidden();
  let studentLimit: string[] | null = null;
  if (actor.roles.includes("STUDENT") && !actor.roles.some((role) => ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER"].includes(role))) {
    const student = await prisma.student.findFirst({ where: { userId: actor.id, schoolId } });
    studentLimit = student ? [student.id] : [];
  }
  if (actor.roles.includes("PARENT") && !actor.roles.some((role) => ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER"].includes(role))) {
    const links = await prisma.studentGuardian.findMany({ where: { guardian: { userId: actor.id } } });
    studentLimit = links.map((link) => link.studentId);
  }
  return prisma.document.findMany({
    where: {
      schoolId,
      ...(typeof query.category === "string" ? { category: query.category as DocumentCategory } : {}),
      ...(typeof query.studentId === "string" ? { studentId: query.studentId } : {}),
      ...(studentLimit ? { OR: [{ studentId: { in: studentLimit } }, { category: "POLICY", studentId: null }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: { select: { firstName: true, lastName: true } } },
  });
}

export async function createDocument(actor: Actor, schoolId: string, body: { title?: string; category?: string; studentId?: string; teacherId?: string }, file: Express.Multer.File, ip?: string) {
  if (!can(actor, "documents.write")) throw forbidden();
  const category = (body.category || "OTHER") as DocumentCategory;
  const document = await prisma.document.create({
    data: {
      schoolId,
      title: body.title?.trim() || file.originalname,
      category,
      fileName: file.originalname,
      storedName: file.filename,
      mimeType: file.mimetype,
      size: file.size,
      studentId: clean(body.studentId),
      teacherId: clean(body.teacherId),
      uploadedById: actor.id,
    },
  });
  await writeAudit({
    schoolId,
    userId: actor.id,
    action: "document.uploaded",
    entity: "Document",
    entityId: document.id,
    description: `Uploaded ${document.title}`,
    ip,
  });
  return document;
}

export async function getStoredFile(actor: Actor, schoolId: string, storedName: string) {
  const document = await prisma.document.findFirst({ where: { schoolId, storedName } });
  const material = await prisma.learningMaterial.findFirst({ where: { schoolId, storedName } });
  const schoolLogo = await prisma.school.findFirst({ where: { id: schoolId, logoUrl: { contains: storedName } } });
  if (schoolLogo && (can(actor, "settings.read") || can(actor, "dashboard.read"))) return storedName;
  const attachment = await prisma.assignmentAttachment.findFirst({ where: { storedName, assignment: { schoolId } } });
  const submission = await prisma.submission.findFirst({ where: { storedName, assignment: { schoolId } }, include: { student: true, assignment: true } });
  if (!document && !material && !attachment && !submission) throw notFound("File not found.");
  if (document && !can(actor, "documents.read")) throw forbidden();
  if (material && !can(actor, "materials.read")) throw forbidden();
  if ((attachment || submission) && !can(actor, "assignments.read")) throw forbidden();
  if (submission && actor.roles.includes("STUDENT")) {
    const student = await prisma.student.findFirst({ where: { userId: actor.id } });
    if (student?.id !== submission.studentId) throw forbidden();
  }
  return storedName;
}
