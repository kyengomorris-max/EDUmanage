import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import type { Actor } from "../../lib/access.js";
import { can } from "../../lib/access.js";
import { forbidden, notFound } from "../../lib/errors.js";
import { clean, fullName } from "../../lib/serialize.js";

const bookSchema = z.object({
  title: z.string().trim().min(2).max(180),
  author: z.string().trim().min(2).max(120),
  isbn: z.string().trim().max(20).optional().or(z.literal("")),
  categoryId: z.string().uuid().optional().or(z.literal("")),
  quantity: z.coerce.number().int().positive().max(500),
});

const loanSchema = z.object({
  bookId: z.string().uuid(),
  borrowerId: z.string().uuid(),
  dueAt: z.string(),
});

async function refreshOverdue(schoolId: string) {
  await prisma.bookLoan.updateMany({
    where: { schoolId, status: "BORROWED", dueAt: { lt: new Date() }, returnedAt: null },
    data: { status: "OVERDUE" },
  });
}

export async function librarySummary(schoolId: string) {
  await refreshOverdue(schoolId);
  const [books, borrowed, overdue] = await Promise.all([
    prisma.book.aggregate({ where: { schoolId }, _sum: { quantity: true, available: true } }),
    prisma.bookLoan.count({ where: { schoolId, status: { in: ["BORROWED", "OVERDUE"] } } }),
    prisma.bookLoan.count({ where: { schoolId, status: "OVERDUE" } }),
  ]);
  return {
    totalBooks: books._sum.quantity ?? 0,
    available: books._sum.available ?? 0,
    borrowed,
    overdue,
  };
}

export async function listBooks(schoolId: string, search: string) {
  return prisma.book.findMany({
    where: {
      schoolId,
      ...(search
        ? { OR: [{ title: { contains: search, mode: "insensitive" } }, { author: { contains: search, mode: "insensitive" } }, { isbn: { contains: search, mode: "insensitive" } }] }
        : {}),
    },
    include: { category: true },
    orderBy: { title: "asc" },
  });
}

export async function saveBook(actor: Actor, schoolId: string, body: unknown, id?: string) {
  if (!can(actor, "library.write")) throw forbidden();
  const input = bookSchema.parse(body);
  if (id) {
    const existing = await prisma.book.findFirst({ where: { id, schoolId } });
    if (!existing) throw notFound("Book not found.");
    const delta = input.quantity - existing.quantity;
    return prisma.book.update({
      where: { id },
      data: {
        title: input.title,
        author: input.author,
        isbn: clean(input.isbn),
        categoryId: clean(input.categoryId),
        quantity: input.quantity,
        available: Math.max(0, existing.available + delta),
      },
    });
  }
  return prisma.book.create({
    data: {
      schoolId,
      title: input.title,
      author: input.author,
      isbn: clean(input.isbn),
      categoryId: clean(input.categoryId),
      quantity: input.quantity,
      available: input.quantity,
    },
  });
}

export async function listCategories(schoolId: string) {
  return prisma.bookCategory.findMany({ where: { schoolId }, orderBy: { name: "asc" } });
}

export async function createCategory(actor: Actor, schoolId: string, name: string) {
  if (!can(actor, "library.write")) throw forbidden();
  return prisma.bookCategory.create({ data: { schoolId, name: name.trim() } });
}

export async function listLoans(schoolId: string) {
  await refreshOverdue(schoolId);
  const rows = await prisma.bookLoan.findMany({
    where: { schoolId },
    include: { book: true, borrower: true },
    orderBy: { issuedAt: "desc" },
    take: 100,
  });
  return rows.map((loan) => ({
    id: loan.id,
    status: loan.status,
    issuedAt: loan.issuedAt,
    dueAt: loan.dueAt,
    returnedAt: loan.returnedAt,
    book: loan.book.title,
    bookId: loan.bookId,
    borrower: fullName(loan.borrower),
    borrowerId: loan.borrowerId,
  }));
}

export async function issueBook(actor: Actor, schoolId: string, body: unknown) {
  if (!can(actor, "library.write")) throw forbidden();
  const input = loanSchema.parse(body);
  const book = await prisma.book.findFirst({ where: { id: input.bookId, schoolId } });
  if (!book) throw notFound("Book not found.");
  if (book.available < 1) throw forbidden("No copies are available.");
  const borrower = await prisma.user.findFirst({ where: { id: input.borrowerId, schoolId } });
  if (!borrower) throw notFound("Borrower not found.");
  const [loan] = await prisma.$transaction([
    prisma.bookLoan.create({
      data: { schoolId, bookId: book.id, borrowerId: borrower.id, dueAt: new Date(input.dueAt), status: "BORROWED" },
    }),
    prisma.book.update({ where: { id: book.id }, data: { available: { decrement: 1 } } }),
  ]);
  return loan;
}

export async function returnBook(actor: Actor, schoolId: string, id: string) {
  if (!can(actor, "library.write")) throw forbidden();
  const loan = await prisma.bookLoan.findFirst({ where: { id, schoolId } });
  if (!loan) throw notFound("Loan not found.");
  if (loan.returnedAt) return loan;
  const [updated] = await prisma.$transaction([
    prisma.bookLoan.update({ where: { id }, data: { returnedAt: new Date(), status: "RETURNED" } }),
    prisma.book.update({ where: { id: loan.bookId }, data: { available: { increment: 1 } } }),
  ]);
  return updated;
}
