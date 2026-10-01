import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async.js";
import { created, ok } from "../../lib/http.js";
import { authenticate, requirePermission, requireSchool } from "../../middleware/auth.js";
import * as library from "./library.service.js";

export const libraryRouter = Router();
libraryRouter.use(authenticate, requireSchool);
libraryRouter.get("/summary", requirePermission("library.read"), asyncHandler(async (req, res) => ok(res, await library.librarySummary(req.schoolId!))));
libraryRouter.get("/books", requirePermission("library.read"), asyncHandler(async (req, res) => ok(res, await library.listBooks(req.schoolId!, String(req.query.search || "")))));
libraryRouter.post("/books", requirePermission("library.write"), asyncHandler(async (req, res) => created(res, await library.saveBook(req.actor!, req.schoolId!, req.body))));
libraryRouter.patch("/books/:id", requirePermission("library.write"), asyncHandler(async (req, res) => ok(res, await library.saveBook(req.actor!, req.schoolId!, req.body, req.params.id))));
libraryRouter.get("/book-categories", requirePermission("library.read"), asyncHandler(async (req, res) => ok(res, await library.listCategories(req.schoolId!))));
libraryRouter.post("/book-categories", requirePermission("library.write"), asyncHandler(async (req, res) => {
  const body = z.object({ name: z.string().min(2) }).parse(req.body);
  created(res, await library.createCategory(req.actor!, req.schoolId!, body.name));
}));
libraryRouter.get("/loans", requirePermission("library.read"), asyncHandler(async (req, res) => ok(res, await library.listLoans(req.schoolId!))));
libraryRouter.post("/loans", requirePermission("library.write"), asyncHandler(async (req, res) => created(res, await library.issueBook(req.actor!, req.schoolId!, req.body))));
libraryRouter.post("/loans/:id/return", requirePermission("library.write"), asyncHandler(async (req, res) => ok(res, await library.returnBook(req.actor!, req.schoolId!, req.params.id))));
