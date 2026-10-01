import { Router } from "express";
import { REPORT_TYPES, type ReportType } from "@edumanage/shared";
import { asyncHandler } from "../../lib/async.js";
import { ok } from "../../lib/http.js";
import { AppError } from "../../lib/errors.js";
import { authenticate, requirePermission, requireSchool } from "../../middleware/auth.js";
import { upload } from "../../middleware/upload.js";
import { assertAllowedFile } from "../../lib/files.js";
import * as dashboard from "./dashboard.service.js";
import * as reports from "./reports.service.js";
import * as search from "./search.service.js";
import * as settings from "./settings.service.js";
import { resolveSchoolId } from "../../lib/access.js";

export const insightsRouter = Router();
insightsRouter.use(authenticate);

insightsRouter.get("/dashboard", asyncHandler(async (req, res) => {
  let schoolId: string | null = null;
  try {
    schoolId = resolveSchoolId(req.actor!, req.header("x-school-id"));
  } catch {
    schoolId = null;
  }
  ok(res, await dashboard.dashboard(req.actor!, schoolId));
}));

insightsRouter.get("/search", requireSchool, asyncHandler(async (req, res) => {
  ok(res, await search.search(req.actor!, req.schoolId!, String(req.query.q || "")));
}));

insightsRouter.get("/reports/:type", requireSchool, requirePermission("reports.read"), asyncHandler(async (req, res) => {
  const type = req.params.type as ReportType;
  if (!REPORT_TYPES.includes(type)) throw new AppError(404, "NOT_FOUND", "That report does not exist.");
  const format = String(req.query.format || "json");
  if (format === "xlsx") {
    const buffer = await reports.reportWorkbook(req.schoolId!, type);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${type}.xlsx"`);
    res.send(buffer);
    return;
  }
  if (format === "pdf") {
    const buffer = await reports.reportPdf(req.schoolId!, type);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${type}.pdf"`);
    res.send(buffer);
    return;
  }
  ok(res, await reports.buildReport(req.schoolId!, type));
}));

insightsRouter.get("/settings/school", requireSchool, requirePermission("settings.read", "dashboard.read"), asyncHandler(async (req, res) => {
  ok(res, await settings.getSchool(req.schoolId!));
}));
insightsRouter.put("/settings/school", requireSchool, requirePermission("settings.write"), upload.single("logo"), asyncHandler(async (req, res) => {
  if (req.file) assertAllowedFile(req.file);
  const body = req.body?.payload ? JSON.parse(String(req.body.payload)) : req.body;
  ok(res, await settings.updateSchool(req.actor!, req.schoolId!, body, req.file ? `/api/files/${req.file.filename}` : undefined));
}));
insightsRouter.put("/settings/academic", requireSchool, requirePermission("settings.write", "academics.write"), asyncHandler(async (req, res) => {
  ok(res, await settings.updateAcademicFlags(req.actor!, req.schoolId!, req.body));
}));
insightsRouter.get("/audit-logs", requireSchool, requirePermission("audit.read"), asyncHandler(async (req, res) => {
  ok(res, await settings.listAudit(req.actor!, req.schoolId!));
}));

export const publicRouter = Router();
publicRouter.get("/branding", asyncHandler(async (_req, res) => ok(res, await settings.publicBranding())));
publicRouter.get("/landing", asyncHandler(async (_req, res) => ok(res, await settings.publicBranding())));
