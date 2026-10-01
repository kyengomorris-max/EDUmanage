import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

export async function sendMail(input: { to: string; subject: string; text: string; html?: string }) {
  if (!env.EMAIL_HOST) {
    logger.info({ to: input.to, subject: input.subject, text: input.text }, "Email delivery is not configured");
    return { delivered: false as const };
  }
  const transport = nodemailer.createTransport({
    host: env.EMAIL_HOST,
    port: env.EMAIL_PORT,
    secure: env.EMAIL_PORT === 465,
    auth: env.EMAIL_USER ? { user: env.EMAIL_USER, pass: env.EMAIL_PASSWORD } : undefined,
  });
  await transport.sendMail({
    from: env.EMAIL_FROM,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
  return { delivered: true as const };
}
