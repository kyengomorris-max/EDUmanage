export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function notFound(message = "We could not find that record.") {
  return new AppError(404, "NOT_FOUND", message);
}

export function forbidden(message = "You do not have permission to do that.") {
  return new AppError(403, "FORBIDDEN", message);
}

export function badRequest(message: string) {
  return new AppError(400, "BAD_REQUEST", message);
}
