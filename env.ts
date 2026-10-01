import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, "../../../.env") });
loadEnv({ path: path.resolve(here, "../../.env") });

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  REFRESH_TOKEN_SECRET: z.string().min(16),
  EMAIL_HOST: z.string().optional().default(""),
  EMAIL_PORT: z.coerce.number().default(587),
  EMAIL_USER: z.string().optional().default(""),
  EMAIL_PASSWORD: z.string().optional().default(""),
  EMAIL_FROM: z.string().default("EduManage <noreply@localhost>"),
  STORAGE_URL: z.string().default("http://localhost:4000/api/files"),
  APP_URL: z.string().default("http://localhost:5173"),
  API_PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DEMO_MODE: z
    .string()
    .optional()
    .transform((value) => value !== "false"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  UPLOAD_DIR: z.string().default("uploads"),
  MAX_UPLOAD_MB: z.coerce.number().default(25),
  ANALYTICS_URL: z.string().optional().default(""),
});

export const env = schema.parse({
  ...process.env,
  API_PORT: process.env.API_PORT || process.env.PORT,
  JWT_SECRET: process.env.JWT_SECRET || (process.env.NODE_ENV === "production" ? undefined : "dev-only-jwt-secret-change"),
  REFRESH_TOKEN_SECRET:
    process.env.REFRESH_TOKEN_SECRET ||
    (process.env.NODE_ENV === "production" ? undefined : "dev-only-refresh-secret-change"),
});

export const uploadRoot = path.resolve(here, "../../", env.UPLOAD_DIR);
