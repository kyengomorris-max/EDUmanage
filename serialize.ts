import type { Prisma } from "@prisma/client";

export function num(value: Prisma.Decimal | number | null | undefined) {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  return Number(value);
}

export function dateOnly(value?: string | null) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

export function isoDate(value: Date | null | undefined) {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

export function clean(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function fullName(person: { firstName: string; lastName: string }) {
  return `${person.firstName} ${person.lastName}`.trim();
}
