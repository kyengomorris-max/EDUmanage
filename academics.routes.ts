import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async.js";
import { created, ok } from "../../lib/http.js";
import { authenticate, requirePermission, requireSchool } from "../../middleware/auth.js";
import * as academics from "./academics.service.js";

export const academicsRouter = Router();
academicsRouter.use(authenticate, requireSchool);

const read = requirePermission("academics.read", "students.read", "attendance.read");
const write = requirePermission("academics.write");

academicsRouter.get("/academic-years", read, asyncHandler(async (req, res) => ok(res, await academics.listYears(req.schoolId!))));
academicsRouter.post("/academic-years", write, asyncHandler(async (req, res) => created(res, await academics.createYear(req.actor!, req.schoolId!, req.body))));
academicsRouter.get("/terms", read, asyncHandler(async (req, res) => ok(res, await academics.listTerms(req.schoolId!))));
academicsRouter.post("/terms", write, asyncHandler(async (req, res) => created(res, await academics.createTerm(req.actor!, req.schoolId!, req.body))));
academicsRouter.get("/class-levels", read, asyncHandler(async (req, res) => ok(res, await academics.listLevels(req.schoolId!))));
academicsRouter.post("/class-levels", write, asyncHandler(async (req, res) => created(res, await academics.createLevel(req.actor!, req.schoolId!, req.body))));
academicsRouter.get("/streams", read, asyncHandler(async (req, res) => ok(res, await academics.listStreams(req.schoolId!))));
academicsRouter.post("/streams", write, asyncHandler(async (req, res) => created(res, await academics.createStream(req.actor!, req.schoolId!, req.body))));
academicsRouter.get("/classes", read, asyncHandler(async (req, res) => ok(res, await academics.listClasses(req.actor!, req.schoolId!))));
academicsRouter.post("/classes", write, asyncHandler(async (req, res) => created(res, await academics.createClass(req.actor!, req.schoolId!, req.body))));
academicsRouter.patch("/classes/:id", write, asyncHandler(async (req, res) => ok(res, await academics.updateClass(req.actor!, req.schoolId!, req.params.id, req.body))));
academicsRouter.post("/classes/:id/enroll", write, asyncHandler(async (req, res) => {
  const body = z.object({ studentId: z.string().uuid() }).parse(req.body);
  created(res, await academics.enrollStudent(req.actor!, req.schoolId!, req.params.id, body.studentId));
}));
academicsRouter.get("/subjects", read, asyncHandler(async (req, res) => ok(res, await academics.listSubjects(req.schoolId!))));
academicsRouter.post("/subjects", write, asyncHandler(async (req, res) => created(res, await academics.createSubject(req.actor!, req.schoolId!, req.body))));
academicsRouter.patch("/subjects/:id", write, asyncHandler(async (req, res) => ok(res, await academics.updateSubject(req.actor!, req.schoolId!, req.params.id, req.body))));
academicsRouter.post("/subjects/:id/assign", write, asyncHandler(async (req, res) => {
  const body = z.object({ classSectionId: z.string().uuid(), teacherId: z.string().uuid().optional() }).parse(req.body);
  await academics.assignSubject(req.actor!, req.schoolId!, req.params.id, body.classSectionId, body.teacherId);
  ok(res, { assigned: true });
}));
academicsRouter.get("/timetable", read, asyncHandler(async (req, res) => ok(res, await academics.listTimetable(req.schoolId!, req.query as Record<string, unknown>))));
academicsRouter.post("/timetable", write, asyncHandler(async (req, res) => created(res, await academics.saveSlot(req.actor!, req.schoolId!, req.body))));
academicsRouter.patch("/timetable/:id", write, asyncHandler(async (req, res) => ok(res, await academics.saveSlot(req.actor!, req.schoolId!, req.body, req.params.id))));
academicsRouter.delete("/timetable/:id", write, asyncHandler(async (req, res) => {
  await academics.deleteSlot(req.actor!, req.schoolId!, req.params.id);
  ok(res, { deleted: true });
}));
