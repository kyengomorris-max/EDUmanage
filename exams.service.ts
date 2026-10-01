import { average, bandFor, gradeScaleSchema, percentage, rankByAverage, scoreEntrySchema } from "@edumanage/shared";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import type { Actor } from "../../lib/access.js";
import { can, isStaffManager } from "../../lib/access.js";
import { writeAudit } from "../../lib/audit.js";
import { forbidden, notFound } from "../../lib/errors.js";
import { notifyUsers } from "../../lib/notify.js";
import { dateOnly, fullName, isoDate, num } from "../../lib/serialize.js";

const examSchema = z.object({
  name: z.string().trim().min(2).max(120),
  examTypeId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  termId: z.string().uuid(),
  startDate: z.string(),
  endDate: z.string(),
});

const paperSchema = z.object({
  subjectId: z.string().uuid(),
  classSectionId: z.string().uuid(),
  maxScore: z.number().positive().max(1000).default(100),
  examDate: z.string().optional(),
});

async function bandsFor(schoolId: string) {
  const scale = await prisma.gradeScale.findFirst({
    where: { schoolId, isDefault: true },
    include: { bands: { orderBy: { sortOrder: "asc" } } },
  });
  return (scale?.bands ?? []).map((band) => ({
    minScore: num(band.minScore),
    maxScore: num(band.maxScore),
    letter: band.letter,
    remark: band.remark,
    points: band.points == null ? null : num(band.points),
  }));
}

async function positionsEnabled(schoolId: string) {
  const setting = await prisma.schoolSetting.findUnique({
    where: { schoolId_key: { schoolId, key: "academics.computePositions" } },
  });
  return setting?.value !== false;
}

async function assertCanEnter(actor: Actor, schoolId: string, classSectionId: string, subjectId: string) {
  if (!can(actor, "grades.write")) throw forbidden();
  if (isStaffManager(actor)) return;
  const teacher = await prisma.teacher.findUnique({ where: { userId: actor.id } });
  if (!teacher) throw forbidden();
  const assignment = await prisma.teachingAssignment.findFirst({ where: { schoolId, teacherId: teacher.id, classSectionId, subjectId } });
  const classTeacher = await prisma.classSection.findFirst({ where: { id: classSectionId, classTeacherId: teacher.id } });
  if (!assignment && !classTeacher) throw forbidden("You can only enter marks for your subjects.");
}

export async function listExamTypes(schoolId: string) {
  return prisma.examType.findMany({ where: { schoolId }, orderBy: { name: "asc" } });
}

export async function createExamType(actor: Actor, schoolId: string, name: string) {
  if (!can(actor, "academics.write") && !can(actor, "grades.write")) throw forbidden();
  return prisma.examType.create({ data: { schoolId, name: name.trim() } });
}

export async function listExams(schoolId: string) {
  const exams = await prisma.exam.findMany({
    where: { schoolId },
    include: { examType: true, term: true, academicYear: true, papers: { include: { subject: true, classSection: true } } },
    orderBy: { startDate: "desc" },
  });
  return exams.map((exam) => ({
    id: exam.id,
    name: exam.name,
    examType: exam.examType.name,
    examTypeId: exam.examTypeId,
    term: exam.term.name,
    termId: exam.termId,
    academicYear: exam.academicYear.name,
    academicYearId: exam.academicYearId,
    startDate: isoDate(exam.startDate),
    endDate: isoDate(exam.endDate),
    papers: exam.papers.map((paper) => ({
      id: paper.id,
      subjectId: paper.subjectId,
      classSectionId: paper.classSectionId,
    })),
  }));
}

export async function createExam(actor: Actor, schoolId: string, body: unknown) {
  if (!can(actor, "academics.write") && !can(actor, "grades.write")) throw forbidden();
  const input = examSchema.parse(body);
  return prisma.exam.create({
    data: {
      schoolId,
      name: input.name,
      examTypeId: input.examTypeId,
      academicYearId: input.academicYearId,
      termId: input.termId,
      startDate: dateOnly(input.startDate)!,
      endDate: dateOnly(input.endDate)!,
    },
  });
}

export async function addPaper(actor: Actor, schoolId: string, examId: string, body: unknown) {
  if (!can(actor, "academics.write") && !can(actor, "grades.write")) throw forbidden();
  const exam = await prisma.exam.findFirst({ where: { id: examId, schoolId } });
  if (!exam) throw notFound("Exam not found.");
  const input = paperSchema.parse(body);
  return prisma.examPaper.upsert({
    where: { examId_subjectId_classSectionId: { examId, subjectId: input.subjectId, classSectionId: input.classSectionId } },
    update: { maxScore: input.maxScore, examDate: dateOnly(input.examDate) },
    create: {
      examId,
      subjectId: input.subjectId,
      classSectionId: input.classSectionId,
      maxScore: input.maxScore,
      examDate: dateOnly(input.examDate),
    },
  });
}

export async function getPaper(actor: Actor, schoolId: string, paperId: string) {
  const paper = await prisma.examPaper.findFirst({
    where: { id: paperId, exam: { schoolId } },
    include: { subject: true, classSection: true, exam: true, scores: true },
  });
  if (!paper) throw notFound("Exam paper not found.");
  if (!isStaffManager(actor)) await assertCanEnter(actor, schoolId, paper.classSectionId, paper.subjectId).catch(() => {
    if (!can(actor, "grades.read")) throw forbidden();
  });
  const enrollments = await prisma.enrollment.findMany({
    where: { classSectionId: paper.classSectionId, status: "ACTIVE" },
    include: { student: { include: { user: true } } },
    orderBy: { student: { user: { lastName: "asc" } } },
  });
  const saved = new Map(paper.scores.map((score) => [score.studentId, score]));
  return {
    id: paper.id,
    exam: paper.exam.name,
    subject: paper.subject.name,
    className: paper.classSection.name,
    maxScore: num(paper.maxScore),
    students: enrollments.map((enrollment) => ({
      studentId: enrollment.studentId,
      name: fullName(enrollment.student.user),
      admissionNumber: enrollment.student.admissionNumber,
      score: saved.has(enrollment.studentId) ? num(saved.get(enrollment.studentId)!.score) : null,
      remarks: saved.get(enrollment.studentId)?.remarks ?? "",
    })),
  };
}

export async function saveScores(actor: Actor, schoolId: string, paperId: string, body: unknown, ip?: string) {
  const paper = await prisma.examPaper.findFirst({ where: { id: paperId, exam: { schoolId } }, include: { exam: true, subject: true } });
  if (!paper) throw notFound("Exam paper not found.");
  await assertCanEnter(actor, schoolId, paper.classSectionId, paper.subjectId);
  const input = scoreEntrySchema.parse(body);
  const max = num(paper.maxScore);
  for (const entry of input.scores) {
    if (entry.score > max) throw forbidden(`A mark cannot be higher than ${max}.`);
    await prisma.examScore.upsert({
      where: { examPaperId_studentId: { examPaperId: paperId, studentId: entry.studentId } },
      update: { score: entry.score, remarks: entry.remarks || null, enteredById: actor.id },
      create: { examPaperId: paperId, studentId: entry.studentId, score: entry.score, remarks: entry.remarks || null, enteredById: actor.id },
    });
  }
  await writeAudit({
    schoolId,
    userId: actor.id,
    action: "grade.changed",
    entity: "ExamPaper",
    entityId: paperId,
    description: `Entered marks for ${paper.subject.name} (${paper.exam.name})`,
    ip,
  });
  const students = await prisma.student.findMany({ where: { id: { in: input.scores.map((score) => score.studentId) } }, select: { userId: true } });
  await notifyUsers(students.map((student) => student.userId), {
    schoolId,
    type: "EXAM_RESULT",
    title: "Marks updated",
    body: `${paper.subject.name} marks were recorded for ${paper.exam.name}.`,
    link: "/app/results",
  });
  return getPaper(actor, schoolId, paperId);
}

export async function classResults(schoolId: string, examId: string, classSectionId: string) {
  const bands = await bandsFor(schoolId);
  const compute = await positionsEnabled(schoolId);
  const papers = await prisma.examPaper.findMany({
    where: { examId, classSectionId },
    include: { subject: true, scores: true },
    orderBy: { subject: { name: "asc" } },
  });
  const enrollments = await prisma.enrollment.findMany({
    where: { classSectionId, status: "ACTIVE" },
    include: { student: { include: { user: true } } },
  });
  const rows = enrollments.map((enrollment) => {
    const subjects = papers.map((paper) => {
      const score = paper.scores.find((item) => item.studentId === enrollment.studentId);
      const value = score ? num(score.score) : null;
      const percent = value == null ? null : percentage(value, num(paper.maxScore));
      const band = percent == null ? null : bandFor(percent, bands);
      return {
        subjectId: paper.subjectId,
        subject: paper.subject.name,
        score: value,
        maxScore: num(paper.maxScore),
        percent,
        grade: band?.letter ?? null,
        remark: score?.remarks || band?.remark || null,
      };
    });
    const graded = subjects.filter((subject) => subject.percent != null);
    return {
      studentId: enrollment.studentId,
      name: fullName(enrollment.student.user),
      admissionNumber: enrollment.student.admissionNumber,
      subjects,
      total: Math.round(graded.reduce((sum, subject) => sum + (subject.score ?? 0), 0) * 10) / 10,
      average: average(graded.map((subject) => subject.percent!)),
    };
  });
  if (!compute) return rows.map((row) => ({ ...row, position: null as number | null, grade: bandFor(row.average, bands)?.letter ?? null }));
  return rankByAverage(rows).map((row) => ({ ...row, grade: bandFor(row.average, bands)?.letter ?? null }));
}

export async function gradeScale(schoolId: string) {
  const scale = await prisma.gradeScale.findFirst({ where: { schoolId, isDefault: true }, include: { bands: { orderBy: { minScore: "desc" } } } });
  if (!scale) return null;
  return { id: scale.id, name: scale.name, bands: scale.bands.map((band) => ({ ...band, minScore: num(band.minScore), maxScore: num(band.maxScore), points: band.points == null ? null : num(band.points) })) };
}

export async function saveGradeScale(actor: Actor, schoolId: string, body: unknown) {
  if (!can(actor, "settings.write") && !can(actor, "academics.write")) throw forbidden();
  const input = gradeScaleSchema.parse(body);
  const existing = await prisma.gradeScale.findFirst({ where: { schoolId, isDefault: true } });
  if (existing) {
    await prisma.gradeBand.deleteMany({ where: { gradeScaleId: existing.id } });
    return prisma.gradeScale.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        bands: { create: input.bands.map((band, index) => ({ ...band, sortOrder: index + 1 })) },
      },
      include: { bands: true },
    });
  }
  return prisma.gradeScale.create({
    data: { schoolId, name: input.name, isDefault: true, bands: { create: input.bands.map((band, index) => ({ ...band, sortOrder: index + 1 })) } },
    include: { bands: true },
  });
}

async function canSeeStudent(actor: Actor, schoolId: string, studentId: string) {
  if (isStaffManager(actor) || can(actor, "reports.read")) return;
  if (actor.roles.includes("STUDENT")) {
    const own = await prisma.student.findFirst({ where: { id: studentId, userId: actor.id, schoolId } });
    if (!own) throw forbidden();
    return;
  }
  if (actor.roles.includes("PARENT")) {
    const linked = await prisma.studentGuardian.findFirst({ where: { studentId, guardian: { userId: actor.id } } });
    if (!linked) throw forbidden("You can only open report cards for your own children.");
    return;
  }
  if (actor.roles.includes("TEACHER") && can(actor, "grades.read")) return;
  throw forbidden();
}

export async function reportCard(actor: Actor, schoolId: string, studentId: string, examId?: string) {
  await canSeeStudent(actor, schoolId, studentId);
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId },
    include: {
      user: true,
      enrollments: { where: { status: "ACTIVE" }, include: { classSection: true }, take: 1 },
      school: true,
    },
  });
  if (!student) throw notFound("Student not found.");
  const exam = examId
    ? await prisma.exam.findFirst({ where: { id: examId, schoolId } })
    : await prisma.exam.findFirst({ where: { schoolId }, orderBy: { startDate: "desc" } });
  if (!exam) throw notFound("No exam is available for this report.");
  const classSectionId = student.enrollments[0]?.classSectionId;
  if (!classSectionId) throw notFound("This student is not enrolled in a class.");
  const results = await classResults(schoolId, exam.id, classSectionId);
  const mine = results.find((row) => row.studentId === studentId);
  if (!mine) throw notFound("No results were found for this student.");
  const remarks = await prisma.reportCard.findUnique({
    where: { studentId_termId_examId: { studentId, termId: exam.termId, examId: exam.id } },
  });
  const attendance = await prisma.attendanceRecord.findMany({
    where: { studentId, session: { schoolId, date: { gte: exam.startDate, lte: exam.endDate } } },
  });
  const present = attendance.filter((record) => record.status === "PRESENT" || record.status === "LATE").length;
  return {
    school: { name: student.school.name, motto: student.school.motto, address: student.school.address, primaryColor: student.school.primaryColor, logoUrl: student.school.logoUrl },
    student: { id: student.id, name: fullName(student.user), admissionNumber: student.admissionNumber },
    className: student.enrollments[0]?.classSection.name,
    exam: { id: exam.id, name: exam.name, termId: exam.termId },
    subjects: mine.subjects,
    total: mine.total,
    average: mine.average,
    grade: mine.grade,
    position: mine.position,
    classSize: results.length,
    attendance: { present, total: attendance.length, rate: attendance.length ? Math.round((present / attendance.length) * 1000) / 10 : null },
    classTeacherRemark: remarks?.classTeacherRemark ?? "",
    principalRemark: remarks?.principalRemark ?? "",
    published: remarks?.published ?? false,
  };
}

const remarkSchema = z.object({
  examId: z.string().uuid(),
  classTeacherRemark: z.string().max(800).optional(),
  principalRemark: z.string().max(800).optional(),
  published: z.boolean().optional(),
});

export async function saveRemarks(actor: Actor, schoolId: string, studentId: string, body: unknown) {
  if (!can(actor, "grades.write")) throw forbidden();
  const input = remarkSchema.parse(body);
  const exam = await prisma.exam.findFirst({ where: { id: input.examId, schoolId } });
  if (!exam) throw notFound("Exam not found.");
  if (input.principalRemark && !isStaffManager(actor)) throw forbidden("Only school leadership can save the principal remark.");
  return prisma.reportCard.upsert({
    where: { studentId_termId_examId: { studentId, termId: exam.termId, examId: exam.id } },
    update: {
      classTeacherRemark: input.classTeacherRemark,
      principalRemark: input.principalRemark,
      published: input.published,
      publishedById: actor.id,
    },
    create: {
      schoolId,
      studentId,
      termId: exam.termId,
      examId: exam.id,
      classTeacherRemark: input.classTeacherRemark,
      principalRemark: input.principalRemark,
      published: input.published ?? false,
      publishedById: actor.id,
    },
  });
}

export async function reportPdf(actor: Actor, schoolId: string, studentId: string, examId?: string) {
  const card = await reportCard(actor, schoolId, studentId, examId);
  const doc = new PDFDocument({ margin: 48, size: "A4" });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  doc.fontSize(18).text(card.school.name, { align: "center" });
  doc.moveDown(0.2).fontSize(11).fillColor("#475569").text("Student report card", { align: "center" });
  doc.fillColor("#0f172a").moveDown().fontSize(12);
  doc.text(`Student: ${card.student.name}`);
  doc.text(`Admission number: ${card.student.admissionNumber}`);
  doc.text(`Class: ${card.className}`);
  doc.text(`Exam: ${card.exam.name}`);
  doc.moveDown().fontSize(11);
  for (const subject of card.subjects) {
    doc.text(`${subject.subject}: ${subject.score ?? "—"} / ${subject.maxScore}   ${subject.grade ?? ""}`);
  }
  doc.moveDown();
  doc.text(`Total: ${card.total}    Average: ${card.average}%    Grade: ${card.grade ?? "—"}`);
  if (card.position) doc.text(`Position: ${card.position} of ${card.classSize}`);
  if (card.attendance.rate != null) doc.text(`Attendance in exam period: ${card.attendance.rate}%`);
  if (card.classTeacherRemark) doc.moveDown().text(`Class teacher: ${card.classTeacherRemark}`);
  if (card.principalRemark) doc.moveDown().text(`Principal: ${card.principalRemark}`);
  doc.end();
  return { filename: `${card.student.admissionNumber}-report.pdf`, buffer: await done };
}
