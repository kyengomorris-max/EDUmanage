import multer from "multer";
import { env, uploadRoot } from "../config/env.js";
import { ensureUploadDir, storedFileName } from "../lib/files.js";

ensureUploadDir();

export const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureUploadDir();
      cb(null, uploadRoot);
    },
    filename: (_req, file, cb) => cb(null, storedFileName(file.originalname)),
  }),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 5 },
});
