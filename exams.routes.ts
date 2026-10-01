import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async.js";
import { created, ok } from "../../lib/http.js";
import { authenticate, requirePermission, requireSchool } from "../../middleware/auth.js";
import * as exams from "./exams.service.js";

export const examsRouter = Router();
examsRouter.use(authenticate, requireSchool);

examsRouter.get("/exam-types", requirePermission("academics.read", "grades.read"), asyncHandler(async (req, res) => ok(res, await exams.listExamTypes(req.schoolId!))));
examsRouter.post("/exam-types", requirePermission("academics.write", "grades.write"), asyncHandler(async (req, res) => {
  const body = z.object({ name: z.string().min(2) }).parse(req.body);
  created(res, await exams.createExamType(req.actor!, req.schoolId!, body.name));
}));
examsRouter.get("/exams", requirePermission("academics.read", "grades.read"), asyncHandler(async (req, res) => ok(res, await exams.listExams(req.schoolId!))));
examsRouter.post("/exams", requirePermission("academics.write", "grades.write"), asyncHandler(async (req, res) => created(res, await exams.createExam(req.actor!, req.schoolId!, req.body))));
examsRouter.post("/exams/:id/papers", requirePermission("academics.write", "grades.write"), asyncHandler(async (req, res) => created(res, await exams.addPaper(req.actor!, req.schoolId!, req.params.id, req.body))));
examsRouter.get("/exam-papers/:id", requirePermission("grades.read", "grades.write"), asyncHandler(async (req, res) => ok(res, await exams.getPaper(req.actor!, req.schoolId!, req.params.id))));
examsRouter.put("/exam-papers/:id/scores", requirePermission("grades.write"), asyncHandler(async (req, res) => ok(res, await exams.saveScores(req.actor!, req.schoolId!, req.params.id, req.body, req.ip))));
examsRouter.post("/results", requirePermission("grades.write"), asyncHandler(async (req, res) => {
  const body = z.object({ examPaperId: z.string().uuid() }).passthrough().parse(req.body);
  ok(res, await exams.saveScores(req.actor!, req.schoolId!, body.examPaperId, req.body, req.ip));
}));
examsRouter.get("/results", requirePermission("grades.read", "academics.read"), asyncHandler(async (req, res) => {
  ok(res, await exams.classResults(req.schoolId!, String(req.query.examId || ""), String(req.query.classSectionId || "")));
}));
examsRouter.get("/grade-scales", requirePermission("grades.read", "academics.read", "settings.read"), asyncHandler(async (req, res) => ok(res, await exams.gradeScale(req.schoolId!))));
examsRouter.put("/grade-scales", requirePermission("academics.write", "settings.write"), asyncHandler(async (req, res) => ok(res, await exams.saveGradeScale(req.actor!, req.schoolId!, req.body))));
examsRouter.get("/report-cards/:studentId", requirePermission("grades.read", "academics.read"), asyncHandler(async (req, res) => {
  ok(res, await exams.reportCard(req.actor!, req.schoolId!, req.params.studentId, typeof req.query.examId === "string" ? req.query.examId : undefined));
}));
examsRouter.put("/report-cards/:studentId", requirePermission("grades.write"), asyncHandler(async (req, res) => ok(res, await exams.saveRemarks(req.actor!, req.schoolId!, req.params.studentId, req.body))));
examsRouter.get("/report-cards/:studentId/pdf", requirePermission("grades.read", "academics.read"), asyncHandler(async (req, res) => {
  const file = await exams.reportPdf(req.actor!, req.schoolId!, req.params.studentId, typeof req.query.examId === "string" ? req.query.examId : undefined);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
  res.send(file.buffer);
}));
