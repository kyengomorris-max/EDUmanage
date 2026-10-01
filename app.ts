import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { academicsRouter } from "./modules/academics/academics.routes.js";
import { attendanceRouter } from "./modules/attendance/attendance.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { demoAccounts } from "./modules/auth/auth.service.js";
import { commsRouter } from "./modules/comms/comms.routes.js";
import { examsRouter } from "./modules/exams/exams.routes.js";
import { feesRouter } from "./modules/fees/fees.routes.js";
import { insightsRouter, publicRouter } from "./modules/insights/insights.routes.js";
import { learningRouter } from "./modules/learning/learning.routes.js";
import { libraryRouter } from "./modules/library/library.routes.js";
import { recordsRouter } from "./modules/records/records.routes.js";
import { studentsRouter } from "./modules/students/students.routes.js";
import { teachersRouter } from "./modules/teachers/teachers.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
      },
    },
  }));
  app.use(cors({ origin: env.CORS_ORIGIN.split(",").map((value) => value.trim()), credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));
  app.use((req, _res, next) => {
    logger.info({ method: req.method, url: req.url });
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({ success: true, data: { status: "ok", name: "EduManage" } });
  });
  app.use("/api/auth", authRouter);
  app.use("/api/public", publicRouter);
  app.get("/api/public/demo-accounts", async (_req, res) => {
    const accounts = await demoAccounts();
    res.json({ success: true, data: { enabled: accounts.length > 0, accounts, password: accounts.length ? "Demo@12345" : null } });
  });
  app.use("/api/students", studentsRouter);
  app.use("/api/teachers", teachersRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/attendance", attendanceRouter);
  app.use("/api/fees", feesRouter);
  app.use("/api/library", libraryRouter);
  app.use("/api", insightsRouter);
  app.use("/api", academicsRouter);
  app.use("/api", examsRouter);
  app.use("/api", learningRouter);
  app.use("/api", commsRouter);
  app.use("/api", recordsRouter);

  if (env.NODE_ENV === "production") {
    const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../frontend/dist");
    app.use(express.static(dist));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      res.sendFile(path.join(dist, "index.html"));
    });
  }

  app.use("/api", notFoundHandler);
  app.use(errorHandler);
  return app;
}
