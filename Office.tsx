import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Empty, Field, Modal, PageHeader, Skeleton, controlClass, statusTone } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { api, getAccessToken, schoolHeaders } from "../lib/api";
import { money, when, whenTime } from "../lib/format";

function useHeaders() {
  const { schoolId } = useAuth();
  return schoolHeaders(schoolId);
}

export function FeesPage() {
  const headers = useHeaders();
  const { can, schoolId } = useAuth();
  const invoices = useQuery({ queryKey: ["invoices", schoolId], queryFn: () => api<Invoice[]>("/api/fees/invoices", { headers }) });
  const structures = useQuery({ queryKey: ["structures", schoolId], queryFn: () => api<{ id: string; name: string; total: number }[]>("/api/fees/structures", { headers }) });
  const summary = useQuery({ queryKey: ["fee-summary", schoolId], queryFn: () => api<{ billed: number; collected: number; outstanding: number }>("/api/fees/summary", { headers }) });
  const [pay, setPay] = useState<Invoice | null>(null);
  return (
    <div>
      <PageHeader title="Fees" text="Invoices, balances, and receipts." />
      {summary.data ? <p className="mb-4 text-sm text-muted">Billed {money(summary.data.billed)} · Collected {money(summary.data.collected)} · Outstanding {money(summary.data.outstanding)}</p> : null}
      {invoices.isLoading ? <Skeleton /> : null}
      {invoices.data?.length === 0 ? <Empty title="No invoices yet." /> : null}
      <div className="overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="text-muted"><tr><th className="px-3 py-2">Invoice</th><th>Student</th><th>Due</th><th>Balance</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {invoices.data?.map((invoice) => (
              <tr key={invoice.id} className="border-t border-line">
                <td className="px-3 py-2">{invoice.number}</td>
                <td>{invoice.student}</td>
                <td>{when(invoice.dueDate)}</td>
                <td>{money(invoice.balance)}</td>
                <td><Badge tone={statusTone(invoice.status)}>{invoice.status === "PARTIAL" ? "Partially paid" : invoice.status}</Badge></td>
                <td>{can("payments.write") && invoice.balance > 0 ? <Button variant="soft" onClick={() => setPay(invoice)}>Record payment</Button> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {can("fees.write") && structures.data ? <p className="mt-4 text-xs text-muted">{structures.data.length} fee structure{structures.data.length === 1 ? "" : "s"} configured.</p> : null}
      {pay ? <PayModal invoice={pay} onClose={() => setPay(null)} /> : null}
    </div>
  );
}

type Invoice = { id: string; number: string; student: string; dueDate: string; balance: number; status: string };

function PayModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const headers = useHeaders();
  const client = useQueryClient();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const payment = await api<{ id: string }>("/api/fees/payments", { method: "POST", headers, body: JSON.stringify({ ...data, invoiceId: invoice.id, amount: Number(data.amount) }) });
    toast.success("Payment recorded.");
    client.invalidateQueries({ queryKey: ["invoices"] });
    const token = getAccessToken();
    const response = await fetch(`/api/fees/payments/${payment.id}/receipt`, { headers: { Authorization: `Bearer ${token}`, ...headers } });
    const blob = await response.blob();
    window.open(URL.createObjectURL(blob));
    onClose();
  }
  return (
    <Modal title={`Pay ${invoice.number}`} onClose={onClose}>
      <form className="grid gap-3" onSubmit={submit}>
        <Field label="Amount"><input className={controlClass} name="amount" type="number" min="1" max={invoice.balance} required /></Field>
        <Field label="Method"><select className={controlClass} name="method"><option>CASH</option><option>BANK</option><option>MOBILE</option><option>CARD</option></select></Field>
        <Field label="Reference"><input className={controlClass} name="reference" /></Field>
        <Button>Save payment</Button>
      </form>
    </Modal>
  );
}

export function AssignmentsPage() {
  const headers = useHeaders();
  const { can, schoolId } = useAuth();
  const client = useQueryClient();
  const rows = useQuery({ queryKey: ["assignments", schoolId], queryFn: () => api<Assignment[]>("/api/assignments", { headers }) });
  const [open, setOpen] = useState<Assignment | null>(null);
  return (
    <div>
      <PageHeader title="Assignments" text="Deadlines, submissions, and feedback." />
      {rows.isLoading ? <Skeleton /> : null}
      {rows.data?.length === 0 ? <Empty title="No assignments yet." /> : null}
      <div className="space-y-3">
        {rows.data?.map((item) => (
          <article key={item.id} className="rounded-2xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold">{item.title}</h2>
                <p className="text-sm text-muted">{item.subject} · {item.className} · due {whenTime(item.dueAt)}</p>
              </div>
              <Button variant="soft" onClick={() => setOpen(item)}>{can("assignments.submit") ? "Submit" : "Open"}</Button>
            </div>
            <p className="mt-2 text-sm">{item.instructions}</p>
            {item.mySubmission ? <p className="mt-2 text-sm">Your work: {item.mySubmission.status}{item.mySubmission.score != null ? ` · ${item.mySubmission.score}` : ""} {item.mySubmission.feedback || ""}</p> : null}
          </article>
        ))}
      </div>
      {open ? (
        <Modal title={open.title} onClose={() => setOpen(null)}>
          {can("assignments.submit") ? (
            <form className="space-y-3" onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              await api(`/api/assignments/${open.id}/submit`, { method: "POST", headers, body: form });
              toast.success("Submission received.");
              client.invalidateQueries({ queryKey: ["assignments"] });
              setOpen(null);
            }}>
              <Field label="Notes"><textarea className={controlClass} name="text" rows={4} /></Field>
              <Field label="File"><input className={controlClass} type="file" name="file" /></Field>
              <Button>Upload submission</Button>
            </form>
          ) : null}
          {can("assignments.write") ? open.submissions.map((submission) => (
            <form key={submission.id} className="mt-3 grid gap-2 border-t border-line pt-3 md:grid-cols-[1fr_80px_1fr_auto]" onSubmit={async (event) => {
              event.preventDefault();
              const data = Object.fromEntries(new FormData(event.currentTarget).entries());
              await api(`/api/submissions/${submission.id}`, { method: "PATCH", headers, body: JSON.stringify({ score: Number(data.score), feedback: data.feedback }) });
              toast.success("Grade saved.");
              client.invalidateQueries({ queryKey: ["assignments"] });
            }}>
              <span className="text-sm">{submission.student}</span>
              <input className={controlClass} name="score" type="number" placeholder="Score" required />
              <input className={controlClass} name="feedback" placeholder="Feedback" />
              <Button>Grade</Button>
            </form>
          )) : null}
        </Modal>
      ) : null}
    </div>
  );
}

type Assignment = {
  id: string; title: string; instructions: string; dueAt: string; subject: string; className: string;
  mySubmission: { status: string; score: number | null; feedback: string | null } | null;
  submissions: { id: string; student: string }[];
};

export function MaterialsPage() {
  const headers = useHeaders();
  const { can, schoolId } = useAuth();
  const client = useQueryClient();
  const rows = useQuery({ queryKey: ["materials", schoolId], queryFn: () => api<{ id: string; title: string; topic: string | null; fileName: string; storedName: string; subject: { name: string }; teacher: { user: { firstName: string; lastName: string } } }[]>("/api/materials", { headers }) });
  const subjects = useQuery({ queryKey: ["subjects", schoolId], queryFn: () => api<{ id: string; name: string }[]>("/api/subjects", { headers }) });
  return (
    <div>
      <PageHeader title="Learning materials" text="Notes, slides, and files organised by subject." />
      {can("materials.write") ? (
        <form className="mb-4 grid gap-2 rounded-2xl border border-line bg-card p-4 md:grid-cols-4" onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          await api("/api/materials", { method: "POST", headers, body: form });
          toast.success("Material uploaded.");
          client.invalidateQueries({ queryKey: ["materials"] });
        }}>
          <input className={controlClass} name="title" placeholder="Title" required />
          <select className={controlClass} name="subjectId" required>{subjects.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <input className={controlClass} name="topic" placeholder="Topic" />
          <input className={controlClass} type="file" name="file" required />
          <Button>Upload</Button>
        </form>
      ) : null}
      {rows.data?.length === 0 ? <Empty title="No materials yet." /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {rows.data?.map((item) => (
          <article key={item.id} className="rounded-2xl border border-line bg-card p-4">
            <h2 className="font-semibold">{item.title}</h2>
            <p className="text-sm text-muted">{item.subject.name} · {item.topic || "General"} · {item.teacher.user.firstName} {item.teacher.user.lastName}</p>
            <button className="mt-2 text-sm text-primary" onClick={() => download(`/api/files/${item.storedName}`, item.fileName, headers)}>Download {item.fileName}</button>
          </article>
        ))}
      </div>
    </div>
  );
}

async function download(path: string, filename: string, headers?: HeadersInit) {
  const token = getAccessToken();
  const response = await fetch(path, { headers: { Authorization: `Bearer ${token}`, ...headers as Record<string, string> } });
  if (!response.ok) return toast.error("Unable to download that file.");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
}

export function AnnouncementsPage() {
  const headers = useHeaders();
  const { can, schoolId } = useAuth();
  const client = useQueryClient();
  const rows = useQuery({ queryKey: ["announcements", schoolId], queryFn: () => api<{ id: string; title: string; body: string; priority: string; author: string; publishAt: string }[]>("/api/announcements", { headers }) });
  return (
    <div>
      <PageHeader title="Announcements" text="Messages for the school, a role, or a class." />
      {can("announcements.write") ? (
        <form className="mb-4 grid gap-2 rounded-2xl border border-line bg-card p-4" onSubmit={async (event) => {
          event.preventDefault();
          await api("/api/announcements", { method: "POST", headers, body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())) });
          toast.success("Announcement published.");
          client.invalidateQueries({ queryKey: ["announcements"] });
        }}>
          <input className={controlClass} name="title" placeholder="Title" required />
          <textarea className={controlClass} name="body" placeholder="Write the announcement" required rows={3} />
          <div className="flex gap-2">
            <select className={controlClass} name="priority"><option>NORMAL</option><option>HIGH</option><option>URGENT</option><option>LOW</option></select>
            <select className={controlClass} name="audienceType"><option value="SCHOOL">Entire school</option><option value="ROLE">A role</option></select>
            <select className={controlClass} name="audienceRole"><option value="">Role</option><option>TEACHER</option><option>STUDENT</option><option>PARENT</option></select>
            <Button>Publish</Button>
          </div>
        </form>
      ) : null}
      <div className="space-y-3">{rows.data?.map((item) => (
        <article key={item.id} className="rounded-2xl border border-line bg-card p-4">
          <div className="flex items-center justify-between"><h2 className="font-semibold">{item.title}</h2><Badge tone={item.priority === "URGENT" || item.priority === "HIGH" ? "red" : "blue"}>{item.priority}</Badge></div>
          <p className="mt-2 text-sm">{item.body}</p>
          <p className="mt-2 text-xs text-muted">{item.author} · {when(item.publishAt)}</p>
        </article>
      ))}</div>
      {rows.data?.length === 0 ? <Empty title="No announcements yet." /> : null}
    </div>
  );
}

export function MessagesPage() {
  const headers = useHeaders();
  const { schoolId } = useAuth();
  const client = useQueryClient();
  const [box, setBox] = useState("inbox");
  const [search, setSearch] = useState("");
  const rows = useQuery({ queryKey: ["messages", schoolId, box, search], queryFn: () => api<Message[]>(`/api/messages?box=${box}&search=${encodeURIComponent(search)}`, { headers }) });
  const users = useQuery({ queryKey: ["recipients", schoolId], queryFn: () => api<{ id: string; name: string }[]>("/api/messages/recipients", { headers }) });
  return (
    <div>
      <PageHeader title="Messages" text="Write to teachers, parents, and school leadership you are allowed to contact." />
      <div className="mb-3 flex gap-2">
        <Button variant={box === "inbox" ? "primary" : "ghost"} onClick={() => setBox("inbox")}>Inbox</Button>
        <Button variant={box === "sent" ? "primary" : "ghost"} onClick={() => setBox("sent")}>Sent</Button>
        <input aria-label="Search messages" className={controlClass} placeholder="Search" value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>
      <form className="mb-4 grid gap-2 rounded-2xl border border-line bg-card p-4" onSubmit={async (event) => {
        event.preventDefault();
        try {
          await api("/api/messages", { method: "POST", headers, body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())) });
          toast.success("Message sent.");
          client.invalidateQueries({ queryKey: ["messages"] });
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Unable to send.");
        }
      }}>
        <select className={controlClass} name="recipientId" required><option value="">Recipient</option>{users.data?.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select>
        <input className={controlClass} name="subject" placeholder="Subject" required />
        <textarea className={controlClass} name="body" rows={3} required />
        <Button>Send</Button>
      </form>
      {rows.data?.length === 0 ? <Empty title="No messages found." /> : null}
      <div className="space-y-2">{rows.data?.map((message) => (
        <article key={message.id} className="rounded-xl border border-line bg-card p-3 text-sm">
          <div className="font-semibold">{message.subject}</div>
          <p>{message.body}</p>
          <p className="text-xs text-muted">{message.sender.name} → {message.recipient.name} · {whenTime(message.createdAt)} {message.readAt ? "" : "· Unread"}</p>
          {!message.readAt && box === "inbox" ? <button className="text-xs text-primary" onClick={() => api(`/api/messages/${message.id}/read`, { method: "POST", headers }).then(() => rows.refetch())}>Mark read</button> : null}
        </article>
      ))}</div>
    </div>
  );
}

type Message = { id: string; subject: string; body: string; readAt: string | null; createdAt: string; sender: { name: string }; recipient: { name: string } };

export function EventsPage() {
  const headers = useHeaders();
  const { can, schoolId } = useAuth();
  const client = useQueryClient();
  const rows = useQuery({ queryKey: ["events", schoolId], queryFn: () => api<{ id: string; name: string; description: string; startsAt: string; location: string | null }[]>("/api/events", { headers }) });
  return (
    <div>
      <PageHeader title="Events" text="Sports days, meetings, trips, and school occasions." />
      {can("events.write") ? (
        <form className="mb-4 grid gap-2 rounded-2xl border border-line bg-card p-4 md:grid-cols-2" onSubmit={async (event) => {
          event.preventDefault();
          const data = Object.fromEntries(new FormData(event.currentTarget).entries());
          await api("/api/events", { method: "POST", headers, body: JSON.stringify({ ...data, startsAt: new Date(String(data.startsAt)).toISOString() }) });
          toast.success("Event saved.");
          client.invalidateQueries({ queryKey: ["events"] });
        }}>
          <input className={controlClass} name="name" placeholder="Event name" required />
          <input className={controlClass} type="datetime-local" name="startsAt" required />
          <input className={controlClass} name="location" placeholder="Location" />
          <textarea className={controlClass} name="description" placeholder="Description" required />
          <Button>Add event</Button>
        </form>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">{rows.data?.map((event) => (
        <article key={event.id} className="rounded-2xl border border-line bg-card p-4">
          <h2 className="font-semibold">{event.name}</h2>
          <p className="text-sm text-muted">{whenTime(event.startsAt)} · {event.location || "School"}</p>
          <p className="mt-2 text-sm">{event.description}</p>
        </article>
      ))}</div>
      {rows.data?.length === 0 ? <Empty title="No events yet." /> : null}
    </div>
  );
}

export function LibraryPage() {
  const headers = useHeaders();
  const { can, schoolId } = useAuth();
  const client = useQueryClient();
  const summary = useQuery({ queryKey: ["library", schoolId], queryFn: () => api<{ totalBooks: number; available: number; borrowed: number; overdue: number }>("/api/library/summary", { headers }) });
  const books = useQuery({ queryKey: ["books", schoolId], queryFn: () => api<{ id: string; title: string; author: string; available: number; quantity: number }[]>("/api/library/books", { headers }) });
  const loans = useQuery({ queryKey: ["loans", schoolId], queryFn: () => api<{ id: string; book: string; borrower: string; status: string; dueAt: string }[]>("/api/library/loans", { headers }) });
  const users = useQuery({ queryKey: ["users", schoolId], enabled: can("library.write"), queryFn: () => api<{ id: string; name: string }[]>("/api/users?pageSize=100", { headers }) });
  return (
    <div>
      <PageHeader title="Library" text={summary.data ? `${summary.data.totalBooks} books · ${summary.data.available} available · ${summary.data.borrowed} borrowed · ${summary.data.overdue} overdue` : "Catalogue and loans."} />
      {can("library.write") ? (
        <form className="mb-4 grid gap-2 rounded-2xl border border-line bg-card p-4 md:grid-cols-4" onSubmit={async (event) => {
          event.preventDefault();
          const data = Object.fromEntries(new FormData(event.currentTarget).entries());
          await api("/api/library/books", { method: "POST", headers, body: JSON.stringify({ ...data, quantity: Number(data.quantity) }) });
          toast.success("Book added.");
          client.invalidateQueries({ queryKey: ["books"] });
        }}>
          <input className={controlClass} name="title" placeholder="Title" required />
          <input className={controlClass} name="author" placeholder="Author" required />
          <input className={controlClass} name="isbn" placeholder="ISBN" />
          <input className={controlClass} name="quantity" type="number" min="1" defaultValue={1} />
          <Button>Add book</Button>
        </form>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {books.data?.map((book) => (
          <article key={book.id} className="rounded-2xl border border-line bg-card p-4">
            <h2 className="font-semibold">{book.title}</h2>
            <p className="text-sm text-muted">{book.author} · {book.available}/{book.quantity} available</p>
            {can("library.write") ? (
              <form className="mt-2 flex gap-2" onSubmit={async (event) => {
                event.preventDefault();
                const data = Object.fromEntries(new FormData(event.currentTarget).entries());
                await api("/api/library/loans", { method: "POST", headers, body: JSON.stringify({ bookId: book.id, borrowerId: data.borrowerId, dueAt: data.dueAt }) });
                toast.success("Book issued.");
                client.invalidateQueries({ queryKey: ["loans"] });
                client.invalidateQueries({ queryKey: ["books"] });
              }}>
                <select className={controlClass} name="borrowerId" required>{users.data?.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select>
                <input className={controlClass} type="date" name="dueAt" required />
                <Button>Issue</Button>
              </form>
            ) : null}
          </article>
        ))}
      </div>
      <h2 className="mb-2 mt-6 font-semibold">Loans</h2>
      {loans.data?.map((loan) => (
        <div key={loan.id} className="mb-2 flex items-center justify-between rounded-xl border border-line bg-card px-3 py-2 text-sm">
          <span>{loan.book} · {loan.borrower} · <Badge tone={statusTone(loan.status)}>{loan.status}</Badge></span>
          {can("library.write") && loan.status !== "RETURNED" ? <Button variant="ghost" onClick={async () => { await api(`/api/library/loans/${loan.id}/return`, { method: "POST", headers }); client.invalidateQueries({ queryKey: ["loans"] }); }}>Return</Button> : null}
        </div>
      ))}
    </div>
  );
}

export function DisciplinePage() {
  const headers = useHeaders();
  const { schoolId } = useAuth();
  const rows = useQuery({ queryKey: ["discipline", schoolId], queryFn: () => api<{ id: string; student: string; incident: string; description: string; status: string; actionTaken: string | null }[]>("/api/discipline", { headers }) });
  const students = useQuery({ queryKey: ["students", schoolId], queryFn: () => api<{ id: string; name: string }[]>("/api/students?pageSize=100", { headers }) });
  const client = useQueryClient();
  return (
    <div>
      <PageHeader title="Discipline" text="Sensitive records. Only authorised staff can open this page." />
      <form className="mb-4 grid gap-2 rounded-2xl border border-line bg-card p-4" onSubmit={async (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget).entries());
        await api("/api/discipline", { method: "POST", headers, body: JSON.stringify(data) });
        toast.success("Incident recorded.");
        client.invalidateQueries({ queryKey: ["discipline"] });
      }}>
        <select className={controlClass} name="studentId" required>{students.data?.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select>
        <input className={controlClass} name="incident" placeholder="Incident" required />
        <textarea className={controlClass} name="description" placeholder="What happened" required />
        <input className={controlClass} name="actionTaken" placeholder="Action taken" />
        <input className={controlClass} type="date" name="occurredOn" required />
        <Button>Save record</Button>
      </form>
      {rows.data?.length === 0 ? <Empty title="No discipline records." /> : null}
      {rows.data?.map((row) => (
        <article key={row.id} className="mb-2 rounded-xl border border-line bg-card p-3 text-sm">
          <div className="font-semibold">{row.student} · {row.incident}</div>
          <p>{row.description}</p>
          <p className="text-muted">{row.actionTaken || "No action recorded"} · {row.status}</p>
        </article>
      ))}
    </div>
  );
}

export function DocumentsPage() {
  const headers = useHeaders();
  const { schoolId } = useAuth();
  const client = useQueryClient();
  const rows = useQuery({ queryKey: ["documents", schoolId], queryFn: () => api<{ id: string; title: string; category: string; fileName: string; storedName: string }[]>("/api/documents", { headers }) });
  return (
    <div>
      <PageHeader title="Documents" text="Policies, certificates, and student files." />
      <form className="mb-4 flex flex-wrap gap-2" onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await api("/api/documents", { method: "POST", headers, body: form });
        toast.success("Document uploaded.");
        client.invalidateQueries({ queryKey: ["documents"] });
      }}>
        <input className={controlClass} name="title" placeholder="Title" required />
        <select className={controlClass} name="category"><option>POLICY</option><option>STUDENT</option><option>CERTIFICATE</option><option>OTHER</option></select>
        <input type="file" name="file" required />
        <Button>Upload</Button>
      </form>
      {rows.data?.length === 0 ? <Empty title="No documents found." /> : null}
      {rows.data?.map((doc) => <button key={doc.id} className="mb-2 block w-full rounded-xl border border-line bg-card px-3 py-2 text-left text-sm" onClick={() => download(`/api/files/${doc.storedName}`, doc.fileName, headers)}>{doc.title} · {doc.category}</button>)}
    </div>
  );
}

export function ReportsPage() {
  const headers = useHeaders();
  const types = ["enrollment", "attendance", "performance", "fees", "outstanding", "workload", "library", "discipline", "assignments"];
  const [type, setType] = useState("enrollment");
  const report = useQuery({ queryKey: ["report", type], queryFn: () => api<{ columns: string[]; rows: (string | number)[][] }>(`/api/reports/${type}`, { headers: headers }) });
  return (
    <div>
      <PageHeader title="Reports" text="Built from live school records." action={<div className="flex gap-2"><Button variant="ghost" onClick={() => download(`/api/reports/${type}?format=xlsx`, `${type}.xlsx`, headers)}>Excel</Button><Button variant="ghost" onClick={() => download(`/api/reports/${type}?format=pdf`, `${type}.pdf`, headers)}>PDF</Button><Button variant="ghost" onClick={() => window.print()}>Print</Button></div>} />
      <select aria-label="Report" className={`${controlClass} mb-4 max-w-xs`} value={type} onChange={(event) => setType(event.target.value)}>{types.map((item) => <option key={item}>{item}</option>)}</select>
      {report.isLoading ? <Skeleton /> : null}
      {report.data ? (
        <div className="overflow-x-auto rounded-2xl border border-line bg-card">
          <table className="w-full text-left text-sm"><thead><tr>{report.data.columns.map((column) => <th key={column} className="px-3 py-2">{column}</th>)}</tr></thead>
            <tbody>{report.data.rows.map((row, index) => <tr key={index} className="border-t border-line">{row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-2">{String(cell)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export function SettingsPage() {
  const { user, refreshUser, schoolId } = useAuth();
  const headers = useHeaders();
  const school = useQuery({ queryKey: ["school", schoolId], queryFn: () => api<SchoolSettings>("/api/settings/school", { headers }) });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section>
        <h1 className="text-2xl font-semibold">School</h1>
        {school.data ? (
          <form className="mt-4 grid gap-3" onSubmit={async (event) => {
            event.preventDefault();
            await api("/api/settings/school", { method: "PUT", headers, body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())) });
            toast.success("School details saved.");
            refreshUser();
          }}>
            <Field label="Name"><input className={controlClass} name="name" defaultValue={school.data.name} required /></Field>
            <Field label="Motto"><input className={controlClass} name="motto" defaultValue={school.data.motto || ""} /></Field>
            <Field label="Address"><input className={controlClass} name="address" defaultValue={school.data.address || ""} /></Field>
            <Field label="Phone"><input className={controlClass} name="phone" defaultValue={school.data.phone || ""} /></Field>
            <Field label="Email"><input className={controlClass} name="email" defaultValue={school.data.email || ""} /></Field>
            <Field label="Website"><input className={controlClass} name="website" defaultValue={school.data.website || ""} /></Field>
            <Field label="Primary colour"><input className={controlClass} name="primaryColor" defaultValue={school.data.primaryColor} /></Field>
            <Field label="Timezone"><input className={controlClass} name="timezone" defaultValue={school.data.timezone} /></Field>
            <Button>Save school</Button>
          </form>
        ) : <Skeleton />}
      </section>
      <section>
        <h2 className="text-2xl font-semibold">Your account</h2>
        <form className="mt-4 grid gap-3" onSubmit={async (event) => {
          event.preventDefault();
          const data = Object.fromEntries(new FormData(event.currentTarget).entries());
          await api("/api/auth/me", { method: "PATCH", body: JSON.stringify({ ...data, notifyInApp: data.notifyInApp === "on", notifyEmail: data.notifyEmail === "on" }) });
          localStorage.setItem("theme", String(data.themePreference));
          toast.success("Preferences saved.");
          refreshUser();
        }}>
          <Field label="First name"><input className={controlClass} name="firstName" defaultValue={user?.firstName} /></Field>
          <Field label="Last name"><input className={controlClass} name="lastName" defaultValue={user?.lastName} /></Field>
          <Field label="Theme"><select className={controlClass} name="themePreference" defaultValue={user?.themePreference}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></Field>
          <label className="text-sm"><input type="checkbox" name="notifyInApp" defaultChecked={user?.notifyInApp} /> In-app notifications</label>
          <label className="text-sm"><input type="checkbox" name="notifyEmail" defaultChecked={user?.notifyEmail} /> Email notifications</label>
          <Button>Save preferences</Button>
        </form>
        <form className="mt-6 grid gap-3" onSubmit={async (event) => {
          event.preventDefault();
          const data = Object.fromEntries(new FormData(event.currentTarget).entries());
          await api("/api/auth/change-password", { method: "POST", body: JSON.stringify(data) });
          toast.success("Password changed. Sign in again on other devices.");
        }}>
          <Field label="Current password"><input className={controlClass} type="password" name="currentPassword" required /></Field>
          <Field label="New password"><input className={controlClass} type="password" name="newPassword" required /></Field>
          <Button variant="ghost">Change password</Button>
        </form>
      </section>
    </div>
  );
}

type SchoolSettings = { name: string; motto: string | null; address: string | null; phone: string | null; email: string | null; website: string | null; primaryColor: string; timezone: string };

export function UsersPage() {
  const headers = useHeaders();
  const { schoolId } = useAuth();
  const client = useQueryClient();
  const rows = useQuery({ queryKey: ["users", schoolId], queryFn: () => api<{ id: string; name: string; email: string; roles: string[]; status: string }[]>("/api/users", { headers }) });
  return (
    <div>
      <PageHeader title="Users" text="Create staff accounts and change access." />
      <form className="mb-4 grid gap-2 rounded-2xl border border-line bg-card p-4 md:grid-cols-4" onSubmit={async (event) => {
        event.preventDefault();
        const result = await api<{ temporaryPassword?: string }>("/api/users", { method: "POST", headers, body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())) });
        toast.success(result.temporaryPassword ? `User created. Temporary password: ${result.temporaryPassword}` : "User created.");
        client.invalidateQueries({ queryKey: ["users"] });
      }}>
        <input className={controlClass} name="firstName" placeholder="First name" required />
        <input className={controlClass} name="lastName" placeholder="Last name" required />
        <input className={controlClass} type="email" name="email" placeholder="Email" required />
        <select className={controlClass} name="role"><option>SCHOOL_ADMIN</option><option>PRINCIPAL</option><option>TEACHER</option><option>ACCOUNTANT</option><option>LIBRARIAN</option><option>PARENT</option></select>
        <Button>Create user</Button>
      </form>
      {rows.data?.map((user) => (
        <div key={user.id} className="mb-2 flex items-center justify-between rounded-xl border border-line bg-card px-3 py-2 text-sm">
          <span>{user.name} · {user.email} · {user.roles.join(", ")}</span>
          <Badge tone={statusTone(user.status)}>{user.status}</Badge>
        </div>
      ))}
    </div>
  );
}

export function AuditPage() {
  const headers = useHeaders();
  const rows = useQuery({ queryKey: ["audit"], queryFn: () => api<{ id: string; action: string; description: string; user: string; createdAt: string; ip: string | null }[]>("/api/audit-logs", { headers }) });
  return (
    <div>
      <PageHeader title="Audit log" text="Sign-ins, record changes, payments, and uploads." />
      {rows.isLoading ? <Skeleton /> : null}
      <div className="overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="w-full text-left text-sm"><tbody>
          {rows.data?.map((row) => <tr key={row.id} className="border-t border-line"><td className="px-3 py-2">{whenTime(row.createdAt)}</td><td>{row.user}</td><td>{row.description}</td><td className="text-muted">{row.ip || ""}</td></tr>)}
        </tbody></table>
      </div>
    </div>
  );
}

export function SearchPage() {
  const headers = useHeaders();
  const params = new URLSearchParams(window.location.search);
  const q = params.get("q") || "";
  const result = useQuery({ queryKey: ["search", q], queryFn: () => api<Record<string, { id: string; label: string; hint?: string; href: string }[]>>(`/api/search?q=${encodeURIComponent(q)}`, { headers }) });
  return (
    <div>
      <PageHeader title="Search" text={q ? `Results for “${q}”` : "Type at least two characters."} />
      {result.data ? Object.entries(result.data).map(([group, items]) => items.length ? (
        <section key={group} className="mb-4">
          <h2 className="text-sm font-semibold uppercase text-muted">{group}</h2>
          {items.map((item) => <a key={item.id} className="mt-1 block rounded-lg px-2 py-1 hover:bg-card" href={item.href}>{item.label} <span className="text-muted">{item.hint}</span></a>)}
        </section>
      ) : null) : null}
    </div>
  );
}
