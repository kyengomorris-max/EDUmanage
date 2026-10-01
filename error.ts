import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { env } from "../config/env.js";

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: "That page or record does not exist." },
  });
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    res.status(422).json({
      success: false,
      error: {
        code: "VALIDATION",
        message: "Some required information is missing or invalid.",
        details: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.status).json({
      success: false,
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      res.status(409).json({
        success: false,
        error: { code: "CONFLICT", message: "A record with those details already exists." },
      });
      return;
    }
    if (error.code === "P2025") {
      res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "We could not find that record." },
      });
      return;
    }
  }

  logger.error({ err: error }, "Unhandled error");
  res.status(500).json({
    success: false,
    error: {
      code: "SERVER_ERROR",
      message: "Something went wrong. Please try again.",
      ...(env.NODE_ENV === "development" ? { detail: error instanceof Error ? error.message : "Unknown error" } : {}),
    },
  });
}
