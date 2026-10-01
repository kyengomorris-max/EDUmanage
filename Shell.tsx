import { Bell, BookOpen, CalendarDays, ClipboardCheck, FileText, GraduationCap, LayoutDashboard, Library, Menu, MessageSquare, Moon, Receipt, School, Search, Settings, Shield, Sun, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, schoolHeaders } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const NAV = [
  { to: "/app", label: "Dashboard", end: true, any: ["dashboard.read"], icon: LayoutDashboard },
  { to: "/app/students", label: "Students", any: ["students.read"], icon: GraduationCap },
  { to: "/app/teachers", label: "Teachers", any: ["teachers.read"], icon: Users },
  { to: "/app/classes", label: "Classes", any: ["academics.read", "academics.write"], icon: School },
  { to: "/app/subjects", label: "Subjects", any: ["academics.read"], icon: BookOpen },
  { to: "/app/attendance", label: "Attendance", any: ["attendance.read", "attendance.write"], icon: ClipboardCheck },
  { to: "/app/exams", label: "Exams", any: ["grades.read", "grades.write", "academics.read"], icon: FileText },
  { to: "/app/report-cards", label: "Report cards", any: ["grades.read", "academics.read"], icon: FileText },
  { to: "/app/timetable", label: "Timetable", any: ["academics.read"], icon: CalendarDays },
  { to: "/app/fees", label: "Fees", any: ["fees.read"], icon: Receipt },
  { to: "/app/assignments", label: "Assignments", any: ["assignments.read"], icon: ClipboardCheck },
  { to: "/app/materials", label: "Materials", any: ["materials.read"], icon: BookOpen },
  { to: "/app/announcements", label: "Announcements", any: ["announcements.read"], icon: Bell },
  { to: "/app/messages", label: "Messages", any: ["messages.read"], icon: MessageSquare },
  { to: "/app/events", label: "Events", any: ["events.read"], icon: CalendarDays },
  { to: "/app/library", label: "Library", any: ["library.read"], icon: Library },
  { to: "/app/discipline", label: "Discipline", any: ["discipline.read"], icon: Shield },
  { to: "/app/documents", label: "Documents", any: ["documents.read"], icon: FileText },
  { to: "/app/reports", label: "Reports", any: ["reports.read"], icon: FileText },
  { to: "/app/users", label: "Users", any: ["users.read"], icon: Users },
  { to: "/app/audit", label: "Audit log", any: ["audit.read"], icon: Shield },
  { to: "/app/settings", label: "Settings", any: ["settings.read", "dashboard.read"], icon: Settings },
];

type Note = { id: string; title: string; body: string; readAt: string | null; link?: string | null };

export function Shell() {
  const { user, logout, can, schoolId, setSchoolId } = useAuth();
  const [open, setOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const location = useLocation();
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const navigate = useNavigate();
  const notes = useQuery({
    queryKey: ["notifications", schoolId],
    queryFn: () => api<Note[]>("/api/notifications", { headers: schoolHeaders(schoolId) }),
  });
  const schools = useQuery({
    queryKey: ["schools"],
    enabled: Boolean(user?.roles.includes("SUPER_ADMIN")),
    queryFn: () => api<{ id: string; name: string }[]>("/api/users/schools"),
  });
  const unread = notes.data?.filter((note) => !note.readAt).length ?? 0;

  useEffect(() => {
    const stored = localStorage.getItem("theme") || user?.themePreference || "system";
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next = stored === "dark" || (stored === "system" && systemDark);
    document.documentElement.classList.toggle("dark", next);
    setDark(next);
  }, [user?.themePreference]);

  function toggleTheme() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    setDark(next);
  }

  const items = NAV.filter((item) => item.any.some((permission) => can(permission)));

  const initials = `${user?.firstName?.[0] ?? ""}${user?.lastName?.[0] ?? ""}`.toUpperCase();
  const roleLabel = user?.roles[0]?.replaceAll("_", " ") ?? "";

  return (
    <div className="min-h-screen text-ink">
      <a className="skip" href="#content">Skip to content</a>
      {user?.school?.isDemo ? (
        <div className="bg-navy px-4 py-2 text-center text-xs text-slate-200">Development demo for {user.school.name}. Sample records can be changed here without touching a production school.</div>
      ) : null}
      <div className="flex min-h-screen">
        <aside className={`${open ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 z-30 flex w-72 flex-col bg-navy text-slate-200 shadow-lift transition duration-300 md:static md:translate-x-0`}>
          <div className="flex items-center justify-between px-5 py-6">
            <Link to="/app" className="flex items-center gap-3 font-semibold text-white">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10 text-sm">E</span>
              <span>
                <span className="block leading-none">EduManage</span>
                <span className="mt-1 block text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">{user?.school?.name || "School"}</span>
              </span>
            </Link>
            <button className="rounded-xl p-1 text-slate-300 md:hidden" aria-label="Close menu" onClick={() => setOpen(false)}><X size={18} /></button>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-8" aria-label="Primary">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition ${isActive ? "bg-white text-navy shadow-card" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}>
                  <Icon size={16} />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
        </aside>
        {open ? <button className="fixed inset-0 z-20 bg-navy/40 md:hidden" aria-label="Close menu overlay" onClick={() => setOpen(false)} /> : null}
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line/80 bg-canvas/80 px-4 py-3 backdrop-blur-xl">
            <button className="rounded-xl border border-line bg-card p-2 md:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><Menu size={18} /></button>
            <form className="relative hidden min-w-0 max-w-lg flex-1 md:block" onSubmit={(event) => { event.preventDefault(); navigate(`/app/search?q=${encodeURIComponent(query)}`); }}>
              <Search className="absolute left-3 top-3 text-muted" size={16} />
              <input aria-label="Search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search students, classes, books..." className="w-full rounded-2xl border border-line bg-card py-2.5 pl-9 pr-3 text-sm shadow-card" />
            </form>
            {user?.roles.includes("SUPER_ADMIN") ? (
              <select aria-label="School" className="rounded-2xl border border-line bg-card px-3 py-2 text-sm" value={schoolId ?? ""} onChange={(event) => setSchoolId(event.target.value)}>
                <option value="">Select school</option>
                {schools.data?.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
              </select>
            ) : null}
            <button aria-label="Toggle colour theme" className="rounded-2xl border border-line bg-card p-2.5 text-muted hover:text-ink" onClick={toggleTheme}>{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
            <div className="relative">
              <button aria-label="Notifications" className="rounded-2xl border border-line bg-card p-2.5 text-muted hover:text-ink" onClick={() => { setNotesOpen((value) => !value); setProfileOpen(false); }}>
                <Bell size={16} />
                {unread ? <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] text-white">{unread}</span> : null}
              </button>
              {notesOpen ? (
                <div className="panel-in absolute right-0 mt-2 w-80 rounded-3xl border border-line bg-card p-2 shadow-lift">
                  <div className="flex items-center justify-between px-3 py-2 text-sm font-semibold">
                    Notifications
                    <button className="text-xs text-primary" onClick={() => api("/api/notifications/read-all", { method: "POST", headers: schoolHeaders(schoolId) }).then(() => notes.refetch())}>Mark all read</button>
                  </div>
                  <div className="max-h-80 overflow-auto">
                    {notes.data?.length ? notes.data.map((note) => (
                      <button key={note.id} className={`block w-full rounded-2xl px-3 py-2 text-left text-sm hover:bg-primary/5 ${note.readAt ? "" : "bg-primary/5"}`} onClick={() => { api(`/api/notifications/${note.id}/read`, { method: "POST", headers: schoolHeaders(schoolId) }); if (note.link) navigate(note.link); setNotesOpen(false); }}>
                        <span className="font-medium">{note.title}</span>
                        <span className="mt-0.5 block text-xs text-muted">{note.body}</span>
                      </button>
                    )) : <p className="px-3 py-6 text-sm text-muted">You are all caught up.</p>}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="relative">
              <button className="flex items-center gap-2 rounded-2xl border border-line bg-card py-1.5 pl-1.5 pr-3" aria-label="Account menu" onClick={() => { setProfileOpen((value) => !value); setNotesOpen(false); }}>
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-navy text-xs font-semibold text-white">{initials}</span>
                <span className="hidden text-left text-sm sm:block">
                  <span className="block font-semibold leading-tight">{user?.firstName}</span>
                  <span className="block text-[11px] uppercase tracking-wide text-muted">{roleLabel}</span>
                </span>
              </button>
              {profileOpen ? (
                <div className="panel-in absolute right-0 mt-2 w-56 rounded-3xl border border-line bg-card p-2 shadow-lift">
                  <p className="px-3 py-2 text-sm font-semibold">{user?.firstName} {user?.lastName}</p>
                  <p className="px-3 pb-2 text-xs text-muted">{user?.email}</p>
                  <Link className="block rounded-2xl px-3 py-2 text-sm hover:bg-primary/5" to="/app/settings" onClick={() => setProfileOpen(false)}>Profile and settings</Link>
                  <button className="block w-full rounded-2xl px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10" onClick={() => logout().then(() => navigate("/login"))}>Sign out</button>
                </div>
              ) : null}
            </div>
          </header>
          <form className="border-b border-line px-4 py-3 md:hidden" onSubmit={(event) => { event.preventDefault(); navigate(`/app/search?q=${encodeURIComponent(query)}`); }}>
            <div className="relative">
              <Search className="absolute left-3 top-3 text-muted" size={16} />
              <input aria-label="Search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search students, classes, books..." className="w-full rounded-2xl border border-line bg-card py-2.5 pl-9 pr-3 text-sm" />
            </div>
          </form>
          <main id="content" key={location.pathname} className="page-in px-4 py-6 md:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
