import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async.js";
import { created, ok } from "../../lib/http.js";
import { AppError } from "../../lib/errors.js";
import { assertAllowedFile } from "../../lib/files.js";
import { authenticate, requirePermission, requireSchool } from "../../middleware/auth.js";
import { upload } from "../../middleware/upload.js";
import * as learning from "./learning.service.js";

export const learningRouter = Router();
learningRouter.use(authenticate, requireSchool);

learningRouter.get("/assignments", requirePermission("assignments.read"), asyncHandler(async (req, res) => ok(res, await learning.listAssignments(req.actor!, req.schoolId!))));
learningRouter.post("/assignments", requirePermission("assignments.write"), upload.single("file"), asyncHandler(async (req, res) => {
  if (req.file) assertAllowedFile(req.file);
  created(res, await learning.createAssignment(req.actor!, req.schoolId!, req.body, req.file));
}));
learningRouter.post("/assignments/:id/submit", requirePermission("assignments.submit"), upload.single("file"), asyncHandler(async (req, res) => {
  if (req.file) assertAllowedFile(req.file);
  created(res, await learning.submitAssignment(req.actor!, req.schoolId!, req.params.id, req.body, req.file));
}));
learningRouter.patch("/submissions/:id", requirePermission("assignments.write"), asyncHandler(async (req, res) => {
  const body = z.object({ score: z.coerce.number(), feedback: z.string().optional() }).parse(req.body);
  ok(res, await learning.gradeSubmission(req.actor!, req.params.id, body.score, body.feedback));
}));
learningRouter.get("/materials", requirePermission("materials.read"), asyncHandler(async (req, res) => ok(res, await learning.listMaterials(req.actor!, req.schoolId!, req.query as Record<string, unknown>))));
learningRouter.post("/materials", requirePermission("materials.write"), upload.single("file"), asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError(400, "FILE_REQUIRED", "Choose a file to upload.");
  assertAllowedFile(req.file);
  created(res, await learning.createMaterial(req.actor!, req.schoolId!, req.body, req.file));
}));
