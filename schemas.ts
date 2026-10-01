import { z } from "zod";
import { ANNOUNCEMENT_PRIORITIES, ATTENDANCE_STATUSES, AUDIENCE_TYPES, GENDERS, PAYMENT_METHODS, WEEKDAYS } from "./constants.js";

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(128)
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/[0-9]/, "Include a number");

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export const registerSchoolSchema = z.object({
  schoolName: z.string().trim().min(2, "Enter the school name").max(120),
  adminFirstName: z.string().trim().min(1, "Enter a first name").max(60),
  adminLastName: z.string().trim().min(1, "Enter a last name").max(60),
  email: z.string().email("Enter a valid email address"),
  password: passwordSchema,
  phone: z.string().trim().max(30).optional().or(z.literal("")),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: passwordSchema,
});

const optionalText = z.string().trim().max(500).optional().or(z.literal(""));

export const studentSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(60),
  lastName: z.string().trim().min(1, "Last name is required").max(60),
  email: z.string().email("Enter a valid email"),
  phone: optionalText,
  gender: z.enum(GENDERS).default("UNSPECIFIED"),
  dateOfBirth: z.string().optional().or(z.literal("")),
  address: optionalText,
  admissionNumber: z.string().trim().max(40).optional().or(z.literal("")),
  classSectionId: z.string().uuid("Choose a class").optional().or(z.literal("")),
  bloodGroup: optionalText,
  allergies: optionalText,
  medicalNotes: optionalText,
  emergencyName: optionalText,
  emergencyPhone: optionalText,
  guardianFirstName: optionalText,
  guardianLastName: optionalText,
  guardianEmail: z.string().email().optional().or(z.literal("")),
  guardianPhone: optionalText,
  guardianRelationship: optionalText,
  guardianOccupation: optionalText,
});

export const teacherSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(60),
  lastName: z.string().trim().min(1, "Last name is required").max(60),
  email: z.string().email("Enter a valid email"),
  phone: optionalText,
  staffNumber: z.string().trim().max(40).optional().or(z.literal("")),
  qualifications: optionalText,
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT"]).default("FULL_TIME"),
  hireDate: z.string().optional().or(z.literal("")),
});

export const attendanceMarkSchema = z.object({
  classSectionId: z.string().uuid(),
  date: z.string().min(8),
  records: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        status: z.enum(ATTENDANCE_STATUSES),
        reason: z.string().trim().max(300).optional().or(z.literal("")),
      }),
    )
    .min(1, "Mark at least one student"),
});

export const scoreEntrySchema = z.object({
  scores: z.array(
    z.object({
      studentId: z.string().uuid(),
      score: z.number().min(0).max(1000),
      remarks: z.string().trim().max(300).optional().or(z.literal("")),
    }),
  ),
});

export const gradeScaleSchema = z.object({
  name: z.string().trim().min(2).max(80),
  bands: z
    .array(
      z.object({
        minScore: z.number().min(0).max(100),
        maxScore: z.number().min(0).max(100),
        letter: z.string().trim().min(1).max(4),
        points: z.number().min(0).max(20).optional(),
        remark: z.string().trim().max(80).optional().or(z.literal("")),
      }),
    )
    .min(1, "Add at least one grade band"),
});

export const paymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().positive("Enter an amount greater than zero"),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().trim().max(80).optional().or(z.literal("")),
  notes: z.string().trim().max(300).optional().or(z.literal("")),
  paidAt: z.string().optional().or(z.literal("")),
});

export const announcementSchema = z.object({
  title: z.string().trim().min(2, "Add a title").max(160),
  body: z.string().trim().min(2, "Write the announcement").max(8000),
  priority: z.enum(ANNOUNCEMENT_PRIORITIES).default("NORMAL"),
  audienceType: z.enum(AUDIENCE_TYPES).default("SCHOOL"),
  audienceRole: z.string().trim().max(40).optional().or(z.literal("")),
  classSectionId: z.string().uuid().optional().or(z.literal("")),
});

export const messageSchema = z.object({
  recipientId: z.string().uuid("Choose a recipient"),
  subject: z.string().trim().min(1, "Add a subject").max(160),
  body: z.string().trim().min(1, "Write a message").max(8000),
  parentId: z.string().uuid().optional().or(z.literal("")),
});

export const eventSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().min(2).max(8000),
  startsAt: z.string().min(8),
  endsAt: z.string().optional().or(z.literal("")),
  location: z.string().trim().max(160).optional().or(z.literal("")),
  audienceType: z.enum(AUDIENCE_TYPES).default("SCHOOL"),
  audienceRole: z.string().trim().max(40).optional().or(z.literal("")),
  classSectionId: z.string().uuid().optional().or(z.literal("")),
});

export const timetableSlotSchema = z.object({
  classSectionId: z.string().uuid(),
  subjectId: z.string().uuid(),
  teacherId: z.string().uuid().optional().or(z.literal("")),
  day: z.enum(WEEKDAYS),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
  room: z.string().trim().max(40).optional().or(z.literal("")),
});

export const schoolProfileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  motto: z.string().trim().max(180).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  website: z.string().trim().max(180).optional().or(z.literal("")),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Use a hex colour such as #2563EB"),
  timezone: z.string().trim().min(2).max(60),
});

export const preferencesSchema = z.object({
  themePreference: z.enum(["light", "dark", "system"]).optional(),
  sidebarCollapsed: z.boolean().optional(),
  notifyInApp: z.boolean().optional(),
  notifyEmail: z.boolean().optional(),
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().min(1).max(60).optional(),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
});
