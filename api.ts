export type ApiError = { code: string; message: string; details?: { path: string; message: string }[] };

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

async function refresh() {
  const response = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
  if (!response.ok) return false;
  const body = await response.json();
  accessToken = body.data.accessToken;
  return true;
}

export type PageMeta = { page: number; pageSize: number; total: number; pages: number };

export async function apiResult<T>(path: string, options: RequestInit = {}, retry = true): Promise<{ data: T; meta?: PageMeta }> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && !headers.has("Content-Type") && options.body) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(path, { ...options, headers, credentials: "include" });
  if (response.status === 401 && retry && !path.startsWith("/api/auth/login") && !path.startsWith("/api/auth/refresh")) {
    refreshing ??= refresh().finally(() => { refreshing = null; });
    if (await refreshing) return apiResult<T>(path, options, false);
  }
  if (response.status === 204) return { data: undefined as T };
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = (body.error || { code: "REQUEST_FAILED", message: "The request could not be completed." }) as ApiError;
    throw Object.assign(new Error(error.message), error);
  }
  return { data: body.data as T, meta: body.meta as PageMeta | undefined };
}

export async function api<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  return (await apiResult<T>(path, options, retry)).data;
}

export function schoolHeaders(schoolId?: string | null) {
  return schoolId ? { "x-school-id": schoolId } : undefined;
}
