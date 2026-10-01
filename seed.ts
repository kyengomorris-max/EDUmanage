import bcrypt from "bcryptjs";
import { PERMISSIONS, ROLE_PERMISSIONS, ROLES } from "@edumanage/shared";
import { PrismaClient, type Weekday } from "@prisma/client";

const prisma = new PrismaClient();
const PASSWORD = "Demo@12345";

async function catalog() {
  for (const [key, description] of PERMISSIONS) {
    await prisma.permission.upsert({ where: { key }, update: { description }, create: { key, description } });
  }
  for (const [key, name, description] of ROLES) {
    const role = await prisma.role.upsert({ where: { key }, update: { name, description }, create: { key, name, description } });
    const permissions = await prisma.permission.findMany({ where: { key: { in: [...ROLE_PERMISSIONS[key]] } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })) });
  }
}

async function roleId(key: string) {
  const role = await prisma.role.findUniqueOrThrow({ where: { key } });
  return role.id;
}

async function main() {
  await catalog();
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  await prisma.platformSetting.upsert({
    where: { key: "branding.name" },
    update: { value: "EduManage" },
    create: { key: "branding.name", value: "EduManage" },
  });
  await prisma.platformSetting.upsert({
    where: { key: "branding.tagline" },
    update: { value: "Smarter School Management. Better Learning." },
    create: { key: "branding.tagline", value: "Smarter School Management. Better Learning." },
  });
  await prisma.platformSetting.upsert({
    where: { key: "landing.stats" },
    update: { value: { students: 2500, teachers: 150, classes: 40, attendance: 98 } },
    create: { key: "landing.stats", value: { students: 2500, teachers: 150, classes: 40, attendance: 98 } },
  });

  const existing = await prisma.school.findUnique({ where: { code: "GREENFIELD" } });
  if (existing) await prisma.school.delete({ where: { id: existing.id } });

  const superRole = await roleId("SUPER_ADMIN");
  await prisma.user.upsert({
    where: { email: "super@edumanage.dev" },
    update: { passwordHash, status: "ACTIVE", emailVerifiedAt: new Date() },
    create: {
      email: "super@edumanage.dev",
      passwordHash,
      firstName: "Platform",
      lastName: "Owner",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
      roles: { create: { roleId: superRole } },
    },
  });

  const school = await prisma.school.create({
    data: {
      name: "Greenfield Academy",
      code: "GREENFIELD",
      motto: "Knowledge, character, and courage.",
      address: "14 Academy Road, Nairobi",
      phone: "+254 700 000 000",
      email: "office@greenfield.demo",
      website: "https://greenfield.demo",
      primaryColor: "#2563EB",
      timezone: "Africa/Nairobi",
      isDemo: true,
      settings: { create: { key: "academics.computePositions", value: true } },
    },
  });

  const year = await prisma.academicYear.create({
    data: { schoolId: school.id, name: "2026", startDate: new Date("2026-01-06"), endDate: new Date("2026-11-20"), isCurrent: true },
  });
  const terms = [];
  for (const [name, start, end, current] of [
    ["Term 1", "2026-01-06", "2026-04-10", true],
    ["Term 2", "2026-05-04", "2026-08-07", false],
    ["Term 3", "2026-08-31", "2026-11-20", false],
  ] as const) {
    terms.push(await prisma.term.create({ data: { schoolId: school.id, academicYearId: year.id, name, startDate: new Date(start), endDate: new Date(end), isCurrent: current } }));
  }

  const levels = [];
  for (const [name, sortOrder] of [["Form 1", 1], ["Form 2", 2], ["Form 3", 3]] as const) {
    levels.push(await prisma.classLevel.create({ data: { schoolId: school.id, name, sortOrder } }));
  }
  const east = await prisma.stream.create({ data: { schoolId: school.id, name: "East" } });
  const west = await prisma.stream.create({ data: { schoolId: school.id, name: "West" } });

  async function makeUser(email: string, firstName: string, lastName: string, role: string, phone?: string) {
    return prisma.user.create({
      data: {
        schoolId: school.id,
        email,
        passwordHash,
        firstName,
        lastName,
        phone,
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
        roles: { create: { roleId: await roleId(role) } },
      },
    });
  }

  const admin = await makeUser("admin@greenfield.demo", "Amara", "Okonkwo", "SCHOOL_ADMIN", "+254 711 100 001");
  const principal = await makeUser("principal@greenfield.demo", "David", "Mwangi", "PRINCIPAL", "+254 711 100 002");
  await prisma.staff.createMany({
    data: [
      { schoolId: school.id, userId: admin.id, staffNumber: "S-001", jobTitle: "School Administrator", department: "Administration" },
      { schoolId: school.id, userId: principal.id, staffNumber: "S-002", jobTitle: "Principal", department: "Leadership" },
    ],
  });

  const teacherSpecs = [
    ["Grace", "Adebayo", "grace.adebayo@greenfield.demo", "T-001", "B.Ed Mathematics", "Mathematics"],
    ["Samuel", "Kimani", "samuel.kimani@greenfield.demo", "T-002", "B.A. English", "English"],
    ["Fatima", "Hassan", "fatima.hassan@greenfield.demo", "T-003", "B.Sc Biology", "Biology"],
    ["Peter", "Otieno", "peter.otieno@greenfield.demo", "T-004", "B.Ed History", "History"],
    ["Linda", "Njeri", "linda.njeri@greenfield.demo", "T-005", "B.Sc Physics", "Physics"],
  ] as const;
  const teachers = [];
  for (const [first, last, email, staffNumber, qualifications] of teacherSpecs) {
    const user = await makeUser(email, first, last, "TEACHER");
    teachers.push(await prisma.teacher.create({ data: { schoolId: school.id, userId: user.id, staffNumber, qualifications, employmentType: "FULL_TIME", hireDate: new Date("2022-01-10") } }));
  }

  const subjectSpecs = [
    ["Mathematics", "MATH"],
    ["English", "ENG"],
    ["Kiswahili", "KIS"],
    ["Biology", "BIO"],
    ["Physics", "PHY"],
    ["History", "HIS"],
    ["Geography", "GEO"],
    ["Computer Studies", "COMP"],
  ] as const;
  const subjects = [];
  for (const [name, code] of subjectSpecs) subjects.push(await prisma.subject.create({ data: { schoolId: school.id, name, code } }));

  const sectionPlan = [
    [levels[0], east, "Form 1 East", teachers[0]],
    [levels[0], west, "Form 1 West", teachers[1]],
    [levels[1], east, "Form 2 East", teachers[2]],
    [levels[1], west, "Form 2 West", teachers[3]],
    [levels[2], east, "Form 3 East", teachers[4]],
  ] as const;
  const sections = [];
  for (const [level, stream, name, teacher] of sectionPlan) {
    sections.push(await prisma.classSection.create({
      data: { schoolId: school.id, classLevelId: level.id, streamId: stream.id, academicYearId: year.id, name, classTeacherId: teacher.id, room: `R-${sections.length + 1}`, capacity: 40 },
    }));
  }

  const subjectByCode = Object.fromEntries(subjects.map((subject) => [subject.code, subject]));
  const teaching = [
    [teachers[0], "MATH"],
    [teachers[1], "ENG"],
    [teachers[2], "BIO"],
    [teachers[3], "HIS"],
    [teachers[4], "PHY"],
  ] as const;
  for (const section of sections) {
    for (const subject of subjects) {
      await prisma.classSubject.create({ data: { classSectionId: section.id, subjectId: subject.id } });
    }
    for (const [teacher, code] of teaching) {
      await prisma.teachingAssignment.create({ data: { schoolId: school.id, teacherId: teacher.id, classSectionId: section.id, subjectId: subjectByCode[code].id } });
    }
  }

  const studentNames = [
    ["Amina", "Hassan"], ["Brian", "Otieno"], ["Chloe", "Wanjiru"], ["Daniel", "Kamau"],
    ["Esther", "Njoki"], ["Felix", "Mutiso"], ["Gloria", "Achieng"], ["Hassan", "Ali"],
    ["Imani", "Barasa"], ["James", "Kiptoo"], ["Karen", "Mwende"], ["Leo", "Odhiambo"],
    ["Mercy", "Chebet"], ["Nelson", "Ouma"], ["Olivia", "Wairimu"], ["Patrick", "Maina"],
    ["Queenie", "Adhiambo"], ["Robert", "Njoroge"], ["Sofia", "Mohamed"], ["Timothy", "Langat"],
  ] as const;
  const students = [];
  for (let index = 0; index < studentNames.length; index += 1) {
    const [first, last] = studentNames[index];
    const user = await makeUser(`student${String(index + 1).padStart(2, "0")}@greenfield.demo`, first, last, "STUDENT");
    const student = await prisma.student.create({
      data: {
        schoolId: school.id,
        userId: user.id,
        admissionNumber: `GFA-2026-${String(index + 1).padStart(3, "0")}`,
        gender: index % 2 === 0 ? "FEMALE" : "MALE",
        dateOfBirth: new Date(Date.UTC(2010, index % 12, (index % 27) + 1)),
        address: "Nairobi",
        emergencyName: "School office",
        emergencyPhone: "+254 700 000 000",
        bloodGroup: index % 3 === 0 ? "O+" : "A+",
        allergies: index === 2 ? "Peanuts" : null,
      },
    });
    const section = sections[index % sections.length];
    await prisma.enrollment.create({ data: { schoolId: school.id, studentId: student.id, classSectionId: section.id, academicYearId: year.id } });
    students.push(student);
  }

  const parentNames = [
    ["Jane", "Hassan", "parent1@greenfield.demo"],
    ["Joseph", "Otieno", "parent2@greenfield.demo"],
    ["Mary", "Kamau", "parent3@greenfield.demo"],
    ["Ali", "Barasa", "parent4@greenfield.demo"],
    ["Ruth", "Chebet", "parent5@greenfield.demo"],
  ] as const;
  for (let index = 0; index < parentNames.length; index += 1) {
    const [first, last, email] = parentNames[index];
    const user = await makeUser(email, first, last, "PARENT");
    const guardian = await prisma.guardian.create({ data: { schoolId: school.id, userId: user.id, occupation: "Business" } });
    for (let child = index * 4; child < index * 4 + 4 && child < students.length; child += 1) {
      await prisma.studentGuardian.create({ data: { studentId: students[child].id, guardianId: guardian.id, relationship: index % 2 ? "Father" : "Mother", isPrimary: true } });
    }
  }

  const accountant = await makeUser("accounts@greenfield.demo", "Helen", "Awuor", "ACCOUNTANT");
  const librarian = await makeUser("library@greenfield.demo", "Mark", "Kariuki", "LIBRARIAN");
  await prisma.staff.createMany({
    data: [
      { schoolId: school.id, userId: accountant.id, staffNumber: "S-010", jobTitle: "Accountant", department: "Finance" },
      { schoolId: school.id, userId: librarian.id, staffNumber: "S-011", jobTitle: "Librarian", department: "Library" },
    ],
  });

  const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] as Weekday[];
  const times: [string, string][] = [["08:00", "08:40"], ["08:40", "09:20"], ["09:40", "10:20"], ["10:20", "11:00"], ["11:20", "12:00"]];
  const slots: { schoolId: string; classSectionId: string; subjectId: string; teacherId: string; day: Weekday; startTime: string; endTime: string; room: string | null }[] = [];
  for (const section of sections) {
    days.forEach((day, dayIndex) => {
      times.forEach((time, period) => {
        const subject = subjects[(dayIndex + period) % subjects.length];
        const teacher = teachers[(dayIndex + period) % teachers.length];
        slots.push({
          schoolId: school.id,
          classSectionId: section.id,
          subjectId: subject.id,
          teacherId: teacher.id,
          day,
          startTime: time[0],
          endTime: time[1],
          room: section.room,
        });
      });
    });
  }
  await prisma.timetableSlot.createMany({ data: slots });

  await prisma.gradeScale.create({
    data: {
      schoolId: school.id,
      name: "Secondary scale",
      isDefault: true,
      bands: {
        create: [
          { minScore: 80, maxScore: 100, letter: "A", points: 12, remark: "Excellent", sortOrder: 1 },
          { minScore: 70, maxScore: 79, letter: "B", points: 10, remark: "Very good", sortOrder: 2 },
          { minScore: 60, maxScore: 69, letter: "C", points: 8, remark: "Good", sortOrder: 3 },
          { minScore: 50, maxScore: 59, letter: "D", points: 6, remark: "Pass", sortOrder: 4 },
          { minScore: 0, maxScore: 49, letter: "E", points: 4, remark: "Needs improvement", sortOrder: 5 },
        ],
      },
    },
  });

  const examType = await prisma.examType.create({ data: { schoolId: school.id, name: "Midterm" } });
  const exam = await prisma.exam.create({
    data: { schoolId: school.id, name: "Term 1 Midterm", examTypeId: examType.id, academicYearId: year.id, termId: terms[0].id, startDate: new Date("2026-03-02"), endDate: new Date("2026-03-06") },
  });
  for (const section of sections.slice(0, 2)) {
    for (const code of ["MATH", "ENG", "BIO"]) {
      const paper = await prisma.examPaper.create({ data: { examId: exam.id, subjectId: subjectByCode[code].id, classSectionId: section.id, maxScore: 100, examDate: new Date("2026-03-03") } });
      const enrolled = await prisma.enrollment.findMany({ where: { classSectionId: section.id } });
      for (const [offset, enrollment] of enrolled.entries()) {
        const score = 48 + ((offset * 7 + code.length * 3) % 52);
        await prisma.examScore.create({ data: { examPaperId: paper.id, studentId: enrollment.studentId, score, enteredById: admin.id } });
      }
    }
  }

  for (let day = 1; day <= 10; day += 1) {
    const date = new Date(Date.UTC(2026, 2, day));
    if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue;
    for (const section of sections) {
      const session = await prisma.attendanceSession.create({ data: { schoolId: school.id, classSectionId: section.id, date, takenById: admin.id } });
      const enrolled = await prisma.enrollment.findMany({ where: { classSectionId: section.id } });
      for (const [offset, enrollment] of enrolled.entries()) {
        const roll = (day + offset) % 11;
        const status = roll === 0 ? "ABSENT" : roll === 1 ? "LATE" : "PRESENT";
        await prisma.attendanceRecord.create({ data: { sessionId: session.id, studentId: enrollment.studentId, status, reason: status === "ABSENT" ? "Unwell" : null } });
      }
    }
  }

  const tuition = await prisma.feeStructure.create({
    data: {
      schoolId: school.id,
      academicYearId: year.id,
      classLevelId: levels[0].id,
      name: "Form 1 tuition",
      items: { create: [{ name: "Tuition", amount: 45000 }, { name: "Activity", amount: 3000 }] },
    },
  });
  const formOne = students.filter((_, index) => index % sections.length < 2);
  for (const [index, student] of formOne.entries()) {
    const invoice = await prisma.invoice.create({
      data: {
        schoolId: school.id,
        studentId: student.id,
        academicYearId: year.id,
        termId: terms[0].id,
        number: `INV-2026-${String(index + 1).padStart(4, "0")}`,
        dueDate: new Date("2026-02-15"),
        status: index % 4 === 0 ? "PAID" : index % 4 === 1 ? "PARTIAL" : index % 4 === 2 ? "OVERDUE" : "PENDING",
        discount: index === 0 ? 5000 : 0,
        discountReason: index === 0 ? "Merit scholarship" : null,
        lines: { create: [{ description: "Tuition", amount: 45000 }, { description: "Activity", amount: 3000 }] },
      },
    });
    if (index % 4 === 0) {
      await prisma.payment.create({ data: { schoolId: school.id, invoiceId: invoice.id, amount: 43000, method: "BANK", receiptNumber: `RCT-2026-${index + 1}`, receivedById: accountant.id, reference: "BANK-100" } });
    } else if (index % 4 === 1) {
      await prisma.payment.create({ data: { schoolId: school.id, invoiceId: invoice.id, amount: 20000, method: "MOBILE", receiptNumber: `RCT-2026-${index + 1}`, receivedById: accountant.id, reference: "MPESA-200" } });
    }
  }
  await prisma.scholarship.create({ data: { schoolId: school.id, studentId: students[0].id, academicYearId: year.id, name: "Merit scholarship", amount: 5000, notes: "Development sample scholarship" } });

  const assignment = await prisma.assignment.create({
    data: {
      schoolId: school.id,
      classSectionId: sections[0].id,
      subjectId: subjectByCode.MATH.id,
      teacherId: teachers[0].id,
      title: "Algebra practice set",
      instructions: "Complete questions 1 to 8 in your exercise book and upload a clear photo or PDF.",
      dueAt: new Date("2026-04-20T16:00:00Z"),
      maxScore: 20,
    },
  });
  const firstClass = await prisma.enrollment.findMany({ where: { classSectionId: sections[0].id }, take: 2 });
  if (firstClass[0]) {
    await prisma.submission.create({ data: { assignmentId: assignment.id, studentId: firstClass[0].studentId, body: "Submitted in class.", status: "SUBMITTED" } });
  }
  await prisma.assignment.create({
    data: {
      schoolId: school.id,
      classSectionId: sections[1].id,
      subjectId: subjectByCode.ENG.id,
      teacherId: teachers[1].id,
      title: "Narrative essay",
      instructions: "Write 400 words about a journey that changed your mind.",
      dueAt: new Date("2026-04-18T16:00:00Z"),
      maxScore: 30,
    },
  });

  await prisma.announcement.createMany({
    data: [
      { schoolId: school.id, title: "Term 1 midterm timetable", body: "Midterm exams run from 2 March to 6 March. Students should be in school by 7:30.", priority: "HIGH", audienceType: "SCHOOL", authorId: principal.id },
      { schoolId: school.id, title: "Fee reminder", body: "Outstanding Term 1 balances should be cleared before the end of the month.", priority: "NORMAL", audienceType: "ROLE", audienceRole: "PARENT", authorId: accountant.id },
      { schoolId: school.id, title: "Form 1 East laboratory session", body: "Bring your lab coat on Thursday.", priority: "NORMAL", audienceType: "CLASS", classSectionId: sections[0].id, authorId: teachers[2].userId },
    ],
  });

  await prisma.event.createMany({
    data: [
      { schoolId: school.id, name: "Sports Day", description: "House athletics on the main field.", startsAt: new Date("2026-05-16T08:00:00Z"), location: "Main field", organizerId: principal.id, audienceType: "SCHOOL" },
      { schoolId: school.id, name: "Parents Meeting", description: "Term 1 academic review with class teachers.", startsAt: new Date("2026-04-24T13:00:00Z"), location: "School hall", organizerId: principal.id, audienceType: "ROLE", audienceRole: "PARENT" },
      { schoolId: school.id, name: "Academic Day", description: "Project exhibitions by Form 2 and Form 3.", startsAt: new Date("2026-06-12T09:00:00Z"), location: "Classrooms", organizerId: admin.id, audienceType: "SCHOOL" },
    ],
  });

  const fiction = await prisma.bookCategory.create({ data: { schoolId: school.id, name: "Fiction" } });
  const reference = await prisma.bookCategory.create({ data: { schoolId: school.id, name: "Reference" } });
  const books = await Promise.all([
    ["Things Fall Apart", "Chinua Achebe", fiction.id, 4],
    ["The River Between", "Ngũgĩ wa Thiong'o", fiction.id, 3],
    ["Long Walk to Freedom", "Nelson Mandela", fiction.id, 2],
    ["Secondary Mathematics", "KLB", reference.id, 12],
    ["Oxford English Dictionary", "Oxford", reference.id, 2],
    ["Biology for Secondary Schools", "KIE", reference.id, 8],
  ].map(([title, author, categoryId, quantity]) => prisma.book.create({
    data: { schoolId: school.id, title: String(title), author: String(author), categoryId: String(categoryId), quantity: Number(quantity), available: Number(quantity) },
  })));
  await prisma.book.update({ where: { id: books[0].id }, data: { available: 3 } });
  await prisma.bookLoan.create({ data: { schoolId: school.id, bookId: books[0].id, borrowerId: students[0].userId, dueAt: new Date("2026-04-30"), status: "BORROWED" } });
  await prisma.book.update({ where: { id: books[1].id }, data: { available: 2 } });
  await prisma.bookLoan.create({ data: { schoolId: school.id, bookId: books[1].id, borrowerId: students[1].userId, dueAt: new Date("2026-02-01"), status: "OVERDUE" } });

  await prisma.disciplineRecord.create({
    data: {
      schoolId: school.id,
      studentId: students[5].id,
      incident: "Repeated late arrival",
      description: "Arrived after first lesson three times this month.",
      actionTaken: "Spoken with the class teacher. Parent to be informed.",
      occurredOn: new Date("2026-03-12"),
      reportedById: teachers[0].userId,
      status: "OPEN",
    },
  });

  const parent = await prisma.user.findUniqueOrThrow({ where: { email: "parent1@greenfield.demo" } });
  const teacherUser = await prisma.user.findUniqueOrThrow({ where: { email: "grace.adebayo@greenfield.demo" } });
  await prisma.message.create({
    data: {
      schoolId: school.id,
      senderId: parent.id,
      recipientId: teacherUser.id,
      subject: "Question about algebra homework",
      body: "Good afternoon. Could you confirm whether question 6 is due this Friday?",
    },
  });

  await prisma.notification.create({
    data: { schoolId: school.id, userId: admin.id, type: "SYSTEM", title: "Welcome to the Greenfield demo", body: "This school is loaded with development sample data.", link: "/app" },
  });

  console.log("Development seed complete.");
  console.log("Demo password for every sample account: Demo@12345");
  console.log("Administrator: admin@greenfield.demo");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
