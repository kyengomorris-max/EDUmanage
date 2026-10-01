import { Router } from "express";
import rateLimit from "express-rate-limit";
import { asyncHandler } from "../../lib/async.js";
import { created, ok } from "../../lib/http.js";
import { authenticate } from "../../middleware/auth.js";
import * as auth from "./auth.service.js";

const limit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: "RATE_LIMITED", message: "Too many attempts. Wait a few minutes and try again." } },
});

export const authRouter = Router();

authRouter.post("/login", limit, asyncHandler(async (req, res) => ok(res, await auth.login(req, res))));
authRouter.post("/refresh", asyncHandler(async (req, res) => ok(res, await auth.refresh(req, res))));
authRouter.post("/logout", authenticate, asyncHandler(async (req, res) => {
  await auth.logout(req, res);
  ok(res, { signedOut: true });
}));
authRouter.post("/forgot-password", limit, asyncHandler(async (req, res) => ok(res, await auth.forgotPassword(req))));
authRouter.post("/reset-password", limit, asyncHandler(async (req, res) => {
  await auth.resetPassword(req);
  ok(res, { reset: true });
}));
authRouter.post("/verify-email", asyncHandler(async (req, res) => {
  await auth.verifyEmail(req);
  ok(res, { verified: true });
}));
authRouter.post("/resend-verification", limit, asyncHandler(async (req, res) => ok(res, await auth.resendVerification(req))));
authRouter.post("/register-school", limit, asyncHandler(async (req, res) => created(res, await auth.registerSchool(req))));
authRouter.get("/me", authenticate, asyncHandler(async (req, res) => ok(res, await auth.me(req))));
authRouter.patch("/me", authenticate, asyncHandler(async (req, res) => ok(res, await auth.updateMe(req))));
authRouter.post("/change-password", authenticate, asyncHandler(async (req, res) => {
  await auth.changePassword(req);
  ok(res, { changed: true });
}));
authRouter.get("/sessions", authenticate, asyncHandler(async (req, res) => ok(res, await auth.sessions(req))));
authRouter.delete("/sessions/:id", authenticate, asyncHandler(async (req, res) => {
  await auth.revokeSession(req);
  ok(res, { revoked: true });
}));
