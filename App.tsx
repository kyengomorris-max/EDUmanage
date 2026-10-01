import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { Shell } from "./layout/Shell";
import { AttendancePage, ClassesPage, ExamsPage, ReportCardPage, SubjectsPage, TimetablePage } from "./pages/Academics";
import { Dashboard } from "./pages/Dashboard";
import { AnnouncementsPage, AssignmentsPage, AuditPage, DisciplinePage, DocumentsPage, EventsPage, FeesPage, LibraryPage, MaterialsPage, MessagesPage, ReportsPage, SearchPage, SettingsPage, UsersPage } from "./pages/Office";
import { StudentProfile, StudentsPage, TeachersPage } from "./pages/People";
import { Forbidden, Forgot, Landing, Legal, Login, NotFound, Register, Reset, Verify } from "./pages/public";

function Guard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid min-h-screen place-items-center text-sm text-muted">Loading EduManage…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function Permit({ permission, children }: { permission: string[]; children: React.ReactNode }) {
  const { can } = useAuth();
  if (!permission.some((item) => can(item))) return <Forbidden />;
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<Forgot />} />
      <Route path="/reset-password" element={<Reset />} />
      <Route path="/verify-email" element={<Verify />} />
      <Route path="/privacy" element={<Legal title="Privacy Policy" />} />
      <Route path="/terms" element={<Legal title="Terms" />} />
      <Route path="/app" element={<Guard><Shell /></Guard>}>
        <Route index element={<Dashboard />} />
        <Route path="students" element={<Permit permission={["students.read", "attendance.read"]}><StudentsPage /></Permit>} />
        <Route path="students/:id" element={<Permit permission={["students.read", "grades.read", "fees.read"]}><StudentProfile /></Permit>} />
        <Route path="teachers" element={<Permit permission={["teachers.read", "academics.read"]}><TeachersPage /></Permit>} />
        <Route path="classes" element={<Permit permission={["academics.read"]}><ClassesPage /></Permit>} />
        <Route path="subjects" element={<Permit permission={["academics.read"]}><SubjectsPage /></Permit>} />
        <Route path="attendance" element={<Permit permission={["attendance.read", "attendance.write"]}><AttendancePage /></Permit>} />
        <Route path="exams" element={<Permit permission={["grades.read", "academics.read"]}><ExamsPage /></Permit>} />
        <Route path="report-cards" element={<Permit permission={["grades.read", "academics.read"]}><ReportCardPage /></Permit>} />
        <Route path="timetable" element={<Permit permission={["academics.read"]}><TimetablePage /></Permit>} />
        <Route path="fees" element={<Permit permission={["fees.read"]}><FeesPage /></Permit>} />
        <Route path="assignments" element={<Permit permission={["assignments.read"]}><AssignmentsPage /></Permit>} />
        <Route path="materials" element={<Permit permission={["materials.read"]}><MaterialsPage /></Permit>} />
        <Route path="announcements" element={<Permit permission={["announcements.read"]}><AnnouncementsPage /></Permit>} />
        <Route path="messages" element={<Permit permission={["messages.read"]}><MessagesPage /></Permit>} />
        <Route path="events" element={<Permit permission={["events.read"]}><EventsPage /></Permit>} />
        <Route path="library" element={<Permit permission={["library.read"]}><LibraryPage /></Permit>} />
        <Route path="discipline" element={<Permit permission={["discipline.read"]}><DisciplinePage /></Permit>} />
        <Route path="documents" element={<Permit permission={["documents.read"]}><DocumentsPage /></Permit>} />
        <Route path="reports" element={<Permit permission={["reports.read"]}><ReportsPage /></Permit>} />
        <Route path="users" element={<Permit permission={["users.read"]}><UsersPage /></Permit>} />
        <Route path="audit" element={<Permit permission={["audit.read"]}><AuditPage /></Permit>} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="search" element={<SearchPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
