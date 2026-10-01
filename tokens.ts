import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export function signAccessToken(userId: string) {
  return jwt.sign({ sub: userId, typ: "access" }, env.JWT_SECRET, { expiresIn: "15m" });
}

export function verifyAccessToken(token: string) {
  const payload = jwt.verify(token, env.JWT_SECRET);
  if (typeof payload === "string" || payload.typ !== "access" || typeof payload.sub !== "string") {
    throw new Error("Invalid access token");
  }
  return payload.sub;
}

export function randomToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function temporaryPassword() {
  return `Tmp${crypto.randomBytes(4).toString("hex")}A1`;
}
