# API

Base URL: `/api`

Successful JSON:

```json
{ "success": true, "data": {}, "meta": { "page": 1, "pageSize": 20, "total": 42 } }
```

Errors:

```json
{ "success": false, "error": { "code": "FORBIDDEN", "message": "You do not have permission to do that." } }
```

| Status | Meaning |
| --- | --- |
| 401 | Sign in is required, or the session expired |
| 403 | The role cannot do this, or the record belongs to someone else |
| 404 | The record does not exist in this school |
| 409 | A unique value such as email already exists |
| 422 | Validation failed. `details` lists the fields |
| 429 | Too many sign-in or reset attempts |

Send `Authorization: Bearer <accessToken>` after login. The refresh token is an HTTP-only cookie on `/api/auth`.

Lists accept `page`, `pageSize` (max 100), `search`, `sort`, and `dir`.

Super administrators send `x-school-id` after choosing a school.

## Authentication

| Method | Path | Body | Auth |
| --- | --- | --- | --- |
| POST | `/auth/login` | `email`, `password` | Public |
| POST | `/auth/refresh` | cookie | Cookie |
| POST | `/auth/logout` | — | Yes |
| POST | `/auth/forgot-password` | `email` | Public |
| POST | `/auth/reset-password` | `token`, `password` | Public |
| POST | `/auth/verify-email` | `token` | Public |
| POST | `/auth/register-school` | school and administrator fields | Public |
| GET | `/auth/me` | — | Yes |
| PATCH | `/auth/me` | name, theme, notification flags | Yes |
| POST | `/auth/change-password` | `currentPassword`, `newPassword` | Yes |
| GET | `/auth/sessions` | — | Yes |
| DELETE | `/auth/sessions/:id` | — | Yes |

## Public

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/public/branding` | Name, tagline, landing statistics |
| GET | `/public/demo-accounts` | Sample logins when demo mode is on |
| GET | `/health` | Process check |

## School records

All of these require a signed-in user and the matching permission. Writes are rejected for roles that only have read access. Students and parents only receive their own children.

| Area | Endpoints |
| --- | --- |
| Students | `GET/POST /students`, `GET/PATCH/DELETE /students/:id`, plus `/attendance`, `/academics`, `/fees`, `/assignments`, `/documents`, `/discipline` |
| Teachers | `GET/POST /teachers`, `GET/PATCH /teachers/:id`, `GET /teachers/:id/timetable` |
| Users | `GET/POST /users`, `PATCH /users/:id/status`, `PUT /users/:id/roles`, `GET/POST /users/schools` |
| Academics | `/academic-years`, `/terms`, `/class-levels`, `/streams`, `/classes`, `/classes/:id/enroll`, `/subjects`, `/subjects/:id/assign`, `/timetable` |
| Attendance | `GET /attendance?classSectionId&date`, `POST /attendance`, `GET /attendance/summary` |
| Exams | `/exam-types`, `/exams`, `/exams/:id/papers`, `/exam-papers/:id`, `PUT /exam-papers/:id/scores`, `GET/POST /results`, `/grade-scales`, `/report-cards/:studentId`, `/report-cards/:studentId/pdf` |
| Fees | `/fees/structures`, `/fees/invoices`, `/fees/invoices/generate`, `/fees/payments`, `/fees/payments/:id/receipt`, `/fees/scholarships`, `/fees/summary` |
| Learning | `/assignments`, `/assignments/:id/submit`, `PATCH /submissions/:id`, `/materials` |
| Communication | `/announcements`, `/notifications`, `/messages`, `/messages/recipients`, `/events` |
| Library | `/library/books`, `/library/loans`, `/library/loans/:id/return`, `/library/summary` |
| Records | `/discipline`, `/documents`, `/files/:name` |
| Insight | `/dashboard`, `/search?q`, `/reports/:type?format=json\|xlsx\|pdf`, `/settings/school`, `/settings/academic`, `/audit-logs` |

Report types: `enrollment`, `attendance`, `performance`, `fees`, `outstanding`, `workload`, `library`, `discipline`, `assignments`.

File uploads reject executable extensions and unknown MIME types. Downloads are sent as attachments.

Deleting a student deactivates the account. It does not erase the academic history.
