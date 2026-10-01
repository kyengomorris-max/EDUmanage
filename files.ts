import { BLOCKED_EXTENSIONS, ALLOWED_UPLOAD_MIME } from "@edumanage/shared";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { uploadRoot } from "../config/env.js";
import { AppError } from "./errors.js";

export function ensureUploadDir() {
  fs.mkdirSync(uploadRoot, { recursive: true });
}

export function assertAllowedFile(file: Express.Multer.File) {
  const extension = path.extname(file.originalname).replace(".", "").toLowerCase();
  if (!extension || BLOCKED_EXTENSIONS.includes(extension)) {
    throw new AppError(400, "FILE_REJECTED", "This file type is not allowed.");
  }
  if (!ALLOWED_UPLOAD_MIME.includes(file.mimetype as (typeof ALLOWED_UPLOAD_MIME)[number])) {
    throw new AppError(400, "FILE_REJECTED", "Upload a PDF, image, office document, text file, or video.");
  }
  if (file.size <= 0) throw new AppError(400, "FILE_REJECTED", "The file is empty.");
  return extension;
}

export function storedFileName(original: string) {
  const extension = path.extname(original).replace(".", "").toLowerCase();
  return `${crypto.randomUUID()}.${extension}`;
}

export function absoluteUpload(storedName: string) {
  const resolved = path.resolve(uploadRoot, storedName);
  if (!resolved.startsWith(uploadRoot)) throw new AppError(400, "FILE_REJECTED", "Invalid file path.");
  return resolved;
}
