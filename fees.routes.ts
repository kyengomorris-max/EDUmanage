import { Router } from "express";
import { asyncHandler } from "../../lib/async.js";
import { created, ok, pageMeta } from "../../lib/http.js";
import { authenticate, requirePermission, requireSchool } from "../../middleware/auth.js";
import * as fees from "./fees.service.js";

export const feesRouter = Router();
feesRouter.use(authenticate, requireSchool);
feesRouter.get("/summary", requirePermission("fees.read"), asyncHandler(async (req, res) => ok(res, await fees.feeSummary(req.schoolId!))));
feesRouter.get("/structures", requirePermission("fees.read"), asyncHandler(async (req, res) => ok(res, await fees.listStructures(req.schoolId!))));
feesRouter.post("/structures", requirePermission("fees.write"), asyncHandler(async (req, res) => created(res, await fees.createStructure(req.actor!, req.schoolId!, req.body))));
feesRouter.post("/invoices/generate", requirePermission("fees.write"), asyncHandler(async (req, res) => ok(res, await fees.generateInvoices(req.actor!, req.schoolId!, req.body))));
feesRouter.get("/invoices", requirePermission("fees.read"), asyncHandler(async (req, res) => {
  const result = await fees.listInvoices(req.actor!, req.schoolId!, req.query as Record<string, unknown>);
  ok(res, result.rows, pageMeta(result.page.page, result.page.pageSize, result.total));
}));
feesRouter.get("/payments", requirePermission("fees.read"), asyncHandler(async (req, res) => ok(res, await fees.listPayments(req.actor!, req.schoolId!))));
feesRouter.post("/payments", requirePermission("payments.write"), asyncHandler(async (req, res) => created(res, await fees.recordPayment(req.actor!, req.schoolId!, req.body, req.ip))));
feesRouter.get("/payments/:id/receipt", requirePermission("fees.read"), asyncHandler(async (req, res) => {
  const file = await fees.receiptPdf(req.actor!, req.schoolId!, req.params.id);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${file.filename}"`);
  res.send(file.buffer);
}));
feesRouter.get("/scholarships", requirePermission("fees.read"), asyncHandler(async (req, res) => ok(res, await fees.listScholarships(req.schoolId!))));
feesRouter.post("/scholarships", requirePermission("fees.write"), asyncHandler(async (req, res) => created(res, await fees.createScholarship(req.actor!, req.schoolId!, req.body))));
