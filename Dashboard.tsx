import { type ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, schoolHeaders } from "../lib/api";
import { money } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import { Empty, Skeleton } from "../components/ui";

type Dash = {
  role: string;
  cards: { label: string; value: string | number; href: string }[];
  charts: {
    enrollment?: { name: string; value: number }[];
    attendance?: { date: string; rate: number }[];
    fees?: { name: string; value: number }[];
    distribution?: { name: string; value: number }[];
    performance?: { name: string; value: number }[];
  };
  lists: Record<string, unknown[]>;
};

export function Dashboard() {
  const { schoolId, user } = useAuth();
  const query = useQuery({
    queryKey: ["dashboard", schoolId],
    queryFn: () => api<Dash>("/api/dashboard", { headers: schoolHeaders(schoolId) }),
  });
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  if (query.isLoading) return <div className="grid gap-4 md:grid-cols-3">{[1, 2, 3].map((item) => <Skeleton key={item} />)}</div>;
  if (!query.data) return <Empty title="The dashboard could not be loaded." />;
  const data = query.data;
  const roleName = data.role.replaceAll("_", " ").toLowerCase();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-primary">{greeting}, {user?.firstName}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted">What needs attention in your {roleName} view.</p>
        </div>
      </div>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data.cards.map((card, index) => (
          <a key={card.label} href={card.href} className="group rounded-3xl border border-line bg-card p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-lift">
            <div className="flex items-center justify-between text-sm text-muted">
              {card.label}
              <span className={`h-2 w-2 rounded-full ${index % 3 === 0 ? "bg-primary" : index % 3 === 1 ? "bg-accent" : "bg-success"}`} />
            </div>
            <div className="mt-3 text-3xl font-semibold tracking-tight">{typeof card.value === "number" && card.label.toLowerCase().includes("fee") || card.label === "Outstanding" || card.label === "Billed" || card.label === "Collected" ? money(Number(card.value)) : card.value}</div>
          </a>
        ))}
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        {data.charts.enrollment?.length ? <ChartCard title="Student enrollment"><BarChart data={data.charts.enrollment}><CartesianGrid stroke="rgb(221 227 239)" vertical={false} /><XAxis dataKey="name" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} /><Tooltip /><Bar dataKey="value" fill="#1e40af" radius={[8, 8, 0, 0]} /></BarChart></ChartCard> : null}
        {data.charts.attendance?.length ? <ChartCard title="Attendance trend"><BarChart data={data.charts.attendance}><CartesianGrid stroke="rgb(221 227 239)" vertical={false} /><XAxis dataKey="date" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} /><Tooltip /><Bar dataKey="rate" fill="#15803d" radius={[8, 8, 0, 0]} /></BarChart></ChartCard> : null}
        {data.charts.fees?.length ? <ChartCard title="Fee collection"><PieChart><Pie data={data.charts.fees} dataKey="value" nameKey="name" innerRadius={52} outerRadius={84} paddingAngle={3}>{data.charts.fees.map((entry) => <Cell key={entry.name} fill={entry.name === "Collected" || entry.name === "PAID" ? "#15803d" : "#d97706"} />)}</Pie><Tooltip /></PieChart></ChartCard> : null}
        {data.charts.distribution?.length ? <ChartCard title="Student distribution"><PieChart><Pie data={data.charts.distribution} dataKey="value" nameKey="name" innerRadius={52} outerRadius={84} paddingAngle={3}><Cell fill="#1e40af" /><Cell fill="#6d5bd0" /><Cell fill="#15803d" /></Pie><Tooltip /></PieChart></ChartCard> : null}
        {data.charts.performance?.length ? <ChartCard title="Recent subject percentages"><BarChart data={data.charts.performance}><XAxis dataKey="name" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} /><Tooltip /><Bar dataKey="value" fill="#6d5bd0" radius={[8, 8, 0, 0]} /></BarChart></ChartCard> : null}
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <List title="Recent activity" rows={(data.lists.activity as { id: string; description: string; user: string }[] | undefined)?.map((item) => ({ id: item.id, title: item.description, text: item.user }))} />
        <List title="Upcoming events" rows={(data.lists.events as { id: string; name: string; location?: string }[] | undefined)?.map((item) => ({ id: item.id, title: item.name, text: item.location || "" }))} />
        <List title="Recent payments" rows={(data.lists.payments as { id: string; student: string; amount: number }[] | undefined)?.map((item) => ({ id: item.id, title: item.student, text: money(item.amount) }))} />
        <List title="Announcements" rows={(data.lists.announcements as { id: string; title: string; author: string }[] | undefined)?.map((item) => ({ id: item.id, title: item.title, text: item.author }))} />
        <List title="My classes" rows={(data.lists.classes as { className: string; subject: string }[] | undefined)?.map((item, index) => ({ id: String(index), title: item.className, text: item.subject }))} />
        <List title="Children" rows={(data.lists.children as { id: string; name: string; className: string; attendance: number | null; balance: number }[] | undefined)?.map((item) => ({ id: item.id, title: item.name, text: `${item.className} · attendance ${item.attendance ?? "—"}% · balance ${money(item.balance)}` }))} />
        <List title="Loans" rows={(data.lists.loans as { id: string; book: string; borrower: string; status: string }[] | undefined)?.map((item) => ({ id: item.id, title: item.book, text: `${item.borrower} · ${item.status}` }))} />
      </section>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactElement }) {
  return (
    <div className="rounded-3xl border border-line bg-card p-5 shadow-card">
      <h2 className="mb-3 text-sm font-semibold tracking-tight">{title}</h2>
      <div className="h-64"><ResponsiveContainer>{children}</ResponsiveContainer></div>
    </div>
  );
}

function List({ title, rows }: { title: string; rows?: { id: string; title: string; text: string }[] }) {
  if (!rows?.length) return null;
  return (
    <div className="rounded-3xl border border-line bg-card p-5 shadow-card">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      <ul className="mt-3 divide-y divide-line">
        {rows.map((row) => <li key={row.id} className="py-2 text-sm"><div className="font-medium">{row.title}</div><div className="text-muted">{row.text}</div></li>)}
      </ul>
    </div>
  );
}
