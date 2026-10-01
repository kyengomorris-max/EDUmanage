import { clsx } from "clsx";
import { Eye, EyeOff, X } from "lucide-react";
import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";

export function Button({ className, variant = "primary", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "soft" }) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition duration-200 disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" && "bg-primary text-white shadow-card hover:-translate-y-0.5 hover:shadow-lift",
        variant === "ghost" && "border border-line bg-card text-ink hover:border-primary/30 hover:bg-primary/5",
        variant === "soft" && "bg-primary/10 text-primary hover:bg-primary/15",
        variant === "danger" && "bg-red-600 text-white hover:bg-red-700",
        className,
      )}
      {...props}
    />
  );
}

export function Field({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium text-ink">{label}</span>
      {children}
      {hint && !error ? <span className="block text-xs text-muted">{hint}</span> : null}
      {error ? <span className="block text-xs text-red-600">{error}</span> : null}
    </label>
  );
}

export const controlClass = "w-full rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted/70 focus:border-primary/50 focus:ring-4 focus:ring-primary/10";

export function PasswordInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={visible ? "text" : "password"} className={clsx(controlClass, "pr-11", className)} />
      <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink" aria-label={visible ? "Hide password" : "Show password"} onClick={() => setVisible((value) => !value)}>
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "green" | "amber" | "red" | "blue" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200",
    green: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
    amber: "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200",
    red: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-200",
    blue: "bg-primary/10 text-primary",
  };
  return <span className={clsx("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone])}>{children}</span>;
}

export function statusTone(status: string) {
  if (["PAID", "PRESENT", "ACTIVE", "RESOLVED", "RETURNED", "GRADED"].includes(status)) return "green" as const;
  if (["PARTIAL", "LATE", "PENDING", "OPEN", "BORROWED", "SUBMITTED"].includes(status)) return "amber" as const;
  if (["OVERDUE", "ABSENT", "INACTIVE", "LOST"].includes(status)) return "red" as const;
  return "slate" as const;
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-navy/50 p-4 backdrop-blur-sm sm:items-center" role="presentation" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="panel-in max-h-[90vh] w-full max-w-2xl overflow-auto rounded-3xl border border-line bg-card p-6 shadow-lift" onMouseDown={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <button aria-label="Close" className="rounded-xl p-1.5 text-muted hover:bg-primary/5 hover:text-ink" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-line bg-card/80 px-6 py-14 text-center">
      <div className="mx-auto mb-3 h-10 w-10 rounded-2xl bg-primary/10" />
      <p className="font-medium">{title}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function PageHeader({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {text ? <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">{text}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Skeleton() {
  return <div className="h-28 animate-pulse rounded-3xl bg-slate-200/70 dark:bg-white/5" />;
}
