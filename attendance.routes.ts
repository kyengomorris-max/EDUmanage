import { Router } from "express";
import { asyncHandler } from "../../lib/async.js";
import { ok } from "../../lib/http.js";
import { authenticate, requirePermission, requireSchool } from "../../middleware/auth.js";
import * as attendance from "./attendance.service.js";

export const attendanceRouter = Router();
attendanceRouter.use(authenticate, requireSchool);
attendanceRouter.get("/summary", requirePermission("attendance.read"), asyncHandler(async (req, res) => {
  ok(res, await attendance.summary(req.actor!, req.schoolId!));
}));
attendanceRouter.get("/", requirePermission("attendance.read", "attendance.write"), asyncHandler(async (req, res) => {
  const classSectionId = String(req.query.classSectionId || "");
  const date = String(req.query.date || new Date().toISOString().slice(0, 10));
  ok(res, await attendance.roster(req.actor!, req.schoolId!, classSectionId, date));
}));
attendanceRouter.post("/", requirePermission("attendance.write"), asyncHandler(async (req, res) => {
  ok(res, await attendance.markAttendance(req.actor!, req.schoolId!, req.body));
}));
