import { deriveInvoiceStatus, invoiceBalance, scholarshipValue } from "@edumanage/shared";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { paymentSchema } from "@edumanage/shared";
import { prisma } from "../../config/prisma.js";
import type { Actor } from "../../lib/access.js";
import { can } from "../../lib/access.js";
import { writeAudit } from "../../lib/audit.js";
import { forbidden, notFound } from "../../lib/errors.js";
import { readPage } from "../../lib/http.js";
import { notifyUsers } from "../../lib/notify.js";
import { clean, dateOnly, fullName, isoDate, num } from "../../lib/serialize.js";

const structureSchema = z.object({
  name: z.string().trim().min(2).max(120),
  academicYearId: z.string().uuid(),
  classLevelId: z.string().uuid().optional().or(z.literal("")),
  items: z.array(z.object({ name: z.string().min(2), amount: z.number().nonnegative() })).min(1),
});

const generateSchema = z.object({
  feeStructureId: z.string().uuid(),
  termId: z.string().uuid().optional(),
  classSectionId: z.string().uuid().optional(),
  dueDate: z.string(),
});

const scholarshipSchema = z.object({
  studentId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  name: z.string().min(2),
  amount: z.number().nonnegative().default(0),
  percent: z.number().min(0).max(100).default(0),
  notes: z.string().optional(),
});

async function visibleStudentIds(actor: Actor, schoolId: string) {
  if (can(actor, "fees.write") || actor.roles.some((role) => ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "ACCOUNTANT"].includes(role))) return null;
  if (actor.roles.includes("STUDENT")) {
    const student = await prisma.student.findFirst({ where: { userId: actor.id, schoolId } });
    return student ? [student.id] : [];
  }
  if (actor.roles.includes("PARENT")) {
    const links = await prisma.studentGuardian.findMany({ where: { guardian: { userId: actor.id } }, select: { studentId: true } });
    return links.map((link) => link.studentId);
  }
  return [];
}

function presentInvoice(invoice: {
  id: string;
  number: string;
  status: string;
  dueDate: Date;
  discount: { toString(): string } | number;
  discountReason: string | null;
  student: { id: string; admissionNumber: string; user: { firstName: string; lastName: string } };
  lines: { description: string; amount: { toString(): string } | number }[];
  payments: { id: string; amount: { toString(): string } | number; method: string; paidAt: Date; receiptNumber: string; reference: string | null }[];
  term?: { name: string } | null;
}) {
  const total = invoice.lines.reduce((sum, line) => sum + Number(line.amount), 0);
  const paid = invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const money = invoiceBalance(total, Number(invoice.discount), paid);
  return {
    id: invoice.id,
    number: invoice.number,
    status: invoice.status,
    dueDate: isoDate(invoice.dueDate),
    studentId: invoice.student.id,
    student: fullName(invoice.student.user),
    admissionNumber: invoice.student.admissionNumber,
    term: invoice.term?.name ?? null,
    lines: invoice.lines.map((line) => ({ description: line.description, amount: Number(line.amount) })),
    payments: invoice.payments.map((payment) => ({
      id: payment.id,
      amount: Number(payment.amount),
      method: payment.method,
      paidAt: payment.paidAt,
      receiptNumber: payment.receiptNumber,
      reference: payment.reference,
    })),
    total,
    discount: Number(invoice.discount),
    discountReason: invoice.discountReason,
    paid,
    balance: money.balance,
  };
}

const invoiceInclude = {
  student: { include: { user: true } },
  lines: true,
  payments: true,
  term: true,
} as const;

export async function listStructures(schoolId: string) {
  const rows = await prisma.feeStructure.findMany({ where: { schoolId }, include: { items: true, academicYear: true, classLevel: true }, orderBy: { createdAt: "desc" } });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    academicYear: row.academicYear.name,
    academicYearId: row.academicYearId,
    classLevel: row.classLevel?.name ?? "All classes",
    classLevelId: row.classLevelId,
    items: row.items.map((item) => ({ id: item.id, name: item.name, amount: num(item.amount) })),
    total: row.items.reduce((sum, item) => sum + num(item.amount), 0),
  }));
}

export async function createStructure(actor: Actor, schoolId: string, body: unknown) {
  if (!can(actor, "fees.write")) throw forbidden();
  const input = structureSchema.parse(body);
  return prisma.feeStructure.create({
    data: {
      schoolId,
      name: input.name,
      academicYearId: input.academicYearId,
      classLevelId: clean(input.classLevelId),
      items: { create: input.items },
    },
    include: { items: true },
  });
}

export async function generateInvoices(actor: Actor, schoolId: string, body: unknown) {
  if (!can(actor, "fees.write")) throw forbidden();
  const input = generateSchema.parse(body);
  const structure = await prisma.feeStructure.findFirst({ where: { id: input.feeStructureId, schoolId }, include: { items: true } });
  if (!structure) throw notFound("Fee structure not found.");
  const enrollments = await prisma.enrollment.findMany({
    where: {
      schoolId,
      status: "ACTIVE",
      academicYearId: structure.academicYearId,
      ...(input.classSectionId ? { classSectionId: input.classSectionId } : {}),
      ...(structure.classLevelId ? { classSection: { classLevelId: structure.classLevelId } } : {}),
    },
    include: { student: true },
  });
  let createdCount = 0;
  for (const enrollment of enrollments) {
    const existing = await prisma.invoice.findFirst({
      where: { studentId: enrollment.studentId, academicYearId: structure.academicYearId, termId: input.termId ?? null, notes: structure.id },
    });
    if (existing) continue;
    const subtotal = structure.items.reduce((sum, item) => sum + num(item.amount), 0);
    const scholarships = await prisma.scholarship.findMany({ where: { studentId: enrollment.studentId, academicYearId: structure.academicYearId } });
    const discount = scholarships.reduce((sum, item) => sum + scholarshipValue(subtotal, num(item.amount), num(item.percent)), 0);
    const count = await prisma.invoice.count({ where: { schoolId } });
    const due = dateOnly(input.dueDate)!;
    const status = deriveInvoiceStatus({ total: subtotal, discount: Math.min(subtotal, discount), paid: 0, dueDate: due });
    await prisma.invoice.create({
      data: {
        schoolId,
        studentId: enrollment.studentId,
        academicYearId: structure.academicYearId,
        termId: input.termId,
        number: `INV-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`,
        dueDate: due,
        discount: Math.min(subtotal, discount),
        discountReason: scholarships.map((item) => item.name).join(", ") || null,
        notes: structure.id,
        status,
        lines: { create: structure.items.map((item) => ({ description: item.name, amount: item.amount })) },
      },
    });
    createdCount += 1;
  }
  return { created: createdCount };
}

export async function listInvoices(actor: Actor, schoolId: string, query: Record<string, unknown>) {
  if (!can(actor, "fees.read")) throw forbidden();
  const page = readPage(query);
  const ids = await visibleStudentIds(actor, schoolId);
  const where = {
    schoolId,
    ...(ids ? { studentId: { in: ids } } : {}),
    ...(typeof query.status === "string" ? { status: query.status as never } : {}),
    ...(typeof query.studentId === "string" ? { studentId: String(query.studentId) } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({ where, include: invoiceInclude, orderBy: { createdAt: "desc" }, skip: page.skip, take: page.pageSize }),
  ]);
  return { rows: rows.map(presentInvoice), page, total };
}

export async function recordPayment(actor: Actor, schoolId: string, body: unknown, ip?: string) {
  if (!can(actor, "payments.write")) throw forbidden();
  const input = paymentSchema.parse(body);
  const invoice = await prisma.invoice.findFirst({ where: { id: input.invoiceId, schoolId }, include: { lines: true, payments: true, student: true } });
  if (!invoice) throw notFound("Invoice not found.");
  const total = invoice.lines.reduce((sum, line) => sum + num(line.amount), 0);
  const paid = invoice.payments.reduce((sum, payment) => sum + num(payment.amount), 0);
  const balance = invoiceBalance(total, num(invoice.discount), paid).balance;
  if (input.amount > balance + 0.001) throw forbidden(`The amount is higher than the balance of ${balance}.`);
  const count = await prisma.payment.count({ where: { schoolId } });
  const payment = await prisma.payment.create({
    data: {
      schoolId,
      invoiceId: invoice.id,
      amount: input.amount,
      method: input.method,
      reference: clean(input.reference),
      notes: clean(input.notes),
      paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
      receivedById: actor.id,
      receiptNumber: `RCT-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`,
    },
  });
  const status = deriveInvoiceStatus({
    total,
    discount: num(invoice.discount),
    paid: paid + input.amount,
    dueDate: invoice.dueDate,
  });
  await prisma.invoice.update({ where: { id: invoice.id }, data: { status } });
  await writeAudit({
    schoolId,
    userId: actor.id,
    action: "payment.recorded",
    entity: "Payment",
    entityId: payment.id,
    description: `Recorded ${input.amount} against ${invoice.number}`,
    ip,
  });
  await notifyUsers([invoice.student.userId], {
    schoolId,
    type: "FEE",
    title: "Payment recorded",
    body: `A payment was recorded on invoice ${invoice.number}.`,
    link: "/app/fees",
  });
  return payment;
}

export async function listPayments(actor: Actor, schoolId: string) {
  if (!can(actor, "fees.read")) throw forbidden();
  const ids = await visibleStudentIds(actor, schoolId);
  const rows = await prisma.payment.findMany({
    where: { schoolId, ...(ids ? { invoice: { studentId: { in: ids } } } : {}) },
    include: { invoice: { include: { student: { include: { user: true } } } } },
    orderBy: { paidAt: "desc" },
    take: 100,
  });
  return rows.map((payment) => ({
    id: payment.id,
    amount: num(payment.amount),
    method: payment.method,
    reference: payment.reference,
    receiptNumber: payment.receiptNumber,
    paidAt: payment.paidAt,
    invoiceNumber: payment.invoice.number,
    student: fullName(payment.invoice.student.user),
  }));
}

export async function createScholarship(actor: Actor, schoolId: string, body: unknown) {
  if (!can(actor, "fees.write")) throw forbidden();
  const input = scholarshipSchema.parse(body);
  return prisma.scholarship.create({
    data: {
      schoolId,
      studentId: input.studentId,
      academicYearId: input.academicYearId,
      name: input.name,
      amount: input.amount,
      percent: input.percent,
      notes: clean(input.notes),
    },
  });
}

export async function listScholarships(schoolId: string) {
  const rows = await prisma.scholarship.findMany({ where: { schoolId }, include: { student: { include: { user: true } } }, orderBy: { createdAt: "desc" } });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    amount: num(row.amount),
    percent: num(row.percent),
    student: fullName(row.student.user),
    studentId: row.studentId,
    notes: row.notes,
  }));
}

export async function feeSummary(schoolId: string) {
  const invoices = await prisma.invoice.findMany({ where: { schoolId }, include: { lines: true, payments: true } });
  let billed = 0;
  let collected = 0;
  let outstanding = 0;
  const byStatus: Record<string, number> = {};
  for (const invoice of invoices) {
    const total = invoice.lines.reduce((sum, line) => sum + num(line.amount), 0);
    const paid = invoice.payments.reduce((sum, payment) => sum + num(payment.amount), 0);
    const money = invoiceBalance(total, num(invoice.discount), paid);
    billed += money.due;
    collected += money.paid;
    outstanding += money.balance;
    byStatus[invoice.status] = (byStatus[invoice.status] ?? 0) + 1;
  }
  return { billed, collected, outstanding, byStatus };
}

export async function receiptPdf(actor: Actor, schoolId: string, paymentId: string) {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, schoolId },
    include: { invoice: { include: { student: { include: { user: true } }, lines: true, payments: true } }, school: true },
  });
  if (!payment) throw notFound("Receipt not found.");
  const ids = await visibleStudentIds(actor, schoolId);
  if (ids && !ids.includes(payment.invoice.studentId)) throw forbidden();
  const doc = new PDFDocument({ margin: 48, size: "A4" });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  doc.fontSize(18).text(payment.school.name, { align: "center" });
  doc.moveDown(0.3).fontSize(13).text("Payment receipt", { align: "center" });
  doc.moveDown().fontSize(11);
  doc.text(`Receipt: ${payment.receiptNumber}`);
  doc.text(`Invoice: ${payment.invoice.number}`);
  doc.text(`Student: ${fullName(payment.invoice.student.user)}`);
  doc.text(`Amount: ${num(payment.amount).toFixed(2)}`);
  doc.text(`Method: ${payment.method}`);
  doc.text(`Date: ${payment.paidAt.toISOString().slice(0, 10)}`);
  if (payment.reference) doc.text(`Reference: ${payment.reference}`);
  doc.end();
  return { filename: `${payment.receiptNumber}.pdf`, buffer: await done };
}
