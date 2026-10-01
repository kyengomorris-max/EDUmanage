import { Router } from "express";
import { asyncHandler } from "../../lib/async.js";
import { created, ok } from "../../lib/http.js";
import { assertAllowedFile } from "../../lib/files.js";
import { authenticate, requirePermission, requireSchool } from "../../middleware/auth.js";
import { upload } from "../../middleware/upload.js";
import * as comms from "./comms.service.js";

export const commsRouter = Router();
commsRouter.use(authenticate, requireSchool);

commsRouter.get("/announcements", requirePermission("announcements.read"), asyncHandler(async (req, res) => ok(res, await comms.listAnnouncements(req.actor!, req.schoolId!))));
commsRouter.post("/announcements", requirePermission("announcements.write"), upload.single("file"), asyncHandler(async (req, res) => {
  if (req.file) assertAllowedFile(req.file);
  created(res, await comms.createAnnouncement(req.actor!, req.schoolId!, req.body, req.file));
}));
commsRouter.get("/notifications", asyncHandler(async (req, res) => ok(res, await comms.listNotifications(req.actor!))));
commsRouter.post("/notifications/read-all", asyncHandler(async (req, res) => {
  await comms.markAllNotifications(req.actor!);
  ok(res, { read: true });
}));
commsRouter.post("/notifications/:id/read", asyncHandler(async (req, res) => {
  await comms.markNotification(req.actor!, req.params.id);
  ok(res, { read: true });
}));
commsRouter.get("/messages/recipients", requirePermission("messages.write"), asyncHandler(async (req, res) => {
  ok(res, await comms.listRecipients(req.actor!, req.schoolId!));
}));
commsRouter.get("/messages", requirePermission("messages.read"), asyncHandler(async (req, res) => {
  ok(res, await comms.listMessages(req.actor!, req.schoolId!, String(req.query.box || "inbox"), String(req.query.search || "")));
}));
commsRouter.post("/messages", requirePermission("messages.write"), asyncHandler(async (req, res) => created(res, await comms.sendMessage(req.actor!, req.schoolId!, req.body))));
commsRouter.post("/messages/:id/read", requirePermission("messages.read"), asyncHandler(async (req, res) => {
  await comms.markMessage(req.actor!, req.params.id);
  ok(res, { read: true });
}));
commsRouter.post("/messages/:id/reply", requirePermission("messages.write"), asyncHandler(async (req, res) => {
  created(res, await comms.sendMessage(req.actor!, req.schoolId!, { ...req.body, parentId: req.params.id }));
}));
commsRouter.get("/events", requirePermission("events.read"), asyncHandler(async (req, res) => ok(res, await comms.listEvents(req.schoolId!))));
commsRouter.post("/events", requirePermission("events.write"), asyncHandler(async (req, res) => created(res, await comms.createEvent(req.actor!, req.schoolId!, req.body))));
commsRouter.patch("/events/:id", requirePermission("events.write"), asyncHandler(async (req, res) => ok(res, await comms.updateEvent(req.actor!, req.schoolId!, req.params.id, req.body))));
commsRouter.delete("/events/:id", requirePermission("events.write"), asyncHandler(async (req, res) => {
  await comms.deleteEvent(req.actor!, req.schoolId!, req.params.id);
  ok(res, { deleted: true });
}));
