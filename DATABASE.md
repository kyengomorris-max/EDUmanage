# Database

PostgreSQL is the system of record. Prisma schema: `backend/prisma/schema.prisma`.

Every school-owned row carries `schoolId`. Super administrators are the only users without a school. API queries add that school id from the signed-in user, or from the `x-school-id` header when the caller is a super administrator. A teacher, parent, or accountant cannot pass another school's id.

## People

- `User` is the login. Passwords are bcrypt hashes.
- `Role`, `Permission`, `RolePermission`, and `UserRole` implement access.
- `Student`, `Teacher`, `Guardian`, and `Staff` are profiles on a user.
- `StudentGuardian` links a child to one or more parents.

## Academics

- `AcademicYear` and `Term`
- `ClassLevel` (Form 1) and `Stream` (East)
- `ClassSection` is the operating class, such as Form 1 East
- `Subject`, `ClassSubject`, `TeachingAssignment`
- `Enrollment`
- `TimetableSlot`
- `GradeScale` and `GradeBand` — letter grades are data, not hard-coded rules
- `Exam`, `ExamType`, `ExamPaper`, `ExamScore`
- `ReportCard` stores teacher and principal remarks

## Attendance, money, learning

- `AttendanceSession` and `AttendanceRecord`
- `FeeStructure`, `FeeItem`, `Invoice`, `InvoiceLine`, `Payment`, `Scholarship`
- `Assignment`, `AssignmentAttachment`, `Submission`
- `LearningMaterial`

## School life

- `Announcement`, `Notification`, `Message`, `Event`
- `BookCategory`, `Book`, `BookLoan`
- `DisciplineRecord`
- `Document`
- `AuditLog`
- `SchoolSetting` and `PlatformSetting`

Primary keys are UUIDs. Foreign keys cascade when the parent school or record is removed, and actor references such as "entered by" use `ON DELETE SET NULL` so history can remain. Unique keys cover email, admission numbers per school, one attendance register per class per day, and one score per student per paper.

Timestamps: `createdAt` and `updatedAt` on records that change.
