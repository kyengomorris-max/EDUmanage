import { Router } from "express";
import { asyncHandler } from "../../lib/async.js";
import { created, ok, pageMeta } from "../../lib/http.js";
import { authenticate, requirePermission, requireSchool } from "../../middleware/auth.js";
import * as students from "./students.service.js";

export const studentsRouter = Router();
studentsRouter.use(authenticate, requireSchool);

studentsRouter.get("/", requirePermission("students.read", "attendance.read"), asyncHandler(async (req, res) => {
  const result = await students.listStudents(req.actor!, req.schoolId!, req.query as Record<string, unknown>);
  ok(res, result.rows, pageMeta(result.page.page, result.page.pageSize, result.total));
}));

studentsRouter.post("/", requirePermission("students.write"), asyncHandler(async (req, res) => {
  created(res, await students.createStudent(req.actor!, req.schoolId!, req.body, req.ip));
}));

studentsRouter.get("/:id", requirePermission("students.read", "attendance.read", "grades.read", "fees.read"), asyncHandler(async (req, res) => {
  ok(res, await students.getStudent(req.actor!, req.schoolId!, req.params.id));
}));

studentsRouter.patch("/:id", requirePermission("students.write"), asyncHandler(async (req, res) => {
  ok(res, await students.updateStudent(req.actor!, req.schoolId!, req.params.id, req.body, req.ip));
}));

studentsRouter.delete("/:id", requirePermission("students.write"), asyncHandler(async (req, res) => {
  await students.deactivateStudent(req.actor!, req.schoolId!, req.params.id, req.ip);
  ok(res, { deactivated: true });
}));

studentsRouter.get("/:id/attendance", requirePermission("attendance.read"), asyncHandler(async (req, res) => {
  ok(res, await students.studentAttendance(req.actor!, req.schoolId!, req.params.id));
}));
studentsRouter.get("/:id/academics", requirePermission("grades.read", "academics.read"), asyncHandler(async (req, res) => {
  ok(res, await students.studentAcademics(req.actor!, req.schoolId!, req.params.id));
}));
studentsRouter.get("/:id/fees", requirePermission("fees.read"), asyncHandler(async (req, res) => {
  ok(res, await students.studentFees(req.actor!, req.schoolId!, req.params.id));
}));
studentsRouter.get("/:id/assignments", requirePermission("assignments.read"), asyncHandler(async (req, res) => {
  ok(res, await students.studentAssignments(req.actor!, req.schoolId!, req.params.id));
}));
studentsRouter.get("/:id/documents", requirePermission("documents.read"), asyncHandler(async (req, res) => {
  ok(res, await students.studentDocuments(req.actor!, req.schoolId!, req.params.id));
}));
studentsRouter.get("/:id/discipline", requirePermission("discipline.read"), asyncHandler(async (req, res) => {
  ok(res, await students.studentDiscipline(req.actor!, req.schoolId!, req.params.id));
}));
