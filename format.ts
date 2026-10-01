export function money(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(amount);
}

export function when(value?: string | Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

export function whenTime(value?: string | Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function applyPrimary(hex?: string | null) {
  if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return;
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  document.documentElement.style.setProperty("--primary", `${r} ${g} ${b}`);
}
