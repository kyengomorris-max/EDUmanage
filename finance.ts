export type InvoiceState = "PENDING" | "PARTIAL" | "PAID" | "OVERDUE" | "CANCELLED";

export function invoiceBalance(total: number, discount: number, paid: number) {
  const due = Math.max(0, roundMoney(total - discount));
  const collected = roundMoney(paid);
  return {
    due,
    paid: collected,
    balance: roundMoney(Math.max(0, due - collected)),
  };
}

export function deriveInvoiceStatus(input: {
  total: number;
  discount: number;
  paid: number;
  dueDate: string | Date;
  now?: Date;
  cancelled?: boolean;
}): InvoiceState {
  if (input.cancelled) return "CANCELLED";
  const { due, paid } = invoiceBalance(input.total, input.discount, input.paid);
  const dueDate = new Date(input.dueDate);
  const now = input.now ?? new Date();
  const overdue = stripTime(dueDate) < stripTime(now);
  if (due <= 0 || paid >= due) return "PAID";
  if (paid > 0) return overdue ? "OVERDUE" : "PARTIAL";
  return overdue ? "OVERDUE" : "PENDING";
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function stripTime(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function scholarshipValue(subtotal: number, amount: number, percent: number) {
  const fromPercent = roundMoney(subtotal * (percent / 100));
  return roundMoney(Math.min(subtotal, amount + fromPercent));
}
