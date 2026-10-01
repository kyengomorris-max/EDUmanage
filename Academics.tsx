import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Empty, Field, Modal, PageHeader, Skeleton, controlClass, statusTone } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { api, getAccessToken, schoolHeaders } from "../lib/api";

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];

export function ClassesPage() {
  const { schoolId, can } = useAuth();
  const client = useQueryClient();
  const headers = schoolHeaders(schoolId);
  const classes = useQuery({ queryKey: ["classes", schoolId], queryFn: () => api<ClassRow[]>("/api/classes", { headers }) });
  const levels = useQuery({ queryKey: ["levels", schoolId], queryFn: () => api<{ id: string; name: string }[]>("/api/class-levels", { headers }) });
  const streams = useQuery({ queryKey: ["streams", schoolId], queryFn: () => api<{ id: string; name: string }[]>("/api/streams", { headers }) });
  const years = useQuery({ queryKey: ["years", schoolId], queryFn: () => api<{ id: string; name: string; isCurrent: boolean }[]>("/api/academic-years", { headers }) });
  const [open, setOpen] = useState<string | null>(null);
  async function create(path: string, body: Record<string, string>, key: string) {
    await api(path, { method: "POST", headers, body: JSON.stringify(body) });
    toast.success("Saved.");
    client.invalidateQueries({ queryKey: [key] });
    setOpen(null);
  }
  return (
    <div>
      <PageHeader title="Classes" text="Levels, streams, and the class groups students belong to." action={can("academics.write") ? <div className="flex gap-2"><Button variant="ghost" onClick={() => setOpen("level")}>Add level</Button><Button variant="ghost" onClick={() => setOpen("stream")}>Add stream</Button><Button onClick={() => setOpen("class")}>Add class</Button></div> : null} />
      {classes.isLoading ? <Skeleton /> : null}
      {classes.data?.length === 0 ? <Empty title="No classes yet." action={can("academics.write") ? <Button onClick={() => setOpen("class")}>Add class</Button> : null} /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {classes.data?.map((item) => (
          <article key={item.id} className="rounded-2xl border border-line bg-card p-4">
            <h2 className="text-lg font-semibold">{item.name}</h2>
            <p className="text-sm text-muted">{item.level} · {item.stream} · {item.academicYear}</p>
            <p className="mt-2 text-sm">{item.students} students · Room {item.room || "—"}</p>
            <p className="text-sm">Class teacher: {item.classTeacher || "Not assigned"}</p>
          </article>
        ))}
      </div>
      {open === "level" ? <Quick title="Class level" onClose={() => setOpen(null)} onSave={(name) => create("/api/class-levels", { name }, "levels")} /> : null}
      {open === "stream" ? <Quick title="Stream" onClose={() => setOpen(null)} onSave={(name) => create("/api/streams", { name }, "streams")} /> : null}
      {open === "class" ? (
        <Modal title="Add class" onClose={() => setOpen(null)}>
          <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>; create("/api/classes", data, "classes"); }}>
            <Field label="Level"><select className={controlClass} name="classLevelId" required>{levels.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <Field label="Stream"><select className={controlClass} name="streamId" required>{streams.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <Field label="Academic year"><select className={controlClass} name="academicYearId" required>{years.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <Field label="Room"><input className={controlClass} name="room" /></Field>
            <Button>Save class</Button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

type ClassRow = { id: string; name: string; level: string; stream: string; academicYear: string; students: number; room: string | null; classTeacher: string | null };

function Quick({ title, onClose, onSave }: { title: string; onClose: () => void; onSave: (name: string) => void }) {
  return (
    <Modal title={title} onClose={onClose}>
      <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); onSave(String(new FormData(event.currentTarget).get("name"))); }}>
        <Field label="Name"><input className={controlClass} name="name" required /></Field>
        <Button>Save</Button>
      </form>
    </Modal>
  );
}

export function SubjectsPage() {
  const { schoolId, can } = useAuth();
  const headers = schoolHeaders(schoolId);
  const client = useQueryClient();
  const subjects = useQuery({ queryKey: ["subjects", schoolId], queryFn: () => api<SubjectRow[]>("/api/subjects", { headers }) });
  const classes = useQuery({ queryKey: ["classes", schoolId], queryFn: () => api<ClassRow[]>("/api/classes", { headers }) });
  const teachers = useQuery({ queryKey: ["teachers", schoolId], queryFn: () => api<{ id: string; name: string }[]>("/api/teachers", { headers }) });
  const [open, setOpen] = useState(false);
  return (
    <div>
      <PageHeader title="Subjects" text="Offer a subject to a class and assign the teacher who marks it." action={can("academics.write") ? <Button onClick={() => setOpen(true)}>Add subject</Button> : null} />
      {subjects.isLoading ? <Skeleton /> : null}
      {subjects.data?.length === 0 ? <Empty title="No subjects found." /> : null}
      <div className="space-y-3">
        {subjects.data?.map((subject) => (
          <article key={subject.id} className="rounded-2xl border border-line bg-card p-4">
            <div className="flex items-center justify-between"><h2 className="font-semibold">{subject.name}</h2><Badge tone={subject.isActive ? "green" : "slate"}>{subject.code}</Badge></div>
            <p className="mt-2 text-sm text-muted">{subject.classes.map((item) => item.name).join(", ") || "Not offered to a class yet"}</p>
            {can("academics.write") ? (
              <form className="mt-3 flex flex-wrap gap-2" onSubmit={async (event) => {
                event.preventDefault();
                const data = Object.fromEntries(new FormData(event.currentTarget).entries());
                await api(`/api/subjects/${subject.id}/assign`, { method: "POST", headers, body: JSON.stringify(data) });
                toast.success("Subject assigned.");
                client.invalidateQueries({ queryKey: ["subjects"] });
              }}>
                <select className={controlClass} name="classSectionId" required><option value="">Class</option>{classes.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                <select className={controlClass} name="teacherId"><option value="">Teacher</option>{teachers.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                <Button type="submit">Assign</Button>
              </form>
            ) : null}
          </article>
        ))}
      </div>
      {open ? (
        <Modal title="Add subject" onClose={() => setOpen(false)}>
          <form className="grid gap-3" onSubmit={async (event) => {
            event.preventDefault();
            await api("/api/subjects", { method: "POST", headers, body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())) });
            toast.success("Subject added.");
            client.invalidateQueries({ queryKey: ["subjects"] });
            setOpen(false);
          }}>
            <Field label="Name"><input className={controlClass} name="name" required /></Field>
            <Field label="Code"><input className={controlClass} name="code" required /></Field>
            <Button>Save</Button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

type SubjectRow = { id: string; name: string; code: string; isActive: boolean; classes: { id: string; name: string }[] };

export function AttendancePage() {
  const { schoolId, can } = useAuth();
  const headers = schoolHeaders(schoolId);
  const classes = useQuery({ queryKey: ["classes", schoolId], queryFn: () => api<ClassRow[]>("/api/classes", { headers }) });
  const [classSectionId, setClass] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const roster = useQuery({
    queryKey: ["attendance", classSectionId, date],
    enabled: Boolean(classSectionId),
    queryFn: () => api<{ className: string; students: { studentId: string; name: string; admissionNumber: string; status: string; reason: string }[] }>(`/api/attendance?classSectionId=${classSectionId}&date=${date}`, { headers }),
  });
  const summary = useQuery({ queryKey: ["attendance-summary", schoolId], queryFn: () => api<{ today: { rate: number }; frequentAbsences: { name: string; count: number }[]; classes: { name: string; rate: number }[] }>("/api/attendance/summary", { headers }) });
  const [marks, setMarks] = useState<Record<string, { status: string; reason: string }>>({});
  const rows = roster.data?.students.map((student) => ({ ...student, ...(marks[student.studentId] || {}) })) ?? [];
  return (
    <div>
      <PageHeader title="Attendance" text={summary.data ? `Today's marked rate is ${summary.data.today.rate}%.` : "Mark a class register."} />
      <div className="mb-4 flex flex-wrap gap-2">
        <select aria-label="Class" className={controlClass} value={classSectionId} onChange={(event) => { setClass(event.target.value); setMarks({}); }}><option value="">Choose a class</option>{classes.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <input aria-label="Date" className={controlClass} type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </div>
      {!classSectionId ? <Empty title="Choose a class to open the register." /> : roster.isLoading ? <Skeleton /> : (
        <form className="space-y-3" onSubmit={async (event) => {
          event.preventDefault();
          if (!can("attendance.write")) return toast.error("You cannot mark attendance.");
          await api("/api/attendance", { method: "POST", headers, body: JSON.stringify({ classSectionId, date, records: rows.map((row) => ({ studentId: row.studentId, status: row.status, reason: row.reason })) }) });
          toast.success("Attendance saved.");
          roster.refetch();
          summary.refetch();
        }}>
          {rows.map((row) => (
            <div key={row.studentId} className="grid items-center gap-2 rounded-xl border border-line bg-card p-3 md:grid-cols-[1fr_auto_1fr]">
              <div><div className="font-medium">{row.name}</div><div className="text-xs text-muted">{row.admissionNumber}</div></div>
              <div className="flex gap-1">
                {["PRESENT", "ABSENT", "LATE", "EXCUSED"].map((status) => (
                  <button type="button" key={status} className={`rounded-full px-2 py-1 text-xs ${row.status === status ? "bg-primary text-white" : "border border-line"}`} onClick={() => setMarks((current) => ({ ...current, [row.studentId]: { status, reason: row.reason } }))}>{status}</button>
                ))}
              </div>
              <input className={controlClass} placeholder="Reason" value={row.reason || ""} onChange={(event) => setMarks((current) => ({ ...current, [row.studentId]: { status: row.status, reason: event.target.value } }))} />
            </div>
          ))}
          {can("attendance.write") ? <Button>Save register</Button> : null}
        </form>
      )}
      {summary.data?.frequentAbsences?.length ? (
        <div className="mt-6">
          <h2 className="font-semibold">Frequently absent</h2>
          <ul className="mt-2 text-sm">{summary.data.frequentAbsences.map((item) => <li key={item.name}>{item.name} · {item.count} absences</li>)}</ul>
        </div>
      ) : null}
    </div>
  );
}

export function TimetablePage() {
  const { schoolId, can } = useAuth();
  const headers = schoolHeaders(schoolId);
  const classes = useQuery({ queryKey: ["classes", schoolId], queryFn: () => api<ClassRow[]>("/api/classes", { headers }) });
  const [classSectionId, setClass] = useState("");
  const slots = useQuery({
    queryKey: ["timetable", classSectionId],
    enabled: Boolean(classSectionId),
    queryFn: () => api<Slot[]>(`/api/timetable?classSectionId=${classSectionId}`, { headers }),
  });
  const grid = useMemo(() => DAYS.map((day) => ({ day, slots: (slots.data || []).filter((slot) => slot.day === day) })), [slots.data]);
  return (
    <div>
      <PageHeader title="Timetable" text="Class schedule for the week." />
      <select aria-label="Class" className={`${controlClass} mb-4 max-w-xs`} value={classSectionId} onChange={(event) => setClass(event.target.value)}>
        <option value="">Choose a class</option>
        {classes.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      {!classSectionId ? <Empty title="Choose a class to see its timetable." /> : (
        <div className="grid gap-3 md:grid-cols-5">
          {grid.map((column) => (
            <section key={column.day} className="rounded-2xl border border-line bg-card p-3">
              <h2 className="text-sm font-semibold">{column.day}</h2>
              <div className="mt-2 space-y-2">
                {column.slots.map((slot) => (
                  <div key={slot.id} className="rounded-lg bg-canvas p-2 text-xs">
                    <div className="font-semibold">{slot.startTime}–{slot.endTime}</div>
                    <div>{slot.subject}</div>
                    <div className="text-muted">{slot.teacher || "Teacher TBC"} · {slot.room || ""}</div>
                    {can("academics.write") ? <button className="mt-1 text-red-600" onClick={async () => { await api(`/api/timetable/${slot.id}`, { method: "DELETE", headers }); slots.refetch(); }}>Remove</button> : null}
                  </div>
                ))}
                {column.slots.length === 0 ? <p className="text-xs text-muted">No lessons</p> : null}
              </div>
            </section>
          ))}
        </div>
      )}
      {can("academics.write") && classSectionId ? <SlotForm classSectionId={classSectionId} onSaved={() => slots.refetch()} /> : null}
    </div>
  );
}

type Slot = { id: string; day: string; startTime: string; endTime: string; subject: string; teacher: string | null; room: string | null };

function SlotForm({ classSectionId, onSaved }: { classSectionId: string; onSaved: () => void }) {
  const { schoolId } = useAuth();
  const headers = schoolHeaders(schoolId);
  const subjects = useQuery({ queryKey: ["subjects", schoolId], queryFn: () => api<{ id: string; name: string }[]>("/api/subjects", { headers }) });
  const teachers = useQuery({ queryKey: ["teachers", schoolId], queryFn: () => api<{ id: string; name: string }[]>("/api/teachers", { headers }) });
  return (
    <form className="mt-6 grid gap-2 rounded-2xl border border-line bg-card p-4 md:grid-cols-6" onSubmit={async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget).entries());
      await api("/api/timetable", { method: "POST", headers, body: JSON.stringify({ ...data, classSectionId }) });
      toast.success("Lesson added.");
      onSaved();
    }}>
      <select className={controlClass} name="day">{DAYS.map((day) => <option key={day}>{day}</option>)}</select>
      <input className={controlClass} name="startTime" placeholder="08:00" required />
      <input className={controlClass} name="endTime" placeholder="08:40" required />
      <select className={controlClass} name="subjectId" required>{subjects.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select className={controlClass} name="teacherId"><option value="">Teacher</option>{teachers.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <Button>Add lesson</Button>
    </form>
  );
}

export function ExamsPage() {
  const { schoolId, can } = useAuth();
  const headers = schoolHeaders(schoolId);
  const client = useQueryClient();
  const exams = useQuery({ queryKey: ["exams", schoolId], queryFn: () => api<ExamRow[]>("/api/exams", { headers }) });
  const types = useQuery({ queryKey: ["exam-types", schoolId], queryFn: () => api<{ id: string; name: string }[]>("/api/exam-types", { headers }) });
  const years = useQuery({ queryKey: ["years", schoolId], queryFn: () => api<{ id: string; name: string }[]>("/api/academic-years", { headers }) });
  const terms = useQuery({ queryKey: ["terms", schoolId], queryFn: () => api<{ id: string; name: string }[]>("/api/terms", { headers }) });
  const classes = useQuery({ queryKey: ["classes", schoolId], queryFn: () => api<ClassRow[]>("/api/classes", { headers }) });
  const subjects = useQuery({ queryKey: ["subjects", schoolId], queryFn: () => api<{ id: string; name: string }[]>("/api/subjects", { headers }) });
  const scale = useQuery({ queryKey: ["scale", schoolId], queryFn: () => api<{ name: string; bands: { letter: string; minScore: number; maxScore: number; remark: string }[] } | null>("/api/grade-scales", { headers }) });
  const [examId, setExam] = useState("");
  const [classSectionId, setClass] = useState("");
  const results = useQuery({
    queryKey: ["results", examId, classSectionId],
    enabled: Boolean(examId && classSectionId),
    queryFn: () => api<ResultRow[]>(`/api/results?examId=${examId}&classSectionId=${classSectionId}`, { headers }),
  });
  return (
    <div className="space-y-6">
      <PageHeader title="Exams and results" text="Marks use the school's grade scale. Positions appear when the school has them switched on." />
      {scale.data ? <p className="text-sm text-muted">{scale.data.name}: {scale.data.bands.map((band) => `${band.letter} ${band.minScore}–${band.maxScore}`).join(" · ")}</p> : null}
      {can("academics.write") || can("grades.write") ? (
        <form className="grid gap-2 rounded-2xl border border-line bg-card p-4 md:grid-cols-3" onSubmit={async (event) => {
          event.preventDefault();
          await api("/api/exams", { method: "POST", headers, body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())) });
          toast.success("Exam created.");
          client.invalidateQueries({ queryKey: ["exams"] });
        }}>
          <input className={controlClass} name="name" placeholder="Exam name" required />
          <select className={controlClass} name="examTypeId" required>{types.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <select className={controlClass} name="academicYearId" required>{years.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <select className={controlClass} name="termId" required>{terms.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <input className={controlClass} type="date" name="startDate" required />
          <input className={controlClass} type="date" name="endDate" required />
          <Button className="md:col-span-3">Create exam</Button>
        </form>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <select aria-label="Exam" className={controlClass} value={examId} onChange={(event) => setExam(event.target.value)}><option value="">Exam</option>{exams.data?.map((exam) => <option key={exam.id} value={exam.id}>{exam.name}</option>)}</select>
        <select aria-label="Class" className={controlClass} value={classSectionId} onChange={(event) => setClass(event.target.value)}><option value="">Class</option>{classes.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      </div>
      {can("grades.write") && examId && classSectionId ? (
        <form className="flex flex-wrap gap-2" onSubmit={async (event) => {
          event.preventDefault();
          const data = Object.fromEntries(new FormData(event.currentTarget).entries());
          await api(`/api/exams/${examId}/papers`, { method: "POST", headers, body: JSON.stringify({ ...data, classSectionId, maxScore: 100 }) });
          toast.success("Paper added. Enter marks from the class results after scores exist, or use grade entry below.");
          results.refetch();
        }}>
          <select className={controlClass} name="subjectId" required>{subjects.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <Button>Add paper</Button>
        </form>
      ) : null}
      {results.data ? (
        <div className="overflow-x-auto rounded-2xl border border-line bg-card">
          <table className="w-full text-left text-sm">
            <thead><tr><th className="px-3 py-2">Student</th><th>Average</th><th>Grade</th><th>Position</th></tr></thead>
            <tbody>
              {results.data.map((row) => (
                <tr key={row.studentId} className="border-t border-line">
                  <td className="px-3 py-2">{row.name}</td>
                  <td>{row.average}</td>
                  <td><Badge tone={statusTone(row.grade === "E" ? "ABSENT" : "PRESENT")}>{row.grade || "—"}</Badge></td>
                  <td>{row.position ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty title="Choose an exam and class to see results." />}
      {exams.isLoading ? <Skeleton /> : null}
    </div>
  );
}

type ExamRow = { id: string; name: string };
type ResultRow = { studentId: string; name: string; average: number; grade: string | null; position: number | null };

async function downloadReport(path: string, filename: string, headers?: HeadersInit) {
  const token = getAccessToken();
  const response = await fetch(path, { headers: { Authorization: `Bearer ${token}`, ...(headers as Record<string, string> | undefined) } });
  if (!response.ok) return toast.error("Unable to download the report card.");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function ReportCardPage() {
  const { schoolId } = useAuth();
  const headers = schoolHeaders(schoolId);
  const students = useQuery({ queryKey: ["students", schoolId], queryFn: () => api<{ id: string; name: string }[]>("/api/students?pageSize=100", { headers }) });
  const [studentId, setStudent] = useState("");
  const card = useQuery({
    queryKey: ["report", studentId],
    enabled: Boolean(studentId),
    queryFn: () => api<Report>("/api/report-cards/" + studentId, { headers }),
  });
  return (
    <div>
      <PageHeader title="Report card" text="Review, print, or download the official card." action={card.data ? <div className="flex gap-2 no-print"><Button variant="ghost" onClick={() => window.print()}>Print</Button><Button onClick={() => downloadReport(`/api/report-cards/${studentId}/pdf`, "report-card.pdf", headers)}>Download PDF</Button></div> : null} />
      <select aria-label="Student" className={`${controlClass} mb-4 max-w-sm no-print`} value={studentId} onChange={(event) => setStudent(event.target.value)}>
        <option value="">Choose a student</option>
        {students.data?.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
      </select>
      {card.data ? (
        <article className="mx-auto max-w-3xl rounded-2xl border border-line bg-white p-8 text-slate-900">
          <h2 className="text-center text-2xl font-semibold">{card.data.school.name}</h2>
          <p className="text-center text-sm">{card.data.school.motto}</p>
          <p className="mt-6 text-sm">{card.data.student.name} · {card.data.student.admissionNumber} · {card.data.className}</p>
          <p className="text-sm">{card.data.exam.name}</p>
          <table className="mt-4 w-full text-sm"><tbody>{card.data.subjects.map((subject) => <tr key={subject.subject}><td>{subject.subject}</td><td>{subject.score ?? "—"}/{subject.maxScore}</td><td>{subject.grade ?? ""}</td></tr>)}</tbody></table>
          <p className="mt-4 text-sm">Average {card.data.average}% · Grade {card.data.grade || "—"} {card.data.position ? `· Position ${card.data.position} of ${card.data.classSize}` : ""}</p>
          <p className="mt-2 text-sm">Attendance {card.data.attendance.rate ?? "—"}%</p>
          <p className="mt-4 text-sm">Class teacher: {card.data.classTeacherRemark || "—"}</p>
          <p className="text-sm">Principal: {card.data.principalRemark || "—"}</p>
        </article>
      ) : <Empty title="Choose a student to open a report card." />}
    </div>
  );
}

type Report = {
  school: { name: string; motto: string | null };
  student: { name: string; admissionNumber: string };
  className: string;
  exam: { name: string };
  subjects: { subject: string; score: number | null; maxScore: number; grade: string | null }[];
  average: number;
  grade: string | null;
  position: number | null;
  classSize: number;
  attendance: { rate: number | null };
  classTeacherRemark: string;
  principalRemark: string;
};
