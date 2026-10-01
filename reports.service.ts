import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import type { ReportType } from "@edumanage/shared";
import { prisma } from "../../config/prisma.js";
import { num } from "../../lib/serialize.js";

export async function buildReport(schoolId: string, type: ReportType) {
  const rows = await rowsFor(schoolId, type);
  return { type, columns: rows.columns, rows: rows.rows };
}

async function rowsFor(schoolId: string, type: ReportType) {
  if (type === "enrollment") {
    const sections = await prisma.classSection.findMany({ where: { schoolId }, include: { _count: { select: { enrollments: { where: { status: "ACTIVE" } } } }, academicYear: true } });
    return { columns: ["Class", "Year", "Students"], rows: sections.map((section) => [section.name, section.academicYear.name, section._count.enrollments]) };
  }
  if (type === "attendance") {
    const records = await prisma.attendanceRecord.groupBy({ by: ["status"], where: { session: { schoolId } }, _count: true });
    return { columns: ["Status", "Records"], rows: records.map((row) => [row.status, row._count]) };
  }
  if (type === "performance") {
    const scores = await prisma.examScore.findMany({ where: { examPaper: { exam: { schoolId } } }, include: { examPaper: { include: { subject: true } }, student: { include: { user: true } } }, take: 500 });
    return { columns: ["Student", "Subject", "Score", "Max"], rows: scores.map((score) => [`${score.student.user.firstName} ${score.student.user.lastName}`, score.examPaper.subject.name, num(score.score), num(score.examPaper.maxScore)]) };
  }
  if (type === "fees" || type === "outstanding") {
    const invoices = await prisma.invoice.findMany({ where: { schoolId, ...(type === "outstanding" ? { status: { in: ["PENDING", "PARTIAL", "OVERDUE"] } } : {}) }, include: { student: { include: { user: true } }, lines: true, payments: true } });
    return {
      columns: ["Invoice", "Student", "Status", "Balance"],
      rows: invoices.map((invoice) => {
        const total = invoice.lines.reduce((sum, line) => sum + num(line.amount), 0);
        const paid = invoice.payments.reduce((sum, payment) => sum + num(payment.amount), 0);
        return [invoice.number, `${invoice.student.user.firstName} ${invoice.student.user.lastName}`, invoice.status, Math.max(0, total - num(invoice.discount) - paid)];
      }),
    };
  }
  if (type === "workload") {
    const teachers = await prisma.teacher.findMany({ where: { schoolId }, include: { user: true, _count: { select: { assignments: true } } } });
    return { columns: ["Teacher", "Assignments"], rows: teachers.map((teacher) => [`${teacher.user.firstName} ${teacher.user.lastName}`, teacher._count.assignments]) };
  }
  if (type === "library") {
    const loans = await prisma.bookLoan.findMany({ where: { schoolId }, include: { book: true, borrower: true }, take: 300 });
    return { columns: ["Book", "Borrower", "Status", "Due"], rows: loans.map((loan) => [loan.book.title, `${loan.borrower.firstName} ${loan.borrower.lastName}`, loan.status, loan.dueAt.toISOString().slice(0, 10)]) };
  }
  if (type === "discipline") {
    const records = await prisma.disciplineRecord.findMany({ where: { schoolId }, include: { student: { include: { user: true } } } });
    return { columns: ["Student", "Incident", "Status", "Date"], rows: records.map((record) => [`${record.student.user.firstName} ${record.student.user.lastName}`, record.incident, record.status, record.occurredOn.toISOString().slice(0, 10)]) };
  }
  const assignments = await prisma.assignment.findMany({ where: { schoolId }, include: { classSection: true, _count: { select: { submissions: true } } } });
  return { columns: ["Assignment", "Class", "Submissions"], rows: assignments.map((item) => [item.title, item.classSection.name, item._count.submissions]) };
}

export async function reportWorkbook(schoolId: string, type: ReportType) {
  const report = await buildReport(schoolId, type);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(type);
  sheet.addRow(report.columns);
  for (const row of report.rows) sheet.addRow(row);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function reportPdf(schoolId: string, type: ReportType) {
  const report = await buildReport(schoolId, type);
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  const doc = new PDFDocument({ margin: 48, size: "A4" });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  doc.fontSize(16).text(school?.name ?? "School report");
  doc.moveDown(0.3).fontSize(12).text(type.replace(/^\w/, (letter) => letter.toUpperCase()));
  doc.moveDown().fontSize(9);
  doc.text(report.columns.join("  |  "));
  doc.moveDown(0.4);
  for (const row of report.rows.slice(0, 80)) doc.text(row.map(String).join("  |  "));
  doc.end();
  return done;
}
