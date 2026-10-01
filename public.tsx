import { DEFAULT_BRAND } from "@edumanage/shared";
import { useQuery } from "@tanstack/react-query";
import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Calculator, GraduationCap, School, Shield, Users } from "lucide-react";
import { Button, Field, PasswordInput, controlClass } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";

type Brand = { name: string; tagline: string; description: string; stats: { students: number; teachers: number; classes: number; attendance: number } };

function BrandMark({ name }: { name: string }) {
  return (
    <span className="flex items-center gap-2 font-semibold">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-sm text-white">{name.slice(0, 1)}</span>
      {name}
    </span>
  );
}

export function Landing() {
  const brand = useQuery({ queryKey: ["brand"], queryFn: () => api<Brand>("/api/public/branding").catch(() => ({ name: DEFAULT_BRAND.name, tagline: DEFAULT_BRAND.tagline, description: DEFAULT_BRAND.description, stats: { students: 2500, teachers: 150, classes: 40, attendance: 98 } })) });
  const name = brand.data?.name ?? DEFAULT_BRAND.name;
  const stats = brand.data?.stats;
  const features = [
    ["Student management", "Admissions, profiles, guardians, and class placement in one record."],
    ["Academic management", "Years, terms, classes, streams, subjects, and timetables."],
    ["Attendance", "Daily registers with present, absent, late, and excused marks."],
    ["Fees", "Invoices, scholarships, receipts, and outstanding balances."],
    ["Exams and results", "Configurable grades, positions, and printable report cards."],
    ["Communication", "Announcements, messages, events, and notifications."],
    ["Library", "Catalogue, loans, returns, and overdue copies."],
    ["Reports", "Enrollment, attendance, finance, and academic exports."],
  ];
  return (
    <div className="min-h-screen text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <BrandMark name={name} />
        <nav className="hidden items-center gap-6 text-sm text-muted md:flex">
          <a href="#features">Features</a>
          <a href="#why">About</a>
          <a href="#contact">Contact</a>
        </nav>
        <div className="flex gap-2">
          <Link to="/login"><Button variant="ghost">Login</Button></Link>
          <Link to="/register"><Button>Get Started</Button></Link>
        </div>
      </header>
      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-2 md:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">{name}</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">{brand.data?.tagline ?? DEFAULT_BRAND.tagline}</h1>
          <p className="mt-4 max-w-xl text-lg text-muted">{brand.data?.description ?? DEFAULT_BRAND.description}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/register"><Button>Get Started</Button></Link>
            <a href="#features"><Button variant="ghost">Explore Features</Button></a>
          </div>
        </div>
        <div className="rounded-3xl border border-line bg-card p-6 shadow-card">
          <p className="text-sm text-muted">A working day at school</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[
              [`${stats?.students ?? "—"}+`, "Students"],
              [`${stats?.teachers ?? "—"}+`, "Teachers"],
              [`${stats?.classes ?? "—"}+`, "Classes"],
              [`${stats?.attendance ?? "—"}%`, "Attendance tracking"],
            ].map(([value, label]) => (
              <div key={label} className="rounded-2xl bg-canvas p-4">
                <div className="text-2xl font-semibold">{value}</div>
                <div className="text-sm text-muted">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section id="features" className="mx-auto max-w-6xl px-5 py-10">
        <h2 className="text-2xl font-semibold">What the platform covers</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(([title, text]) => (
            <article key={title} className="rounded-2xl border border-line bg-card p-4 shadow-card">
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted">{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section id="why" className="mx-auto max-w-6xl px-5 py-12">
        <h2 className="text-2xl font-semibold">Why choose {name}</h2>
        <div className="mt-6 grid gap-6 md:grid-cols-5">
          {["Centralized management", "Real-time information", "Secure data", "Easy reporting", "Mobile responsive design"].map((item) => (
            <p key={item} className="text-sm font-medium">{item}</p>
          ))}
        </div>
        <p className="mt-4 max-w-3xl text-sm text-muted">Administrators, teachers, students, parents, accountants, and librarians each see the work that belongs to them. Permissions are enforced on the server, and every school’s records stay separate.</p>
      </section>
      <footer id="contact" className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-6 px-5 py-10 text-sm md:grid-cols-4">
          <div>
            <BrandMark name={name} />
            <p className="mt-3 text-muted">office@edumanage.app</p>
          </div>
          <div className="space-y-2">
            <a className="block" href="#features">Features</a>
            <Link className="block" to="/login">Login</Link>
            <Link className="block" to="/register">Get Started</Link>
          </div>
          <div className="space-y-2">
            <Link className="block" to="/privacy">Privacy Policy</Link>
            <Link className="block" to="/terms">Terms</Link>
          </div>
          <div className="text-muted">© {new Date().getFullYear()} {name}</div>
        </div>
      </footer>
    </div>
  );
}

const LOGIN_ROLES = [
  { id: "admin", label: "Administrator", match: /admin|principal|super/i, welcome: "The whole school, held in one calm view.", detail: "Students, staff, finance, and the day ahead.", icon: Shield, wash: "from-navy via-[#1e3a8a] to-[#312e81]" },
  { id: "teacher", label: "Teachers", match: /teacher/i, welcome: "Your classes are ready for the day.", detail: "Registers, marks, assignments, and the timetable.", icon: School, wash: "from-[#1e3a8a] via-primary to-[#4338ca]" },
  { id: "student", label: "Students", match: /student/i, welcome: "Welcome back. Your work is waiting.", detail: "Timetable, grades, assignments, and announcements.", icon: GraduationCap, wash: "from-[#312e81] via-accent to-[#1e3a8a]" },
  { id: "parent", label: "Parents", match: /parent/i, welcome: "See how your children are getting on.", detail: "Attendance, results, fees, and messages from school.", icon: Users, wash: "from-[#0f3d3e] via-[#0f766e] to-[#1e3a8a]" },
  { id: "accountant", label: "Accountants", match: /accountant/i, welcome: "Balances, receipts, and what is still due.", detail: "Invoices, payments, and the financial picture.", icon: Calculator, wash: "from-[#14532d] via-success to-[#1e3a8a]" },
] as const;

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [roleId, setRoleId] = useState<(typeof LOGIN_ROLES)[number]["id"]>("admin");
  const [email, setEmail] = useState(() => localStorage.getItem("rememberedEmail") || "admin@greenfield.demo");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(() => Boolean(localStorage.getItem("rememberedEmail")));
  const [busy, setBusy] = useState(false);
  const demo = useQuery({ queryKey: ["demo"], queryFn: () => api<{ enabled: boolean; accounts: { role: string; email: string }[]; password: string | null }>("/api/public/demo-accounts") });
  const role = LOGIN_ROLES.find((item) => item.id === roleId) ?? LOGIN_ROLES[0];
  const Icon = role.icon;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await login(email, password);
      if (remember) localStorage.setItem("rememberedEmail", email);
      else localStorage.removeItem("rememberedEmail");
      navigate("/app");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }
  function choose(next: (typeof LOGIN_ROLES)[number]) {
    setRoleId(next.id);
    const account = demo.data?.accounts.find((item) => next.match.test(item.role));
    if (account && demo.data?.password) {
      setEmail(account.email);
      setPassword(demo.data.password);
    }
  }
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className={`relative hidden overflow-hidden bg-gradient-to-br ${role.wash} text-white lg:flex lg:flex-col lg:justify-between lg:p-12`}>
        <div className="pointer-events-none absolute -left-16 top-24 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute bottom-10 right-0 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <Link to="/" className="relative text-sm font-semibold tracking-wide text-white/90">EduManage</Link>
        <div key={role.id} className="panel-in relative max-w-md">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/15"><Icon size={26} /></span>
          <p className="mt-8 text-sm uppercase tracking-[0.18em] text-white/70">{role.label}</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight">{role.welcome}</h1>
          <p className="mt-4 text-base text-white/80">{role.detail}</p>
        </div>
        <p className="relative text-sm text-white/70">Smarter School Management. Better Learning.</p>
      </section>
      <section className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-md">
          <Link to="/" className="text-sm font-semibold text-primary lg:hidden">EduManage</Link>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-2 text-sm text-muted">Choose how you belong to the school, then use the account issued to you.</p>
          <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3" role="tablist" aria-label="Sign in as">
            {LOGIN_ROLES.map((item) => {
              const ItemIcon = item.icon;
              const active = item.id === role.id;
              return (
                <button key={item.id} type="button" role="tab" aria-selected={active} className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-left text-xs font-semibold transition ${active ? "border-primary bg-primary/10 text-primary" : "border-line bg-card text-muted hover:text-ink"}`} onClick={() => choose(item)}>
                  <ItemIcon size={14} /> {item.label}
                </button>
              );
            })}
          </div>
          <form className="mt-6 space-y-4" onSubmit={submit}>
            <Field label="Email"><input className={controlClass} type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
            <Field label="Password"><PasswordInput autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></Field>
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-muted"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> Remember me</label>
              <Link className="font-medium text-primary" to="/forgot-password">Forgot password</Link>
            </div>
            <Button className="w-full" disabled={busy}>{busy ? "Signing in..." : `Continue as ${role.label.toLowerCase()}`}</Button>
          </form>
          <p className="mt-5 text-sm text-muted">New school? <Link className="font-semibold text-primary" to="/register">Get started</Link></p>
          {demo.data?.enabled ? (
            <div className="mt-6 rounded-2xl border border-line bg-card p-3 text-xs text-muted">
              <p className="font-semibold text-ink">Development accounts · password {demo.data.password}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {demo.data.accounts.map((account) => (
                  <button key={account.email} className="rounded-full border border-line px-2.5 py-1 hover:border-primary hover:text-primary" onClick={() => { setEmail(account.email); setPassword(demo.data?.password || ""); const match = LOGIN_ROLES.find((item) => item.match.test(account.role)); if (match) setRoleId(match.id); }}>{account.role}</button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export function Register() {
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const result = await api<{ devVerificationUrl?: string }>("/api/auth/register-school", { method: "POST", body: JSON.stringify(Object.fromEntries(form.entries())) });
      toast.success("School created. Verify the administrator email to sign in.");
      if (result.devVerificationUrl) setLink(result.devVerificationUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create the school.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthCard title="Create your school" text="This opens a school administrator account. Teachers and students are added from inside the school.">
      <form className="grid gap-3" onSubmit={submit}>
        <Field label="School name"><input className={controlClass} name="schoolName" required /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name"><input className={controlClass} name="adminFirstName" required /></Field>
          <Field label="Last name"><input className={controlClass} name="adminLastName" required /></Field>
        </div>
        <Field label="Email"><input className={controlClass} type="email" name="email" required /></Field>
        <Field label="Phone"><input className={controlClass} name="phone" /></Field>
        <Field label="Password" hint="At least 8 characters, with upper, lower, and a number."><PasswordInput name="password" required /></Field>
        <Button disabled={busy}>{busy ? "Creating..." : "Get Started"}</Button>
      </form>
      {link ? <a className="mt-4 block text-sm text-primary" href={link}>Email is not configured. Open the verification link.</a> : null}
    </AuthCard>
  );
}

export function Forgot() {
  const [link, setLink] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = new FormData(event.currentTarget).get("email");
    const result = await api<{ devResetUrl?: string }>("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
    toast.success("If that account exists, a reset link is on its way.");
    if (result.devResetUrl) setLink(result.devResetUrl);
  }
  return (
    <AuthCard title="Reset password" text="We will email a link if the account exists.">
      <form className="space-y-4" onSubmit={submit}>
        <Field label="Email"><input className={controlClass} type="email" name="email" required /></Field>
        <Button>Send reset link</Button>
      </form>
      {link ? <a className="mt-4 block text-sm text-primary" href={link}>Development reset link</a> : null}
    </AuthCard>
  );
}

export function Reset() {
  const [params] = useSearchParams();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password") || "");
    await api("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token: params.get("token"), password }) });
    toast.success("Password updated. You can sign in.");
  }
  return (
    <AuthCard title="Choose a new password" text="This link expires after one hour.">
      <form className="space-y-4" onSubmit={submit}>
        <Field label="New password"><PasswordInput name="password" required /></Field>
        <Button>Update password</Button>
      </form>
    </AuthCard>
  );
}

export function Verify() {
  const [params] = useSearchParams();
  const [message, setMessage] = useState("Confirming your email...");
  useEffect(() => {
    api("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token: params.get("token") }) })
      .then(() => setMessage("Email verified. You can sign in."))
      .catch((error) => setMessage(error instanceof Error ? error.message : "Verification failed."));
  }, [params]);
  return <AuthCard title="Email verification" text={message}><Link to="/login"><Button>Go to login</Button></Link></AuthCard>;
}

export function Legal({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-16">
      <h1 className="text-3xl font-semibold">{title}</h1>
      <p className="mt-4 text-sm leading-6 text-muted">{title === "Privacy Policy" ? "EduManage stores school records so authorised staff, parents, and students can do their work. Passwords are hashed. Schools cannot read one another’s data. Contact the school administrator to correct a record." : "Use of EduManage is limited to the school that created the account. Do not share credentials. The school remains responsible for the accuracy of academic and financial records."}</p>
      <Link className="mt-6 inline-block text-primary" to="/">Back home</Link>
    </div>
  );
}

export function NotFound() {
  return <AuthCard title="Page not found" text="That address is not part of EduManage."><Link to="/"><Button>Home</Button></Link></AuthCard>;
}

export function Forbidden() {
  return <AuthCard title="You cannot open this" text="Your role does not include this area. If you need access, ask a school administrator."><Link to="/app"><Button>Back to dashboard</Button></Link></AuthCard>;
}

function AuthCard({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-line bg-card p-7 shadow-lift">
        <Link to="/" className="text-sm font-semibold text-primary">EduManage</Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 mb-5 text-sm leading-6 text-muted">{text}</p>
        {children}
      </div>
    </div>
  );
}
