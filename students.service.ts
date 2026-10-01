import bcrypt from "bcryptjs";
import type { Gender, Prisma, UserStatus } from "@prisma/client";
import { studentSchema } from "@edumanage/shared";
import { prisma } from "../../config/prisma.js";
import type { Actor } from "../../lib/access.js";
import { can } from "../../lib/access.js";
import { writeAudit } from "../../lib/audit.js";
import { forbidden, notFound, AppError } from "../../lib/errors.js";
import { readPage } from "../../lib/http.js";
import { clean, dateOnly, fullName, isoDate } from "../../lib/serialize.js";
import { temporaryPassword } from "../../lib/tokens.js";

const studentInclude = {
  user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, status: true } },
  guardians: {
    include: { guardian: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } } } } },
  },
  enrollments: {
    where: { status: "ACTIVE" },
    include: { classSection: { include: { classLevel: true, stream: true } } },
    orderBy: { enrolledAt: "desc" as const },
    take: 1,
  },
} satisfies Prisma.StudentInclude;

async function scope(actor: Actor, schoolId: string): Promise<Prisma.StudentWhereInput> {
  const manager = actor.roles.some((role) => ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "ACCOUNTANT", "LIBRARIAN"].includes(role));
  if (manager && can(actor, "students.read")) return { schoolId };
  const filters: Prisma.StudentWhereInput[] = [];
  if (actor.roles.includes("TEACHER")) {
    const teacher = await prisma.teacher.findUnique({ where: { userId: actor.id } });
    if (teacher) {
      filters.push({
        enrollments: {
          some: {
            status: "ACTIVE",
            OR: [
              { classSection: { classTeacherId: teacher.id } },
              { classSection: { teaching: { some: { teacherId: teacher.id } } } },
            ],
          },
        },
      });
    }
  }
  if (actor.roles.includes("PARENT")) {
    filters.push({ guardians: { some: { guardian: { userId: actor.id } } } });
  }
  if (actor.roles.includes("STUDENT")) filters.push({ userId: actor.id });
  if (filters.length === 0) throw forbidden();
  return { schoolId, OR: filters };
}

function shape(student: Prisma.StudentGetPayload<{ include: typeof studentInclude }>) {
  const enrollment = student.enrollments[0];
  const primary = student.guardians.find((link) => link.isPrimary) ?? student.guardians[0];
  return {
    id: student.id,
    admissionNumber: student.admissionNumber,
    gender: student.gender,
    dateOfBirth: isoDate(student.dateOfBirth),
    address: student.address,
    bloodGroup: student.bloodGroup,
    allergies: student.allergies,
    medicalNotes: student.medicalNotes,
    emergencyName: student.emergencyName,
    emergencyPhone: student.emergencyPhone,
    status: student.status,
    admittedAt: student.admittedAt,
    user: student.user,
    name: fullName(student.user),
    classSectionId: enrollment?.classSectionId ?? null,
    className: enrollment?.classSection.name ?? null,
    guardians: student.guardians.map((link) => ({
      id: link.guardianId,
      relationship: link.relationship,
      isPrimary: link.isPrimary,
      occupation: link.guardian.occupation,
      user: link.guardian.user,
    })),
    primaryGuardian: primary ? fullName(primary.guardian.user) : null,
  };
}

export async function listStudents(actor: Actor, schoolId: string, query: Record<string, unknown>) {
  const page = readPage(query);
  const status = ["ACTIVE", "INACTIVE", "PENDING"].includes(String(query.status)) ? (String(query.status) as UserStatus) : undefined;
  const gender = ["MALE", "FEMALE", "OTHER", "UNSPECIFIED"].includes(String(query.gender)) ? (String(query.gender) as Gender) : undefined;
  const where: Prisma.StudentWhereInput = {
    AND: [
      await scope(actor, schoolId),
      status ? { status } : {},
      gender ? { gender } : {},
      query.classSectionId ? { enrollments: { some: { classSectionId: String(query.classSectionId), status: "ACTIVE" } } } : {},
      page.search
        ? {
            OR: [
              { admissionNumber: { contains: page.search, mode: "insensitive" } },
              { user: { firstName: { contains: page.search, mode: "insensitive" } } },
              { user: { lastName: { contains: page.search, mode: "insensitive" } } },
              { user: { email: { contains: page.search, mode: "insensitive" } } },
            ],
          }
        : {},
    ],
  };
  const orderBy =
    page.sort === "admissionNumber"
      ? { admissionNumber: page.dir }
      : page.sort === "status"
        ? { status: page.dir }
        : { user: { lastName: page.dir } };
  const [total, rows] = await Promise.all([
    prisma.student.count({ where }),
    prisma.student.findMany({ where, include: studentInclude, orderBy, skip: page.skip, take: page.pageSize }),
  ]);
  return { rows: rows.map(shape), page, total };
}

export async function getStudent(actor: Actor, schoolId: string, id: string) {
  const student = await prisma.student.findFirst({
    where: { AND: [await scope(actor, schoolId), { id }] },
    include: studentInclude,
  });
  if (!student) throw notFound("Student not found.");
  return shape(student);
}

async function nextAdmission(schoolId: string) {
  const year = new Date().getFullYear();
  const count = await prisma.student.count({ where: { schoolId } });
  return `ADM-${year}-${String(count + 1).padStart(4, "0")}`;
}

async function ensureGuardian(
  tx: Prisma.TransactionClient,
  schoolId: string,
  input: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    occupation?: string | null;
  },
) {
  if (!input.email || !input.firstName || !input.lastName) return null;
  const email = input.email.toLowerCase();
  let user = await tx.user.findUnique({ where: { email }, include: { guardian: true } });
  let temporary: string | undefined;
  if (user && user.schoolId && user.schoolId !== schoolId) {
    throw forbidden("That guardian email belongs to another school.");
  }
  if (!user) {
    const role = await tx.role.findUniqueOrThrow({ where: { key: "PARENT" } });
    temporary = temporaryPassword();
    user = await tx.user.create({
      data: {
        schoolId,
        email,
        passwordHash: await bcrypt.hash(temporary, 12),
        firstName: input.firstName,
        lastName: input.lastName,
        phone: clean(input.phone),
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
        roles: { create: { roleId: role.id } },
        guardian: { create: { schoolId, occupation: clean(input.occupation) } },
      },
      include: { guardian: true },
    });
  } else if (!user.guardian) {
    await tx.guardian.create({ data: { schoolId, userId: user.id, occupation: clean(input.occupation) } });
    user = await tx.user.findUniqueOrThrow({ where: { id: user.id }, include: { guardian: true } });
  }
  return { guardianId: user.guardian!.id, temporaryPassword: temporary };
}

export async function createStudent(actor: Actor, schoolId: string, body: unknown, ip?: string) {
  if (!can(actor, "students.write")) throw forbidden();
  const input = studentSchema.parse(body);
  const email = input.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) {
    throw new AppError(409, "CONFLICT", "A user with that email already exists.");
  }
  const role = await prisma.role.findUniqueOrThrow({ where: { key: "STUDENT" } });
  const password = temporaryPassword();
  const admissionNumber = clean(input.admissionNumber) ?? (await nextAdmission(schoolId));
  if (input.classSectionId) {
    const section = await prisma.classSection.findFirst({ where: { id: input.classSectionId, schoolId } });
    if (!section) throw notFound("Class not found.");
  }
  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
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
    const student = await tx.student.create({
      data: {
        schoolId,
        userId: user.id,
        admissionNumber,
        gender: input.gender,
        dateOfBirth: dateOnly(input.dateOfBirth),
        address: clean(input.address),
        bloodGroup: clean(input.bloodGroup),
        allergies: clean(input.allergies),
        medicalNotes: clean(input.medicalNotes),
        emergencyName: clean(input.emergencyName),
        emergencyPhone: clean(input.emergencyPhone),
      },
    });
    const guardian = await ensureGuardian(tx, schoolId, {
      firstName: input.guardianFirstName,
      lastName: input.guardianLastName,
      email: input.guardianEmail,
      phone: input.guardianPhone,
      occupation: input.guardianOccupation,
    });
    if (guardian) {
      await tx.studentGuardian.create({
        data: {
          studentId: student.id,
          guardianId: guardian.guardianId,
          relationship: clean(input.guardianRelationship) ?? "Guardian",
          isPrimary: true,
        },
      });
    }
    if (input.classSectionId) {
      const section = await tx.classSection.findUniqueOrThrow({ where: { id: input.classSectionId } });
      await tx.enrollment.create({
        data: {
          schoolId,
          studentId: student.id,
          classSectionId: section.id,
          academicYearId: section.academicYearId,
        },
      });
    }
    return { student, guardianPassword: guardian?.temporaryPassword };
  });
  await writeAudit({
    schoolId,
    userId: actor.id,
    action: "student.created",
    entity: "Student",
    entityId: created.student.id,
    description: `Created student ${input.firstName} ${input.lastName}`,
    ip,
  });
  return {
    student: await getStudent(actor, schoolId, created.student.id),
    temporaryPassword: password,
    guardianTemporaryPassword: created.guardianPassword ?? null,
  };
}

export async function updateStudent(actor: Actor, schoolId: string, id: string, body: unknown, ip?: string) {
  if (!can(actor, "students.write")) throw forbidden();
  const existing = await getStudent(actor, schoolId, id);
  const input = studentSchema.partial().parse(body);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: existing.user.id },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone === undefined ? undefined : clean(input.phone),
        email: input.email?.toLowerCase(),
      },
    });
    await tx.student.update({
      where: { id },
      data: {
        admissionNumber: clean(input.admissionNumber) ?? undefined,
        gender: input.gender,
        dateOfBirth: input.dateOfBirth === undefined ? undefined : dateOnly(input.dateOfBirth),
        address: input.address === undefined ? undefined : clean(input.address),
        bloodGroup: input.bloodGroup === undefined ? undefined : clean(input.bloodGroup),
        allergies: input.allergies === undefined ? undefined : clean(input.allergies),
        medicalNotes: input.medicalNotes === undefined ? undefined : clean(input.medicalNotes),
        emergencyName: input.emergencyName === undefined ? undefined : clean(input.emergencyName),
        emergencyPhone: input.emergencyPhone === undefined ? undefined : clean(input.emergencyPhone),
      },
    });
    if (input.classSectionId) {
      const section = await tx.classSection.findFirst({ where: { id: input.classSectionId, schoolId } });
      if (!section) throw notFound("Class not found.");
      await tx.enrollment.updateMany({ where: { studentId: id, status: "ACTIVE" }, data: { status: "TRANSFERRED" } });
      await tx.enrollment.upsert({
        where: { studentId_classSectionId: { studentId: id, classSectionId: section.id } },
        update: { status: "ACTIVE" },
        create: { schoolId, studentId: id, classSectionId: section.id, academicYearId: section.academicYearId },
      });
    }
  });
  await writeAudit({
    schoolId,
    userId: actor.id,
    action: "student.updated",
    entity: "Student",
    entityId: id,
    description: `Updated student ${existing.name}`,
    ip,
  });
  return getStudent(actor, schoolId, id);
}

export async function deactivateStudent(actor: Actor, schoolId: string, id: string, ip?: string) {
  if (!can(actor, "students.write")) throw forbidden();
  const existing = await getStudent(actor, schoolId, id);
  await prisma.$transaction([
    prisma.student.update({ where: { id }, data: { status: "INACTIVE" } }),
    prisma.user.update({ where: { id: existing.user.id }, data: { status: "INACTIVE" } }),
    prisma.enrollment.updateMany({ where: { studentId: id, status: "ACTIVE" }, data: { status: "COMPLETED" } }),
  ]);
  await writeAudit({
    schoolId,
    userId: actor.id,
    action: "student.deactivated",
    entity: "Student",
    entityId: id,
    description: `Deactivated student ${existing.name}`,
    ip,
  });
}

export async function studentAttendance(actor: Actor, schoolId: string, id: string) {
  await getStudent(actor, schoolId, id);
  if (!can(actor, "attendance.read")) throw forbidden();
  const records = await prisma.attendanceRecord.findMany({
    where: { studentId: id, session: { schoolId } },
    include: { session: { select: { date: true, classSection: { select: { name: true } } } } },
    orderBy: { session: { date: "desc" } },
    take: 60,
  });
  const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
  for (const record of records) counts[record.status] += 1;
  const total = records.length;
  return {
    summary: { ...counts, total, rate: total ? Math.round(((counts.PRESENT + counts.LATE) / total) * 1000) / 10 : 0 },
    records: records.map((record) => ({
      id: record.id,
      date: isoDate(record.session.date),
      status: record.status,
      reason: record.reason,
      className: record.session.classSection.name,
    })),
  };
}

export async function studentAcademics(actor: Actor, schoolId: string, id: string) {
  await getStudent(actor, schoolId, id);
  if (!can(actor, "grades.read") && !can(actor, "academics.read")) throw forbidden();
  const scores = await prisma.examScore.findMany({
    where: { studentId: id, examPaper: { exam: { schoolId } } },
    include: { examPaper: { include: { subject: true, exam: true } } },
    orderBy: { createdAt: "desc" },
  });
  return scores.map((score) => ({
    id: score.id,
    exam: score.examPaper.exam.name,
    examId: score.examPaper.examId,
    subject: score.examPaper.subject.name,
    score: Number(score.score),
    maxScore: Number(score.examPaper.maxScore),
    remarks: score.remarks,
  }));
}

export async function studentFees(actor: Actor, schoolId: string, id: string) {
  await getStudent(actor, schoolId, id);
  if (!can(actor, "fees.read")) throw forbidden();
  const invoices = await prisma.invoice.findMany({
    where: { studentId: id, schoolId },
    include: { lines: true, payments: true, term: true },
    orderBy: { createdAt: "desc" },
  });
  return invoices.map((invoice) => {
    const total = invoice.lines.reduce((sum, line) => sum + Number(line.amount), 0);
    const paid = invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    return {
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      dueDate: isoDate(invoice.dueDate),
      term: invoice.term?.name ?? null,
      total,
      discount: Number(invoice.discount),
      paid,
      balance: Math.max(0, total - Number(invoice.discount) - paid),
    };
  });
}

export async function studentAssignments(actor: Actor, schoolId: string, id: string) {
  await getStudent(actor, schoolId, id);
  if (!can(actor, "assignments.read")) throw forbidden();
  const student = await prisma.student.findUniqueOrThrow({
    where: { id },
    include: { enrollments: { where: { status: "ACTIVE" }, take: 1 } },
  });
  const classSectionId = student.enrollments[0]?.classSectionId;
  if (!classSectionId) return [];
  const assignments = await prisma.assignment.findMany({
    where: { schoolId, classSectionId, status: { not: "DRAFT" } },
    include: { subject: true, submissions: { where: { studentId: id } } },
    orderBy: { dueAt: "asc" },
  });
  return assignments.map((assignment) => ({
    id: assignment.id,
    title: assignment.title,
    subject: assignment.subject.name,
    dueAt: assignment.dueAt,
    status: assignment.submissions[0]?.status ?? "NOT_SUBMITTED",
    score: assignment.submissions[0]?.score == null ? null : Number(assignment.submissions[0].score),
    feedback: assignment.submissions[0]?.feedback ?? null,
  }));
}

export async function studentDocuments(actor: Actor, schoolId: string, id: string) {
  await getStudent(actor, schoolId, id);
  if (!can(actor, "documents.read")) throw forbidden();
  return prisma.document.findMany({
    where: { schoolId, studentId: id },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, category: true, fileName: true, mimeType: true, size: true, createdAt: true },
  });
}

export async function studentDiscipline(actor: Actor, schoolId: string, id: string) {
  await getStudent(actor, schoolId, id);
  if (!can(actor, "discipline.read")) throw forbidden();
  return prisma.disciplineRecord.findMany({
    where: { schoolId, studentId: id },
    orderBy: { occurredOn: "desc" },
    include: { reportedBy: { select: { firstName: true, lastName: true } } },
  });
}
