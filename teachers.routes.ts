import { Router } from "express";
import { asyncHandler } from "../../lib/async.js";
import { created, ok, pageMeta } from "../../lib/http.js";
import { authenticate, requirePermission, requireSchool } from "../../middleware/auth.js";
import * as teachers from "./teachers.service.js";

export const teachersRouter = Router();
teachersRouter.use(authenticate, requireSchool);
teachersRouter.get("/", requirePermission("teachers.read", "academics.read"), asyncHandler(async (req, res) => {
  const result = await teachers.listTeachers(req.actor!, req.schoolId!, req.query as Record<string, unknown>);
  ok(res, result.rows, pageMeta(result.page.page, result.page.pageSize, result.total));
}));
teachersRouter.post("/", requirePermission("teachers.write"), asyncHandler(async (req, res) => {
  created(res, await teachers.createTeacher(req.actor!, req.schoolId!, req.body, req.ip));
}));
teachersRouter.get("/:id", requirePermission("teachers.read", "academics.read"), asyncHandler(async (req, res) => {
  ok(res, await teachers.getTeacher(req.actor!, req.schoolId!, req.params.id));
}));
teachersRouter.patch("/:id", requirePermission("teachers.write"), asyncHandler(async (req, res) => {
  ok(res, await teachers.updateTeacher(req.actor!, req.schoolId!, req.params.id, req.body, req.ip));
}));
teachersRouter.get("/:id/timetable", requirePermission("teachers.read", "academics.read"), asyncHandler(async (req, res) => {
  ok(res, await teachers.teacherTimetable(req.schoolId!, req.params.id));
}));
