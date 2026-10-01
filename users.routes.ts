import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async.js";
import { created, ok, pageMeta } from "../../lib/http.js";
import { authenticate, requirePermission, requireSchool } from "../../middleware/auth.js";
import * as users from "./users.service.js";

export const usersRouter = Router();
usersRouter.use(authenticate);

usersRouter.get("/schools", asyncHandler(async (req, res) => ok(res, await users.listSchools(req.actor!))));
usersRouter.post("/schools", asyncHandler(async (req, res) => created(res, await users.createSchool(req.actor!, req.body, req.ip))));

usersRouter.get("/", requireSchool, requirePermission("users.read"), asyncHandler(async (req, res) => {
  const result = await users.listUsers(req.schoolId!, req.query as Record<string, unknown>);
  ok(res, result.rows, pageMeta(result.page.page, result.page.pageSize, result.total));
}));
usersRouter.post("/", requireSchool, requirePermission("users.write"), asyncHandler(async (req, res) => {
  created(res, await users.createUser(req.actor!, req.schoolId!, req.body, req.ip));
}));
usersRouter.patch("/:id/status", requireSchool, requirePermission("users.write"), asyncHandler(async (req, res) => {
  const body = z.object({ status: z.enum(["ACTIVE", "INACTIVE"]) }).parse(req.body);
  await users.updateUserStatus(req.actor!, req.schoolId!, req.params.id, body.status, req.ip);
  ok(res, { updated: true });
}));
usersRouter.put("/:id/roles", requireSchool, requirePermission("users.write"), asyncHandler(async (req, res) => {
  const body = z.object({ roles: z.array(z.string()).min(1) }).parse(req.body);
  await users.setUserRoles(req.actor!, req.schoolId!, req.params.id, body.roles, req.ip);
  ok(res, { updated: true });
}));
