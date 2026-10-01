import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Badge, Button, Empty, Field, Modal, PageHeader, Skeleton, controlClass, statusTone } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { api, apiResult, schoolHeaders } from "../lib/api";
import { money, when } from "../lib/format";

type Student = {
  id: string;
  name: string;
  admissionNumber: string;
  gender: string;
  status: string;
  className: string | null;
  classSectionId: string | null;
  primaryGuardian: string | null;
  dateOfBirth: string | null;
  address: string | null;
  user: { id: string; email: string; phone: string | null; firstName: string; lastName: string };
  guardians: { relationship: string; user: { firstName: string; lastName: string; email: string; phone: string | null } }[];
  bloodGroup: string | null;
  allergies: string | null;
  medicalNotes: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
};

export function StudentsPage() {
  const { schoolId, can } = useAuth();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["students", schoolId, search, page],
    queryFn: () => apiResult<Student[]>(`/api/students?search=${encodeURIComponent(search)}&page=${page}`, { headers: schoolHeaders(schoolId) }),
  });
  const students = query.data?.data;
  const meta = query.data?.meta;
  return (
    <div>
      <PageHeader title="Students" text="Admissions, classes, and guardian links for this school." action={can("students.write") ? <Button onClick={() => setOpen(true)}>Add student</Button> : null} />
      <input aria-label="Search students" className={`${controlClass} mb-4 max-w-sm`} placeholder="Search by name or admission number" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
      {query.isLoading ? <Skeleton /> : null}
      {query.isError ? <Empty title={query.error instanceof Error ? query.error.message : "Unable to load students."} /> : null}
      {students && students.length === 0 ? <Empty title="No students found." action={can("students.write") ? <Button onClick={() => setOpen(true)}>Add student</Button> : null} /> : null}
      {students && students.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-line bg-card">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-muted"><tr><th className="px-4 py-3">Student</th><th>Admission</th><th>Class</th><th>Guardian</th><th>Status</th></tr></thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id} className="border-t border-line">
                  <td className="px-4 py-3"><Link className="font-medium text-primary" to={`/app/students/${student.id}`}>{student.name}</Link><div className="text-xs text-muted">{student.user.email}</div></td>
                  <td>{student.admissionNumber}</td>
                  <td>{student.className || "Unassigned"}</td>
                  <td>{student.primaryGuardian || "—"}</td>
                  <td><Badge tone={statusTone(student.status)}>{student.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {meta && meta.pages > 1 ? (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <Button variant="ghost" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</Button>
          <span className="text-muted">Page {meta.page} of {meta.pages}</span>
          <Button variant="ghost" disabled={page >= meta.pages} onClick={() => setPage((current) => current + 1)}>Next</Button>
        </div>
      ) : null}
      {open ? <StudentForm onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function StudentForm({ onClose }: { onClose: () => void }) {
  const { schoolId } = useAuth();
  const client = useQueryClient();
  const classes = useQuery({ queryKey: ["classes", schoolId], queryFn: () => api<{ id: string; name: string }[]>("/api/classes", { headers: schoolHeaders(schoolId) }) });
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const result = await api<{ temporaryPassword?: string; guardianTemporaryPassword?: string | null }>("/api/students", { method: "POST", headers: schoolHeaders(schoolId), body: JSON.stringify(Object.fromEntries(form.entries())) });
      toast.success(`Student added. Temporary password: ${result.temporaryPassword}`);
      if (result.guardianTemporaryPassword) toast.message(`Guardian password: ${result.guardianTemporaryPassword}`);
      client.invalidateQueries({ queryKey: ["students"] });
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save student.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Add student" onClose={onClose}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
        <Field label="First name"><input className={controlClass} name="firstName" required /></Field>
        <Field label="Last name"><input className={controlClass} name="lastName" required /></Field>
        <Field label="Email"><input className={controlClass} type="email" name="email" required /></Field>
        <Field label="Phone"><input className={controlClass} name="phone" /></Field>
        <Field label="Gender"><select className={controlClass} name="gender"><option value="FEMALE">Female</option><option value="MALE">Male</option><option value="OTHER">Other</option><option value="UNSPECIFIED">Unspecified</option></select></Field>
        <Field label="Date of birth"><input className={controlClass} type="date" name="dateOfBirth" /></Field>
        <Field label="Admission number" hint="Leave blank to generate one."><input className={controlClass} name="admissionNumber" /></Field>
        <Field label="Class"><select className={controlClass} name="classSectionId"><option value="">Unassigned</option>{classes.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Address"><input className={controlClass} name="address" /></Field>
        <Field label="Blood group"><input className={controlClass} name="bloodGroup" /></Field>
        <Field label="Allergies"><input className={controlClass} name="allergies" /></Field>
        <Field label="Medical notes"><input className={controlClass} name="medicalNotes" /></Field>
        <Field label="Emergency contact"><input className={controlClass} name="emergencyName" /></Field>
        <Field label="Emergency phone"><input className={controlClass} name="emergencyPhone" /></Field>
        <Field label="Guardian first name"><input className={controlClass} name="guardianFirstName" /></Field>
        <Field label="Guardian last name"><input className={controlClass} name="guardianLastName" /></Field>
        <Field label="Guardian email"><input className={controlClass} name="guardianEmail" /></Field>
        <Field label="Relationship"><input className={controlClass} name="guardianRelationship" placeholder="Mother" /></Field>
        <div className="flex gap-2 sm:col-span-2"><Button disabled={busy}>{busy ? "Saving..." : "Save student"}</Button><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button></div>
      </form>
    </Modal>
  );
}

const TABS = ["Overview", "Academic", "Attendance", "Fees", "Assignments", "Documents", "Discipline"] as const;
const TAB_PATH: Partial<Record<(typeof TABS)[number], string>> = {
  Academic: "academics",
  Attendance: "attendance",
  Fees: "fees",
  Assignments: "assignments",
  Documents: "documents",
  Discipline: "discipline",
};

export function StudentProfile() {
  const { id = "" } = useParams();
  const { schoolId, can } = useAuth();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const student = useQuery({ queryKey: ["student", id], queryFn: () => api<Student>(`/api/students/${id}`, { headers: schoolHeaders(schoolId) }) });
  const extra = useQuery({
    queryKey: ["student", id, tab],
    enabled: tab !== "Overview",
    queryFn: () => api<unknown>(`/api/students/${id}/${TAB_PATH[tab]}`, { headers: schoolHeaders(schoolId) }),
  });
  if (student.isLoading) return <Skeleton />;
  if (!student.data) return <Empty title="Student not found." />;
  const person = student.data;
  const visibleTabs = TABS.filter((item) => item !== "Discipline" || can("discipline.read"));
  return (
    <div>
      <PageHeader title={person.name} text={`${person.admissionNumber} · ${person.className || "No class"} · ${person.user.email}`} />
      <div className="mb-4 flex flex-wrap gap-2">
        {visibleTabs.map((item) => <button key={item} className={`rounded-full px-3 py-1 text-sm ${tab === item ? "bg-primary text-white" : "bg-card border border-line"}`} onClick={() => setTab(item)}>{item}</button>)}
      </div>
      {tab === "Overview" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Info title="Personal" rows={[["Date of birth", when(person.dateOfBirth)], ["Gender", person.gender], ["Address", person.address || "—"], ["Phone", person.user.phone || "—"]]} />
          <Info title="Emergency" rows={[["Contact", person.emergencyName || "—"], ["Phone", person.emergencyPhone || "—"], ["Blood group", person.bloodGroup || "—"], ["Allergies", person.allergies || "None recorded"]]} />
          <Info title="Guardians" rows={person.guardians.map((guardian) => [guardian.relationship, `${guardian.user.firstName} ${guardian.user.lastName} · ${guardian.user.email}`])} />
        </div>
      ) : extra.isLoading ? <Skeleton /> : <ProfileTab tab={tab} data={extra.data} />}
    </div>
  );
}

function ProfileTab({ tab, data }: { tab: (typeof TABS)[number]; data: unknown }) {
  if (tab === "Attendance") {
    const body = data as { summary: { rate: number; total: number; PRESENT: number; ABSENT: number; LATE: number; EXCUSED: number }; records: { id: string; date: string; status: string; reason: string | null; className: string }[] };
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">{body.summary.rate}% present or late across {body.summary.total} records · {body.summary.ABSENT} absent · {body.summary.LATE} late · {body.summary.EXCUSED} excused</p>
        {body.records.length === 0 ? <Empty title="No attendance records yet." /> : (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-card">{body.records.map((record) => (
            <li key={record.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span>{when(record.date)} · {record.className}</span>
              <span className="flex items-center gap-2"><Badge tone={statusTone(record.status)}>{record.status}</Badge>{record.reason || ""}</span>
            </li>
          ))}</ul>
        )}
      </div>
    );
  }
  if (tab === "Academic") {
    const rows = data as { id: string; exam: string; subject: string; score: number; maxScore: number; remarks: string | null }[];
    if (!rows.length) return <Empty title="No exam scores yet." />;
    return <ul className="divide-y divide-line rounded-2xl border border-line bg-card">{rows.map((row) => <li key={row.id} className="flex justify-between gap-3 px-4 py-3 text-sm"><span>{row.subject} · {row.exam}</span><span>{row.score}/{row.maxScore}{row.remarks ? ` · ${row.remarks}` : ""}</span></li>)}</ul>;
  }
  if (tab === "Fees") {
    const rows = data as { id: string; number: string; status: string; dueDate: string; term: string | null; balance: number; total: number }[];
    if (!rows.length) return <Empty title="No invoices yet." />;
    return <ul className="divide-y divide-line rounded-2xl border border-line bg-card">{rows.map((row) => <li key={row.id} className="flex justify-between gap-3 px-4 py-3 text-sm"><span>{row.number} · {row.term || "Fees"} · due {when(row.dueDate)}</span><span className="flex items-center gap-2"><Badge tone={statusTone(row.status)}>{row.status}</Badge>{money(row.balance)} due of {money(row.total)}</span></li>)}</ul>;
  }
  if (tab === "Assignments") {
    const rows = data as { id: string; title: string; subject: string; dueAt: string; status: string; score: number | null; feedback: string | null }[];
    if (!rows.length) return <Empty title="No assignments for this class." />;
    return <ul className="divide-y divide-line rounded-2xl border border-line bg-card">{rows.map((row) => <li key={row.id} className="px-4 py-3 text-sm"><div className="flex justify-between gap-3"><span>{row.title} · {row.subject}</span><Badge tone={statusTone(row.status)}>{row.status}</Badge></div><p className="text-muted">Due {when(row.dueAt)}{row.score != null ? ` · ${row.score}` : ""}{row.feedback ? ` · ${row.feedback}` : ""}</p></li>)}</ul>;
  }
  if (tab === "Documents") {
    const rows = data as { id: string; title: string; category: string; fileName: string; createdAt: string }[];
    if (!rows.length) return <Empty title="No documents uploaded." />;
    return <ul className="divide-y divide-line rounded-2xl border border-line bg-card">{rows.map((row) => <li key={row.id} className="flex justify-between gap-3 px-4 py-3 text-sm"><span>{row.title}</span><span className="text-muted">{row.category} · {row.fileName}</span></li>)}</ul>;
  }
  const rows = data as { id: string; incident: string; occurredOn: string; status: string; actionTaken: string | null; reportedBy: { firstName: string; lastName: string } }[];
  if (!rows.length) return <Empty title="No discipline records." />;
  return <ul className="divide-y divide-line rounded-2xl border border-line bg-card">{rows.map((row) => <li key={row.id} className="px-4 py-3 text-sm"><div className="flex justify-between gap-3"><span>{row.incident}</span><Badge tone={statusTone(row.status)}>{row.status}</Badge></div><p className="text-muted">{when(row.occurredOn)} · {row.reportedBy.firstName} {row.reportedBy.lastName}{row.actionTaken ? ` · ${row.actionTaken}` : ""}</p></li>)}</ul>;
}

function Info({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <h2 className="font-semibold">{title}</h2>
      <dl className="mt-3 space-y-2 text-sm">{rows.map(([label, value]) => <div key={label} className="flex justify-between gap-4"><dt className="text-muted">{label}</dt><dd>{value}</dd></div>)}</dl>
    </section>
  );
}

type Teacher = { id: string; name: string; staffNumber: string; qualifications: string | null; employmentType: string; classes: string[]; subjects: string[]; user: { email: string; phone: string | null } };

export function TeachersPage() {
  const { schoolId, can } = useAuth();
  const [open, setOpen] = useState(false);
  const query = useQuery({ queryKey: ["teachers", schoolId], queryFn: () => api<Teacher[]>("/api/teachers", { headers: schoolHeaders(schoolId) }) });
  return (
    <div>
      <PageHeader title="Teachers" text="Staff numbers, subjects, and the classes they teach." action={can("teachers.write") ? <Button onClick={() => setOpen(true)}>Add teacher</Button> : null} />
      {query.isLoading ? <Skeleton /> : null}
      {query.data?.length === 0 ? <Empty title="No teachers found." action={can("teachers.write") ? <Button onClick={() => setOpen(true)}>Add teacher</Button> : null} /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {query.data?.map((teacher) => (
          <article key={teacher.id} className="rounded-2xl border border-line bg-card p-4">
            <h2 className="font-semibold">{teacher.name}</h2>
            <p className="text-sm text-muted">{teacher.staffNumber} · {teacher.user.email}</p>
            <p className="mt-2 text-sm">{teacher.qualifications || "Qualifications not recorded"}</p>
            <p className="mt-2 text-sm">Classes: {teacher.classes.join(", ") || "None yet"}</p>
            <p className="text-sm">Subjects: {teacher.subjects.join(", ") || "None yet"}</p>
          </article>
        ))}
      </div>
      {open ? <TeacherForm onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function TeacherForm({ onClose }: { onClose: () => void }) {
  const { schoolId } = useAuth();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api<{ temporaryPassword: string }>("/api/teachers", { method: "POST", headers: schoolHeaders(schoolId), body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())) });
      toast.success(`Teacher added. Temporary password: ${result.temporaryPassword}`);
      client.invalidateQueries({ queryKey: ["teachers"] });
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save teacher.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Add teacher" onClose={onClose}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
        <Field label="First name"><input className={controlClass} name="firstName" required /></Field>
        <Field label="Last name"><input className={controlClass} name="lastName" required /></Field>
        <Field label="Email"><input className={controlClass} type="email" name="email" required /></Field>
        <Field label="Phone"><input className={controlClass} name="phone" /></Field>
        <Field label="Staff number"><input className={controlClass} name="staffNumber" /></Field>
        <Field label="Qualifications"><input className={controlClass} name="qualifications" /></Field>
        <Field label="Employment"><select className={controlClass} name="employmentType"><option value="FULL_TIME">Full time</option><option value="PART_TIME">Part time</option><option value="CONTRACT">Contract</option></select></Field>
        <Field label="Hire date"><input className={controlClass} type="date" name="hireDate" /></Field>
        <div className="flex gap-2 sm:col-span-2"><Button disabled={busy}>{busy ? "Saving..." : "Save teacher"}</Button><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button></div>
      </form>
    </Modal>
  );
}
