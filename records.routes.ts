import { Router } from "express";
import fs from "node:fs";
import { asyncHandler } from "../../lib/async.js";
import { created, ok } from "../../lib/http.js";
import { absoluteUpload, assertAllowedFile } from "../../lib/files.js";
import { authenticate, requirePermission, requireSchool } from "../../middleware/auth.js";
import { upload } from "../../middleware/upload.js";
import * as records from "./records.service.js";

export const recordsRouter = Router();
recordsRouter.use(authenticate, requireSchool);

recordsRouter.get("/discipline", requirePermission("discipline.read"), asyncHandler(async (req, res) => ok(res, await records.listDiscipline(req.actor!, req.schoolId!))));
recordsRouter.post("/discipline", requirePermission("discipline.write"), asyncHandler(async (req, res) => created(res, await records.saveDiscipline(req.actor!, req.schoolId!, req.body))));
recordsRouter.patch("/discipline/:id", requirePermission("discipline.write"), asyncHandler(async (req, res) => ok(res, await records.saveDiscipline(req.actor!, req.schoolId!, req.body, req.params.id))));
recordsRouter.get("/documents", requirePermission("documents.read"), asyncHandler(async (req, res) => ok(res, await records.listDocuments(req.actor!, req.schoolId!, req.query as Record<string, unknown>))));
recordsRouter.post("/documents", requirePermission("documents.write"), upload.single("file"), asyncHandler(async (req, res) => {
  if (!req.file) throw new Error("Choose a file");
  assertAllowedFile(req.file);
  created(res, await records.createDocument(req.actor!, req.schoolId!, req.body, req.file, req.ip));
}));
recordsRouter.get("/files/:name", asyncHandler(async (req, res) => {
  const storedName = await records.getStoredFile(req.actor!, req.schoolId!, req.params.name);
  const filePath = absoluteUpload(storedName);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "The file is no longer on disk." } });
    return;
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", "attachment");
  res.sendFile(filePath);
}));
