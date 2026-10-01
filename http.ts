import type { Response } from "express";

export function ok(res: Response, data: unknown, meta?: Record<string, unknown>, status = 200) {
  res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });
}

export function created(res: Response, data: unknown) {
  ok(res, data, undefined, 201);
}

export function pageMeta(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export function readPage(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
  const search = typeof query.search === "string" ? query.search.trim() : "";
  const sort = typeof query.sort === "string" ? query.sort : "";
  const dir = query.dir === "desc" ? "desc" : "asc";
  return { page, pageSize, skip: (page - 1) * pageSize, search, sort, dir: dir as "asc" | "desc" };
}
