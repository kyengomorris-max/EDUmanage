"""Optional read-only analytics for EduManage.

This service summarises academic and administrative records.
It does not make medical, psychological, or behavioural predictions.
Run it only against a database the caller is allowed to read.
"""

import os
from collections import defaultdict

import psycopg
from fastapi import FastAPI, HTTPException

app = FastAPI(title="EduManage analytics")


def connect():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise HTTPException(status_code=503, detail="DATABASE_URL is not configured.")
    return psycopg.connect(url)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/schools/{school_id}/attendance")
def attendance(school_id: str):
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT s.date::text, r.status, COUNT(*)
            FROM "AttendanceRecord" r
            JOIN "AttendanceSession" s ON s.id = r."sessionId"
            WHERE s."schoolId" = %s
            GROUP BY s.date, r.status
            ORDER BY s.date
            """,
            (school_id,),
        )
        rows = [{"date": date, "status": status, "count": count} for date, status, count in cur.fetchall()]
    return {"schoolId": school_id, "rows": rows}


@app.get("/schools/{school_id}/performance")
def performance(school_id: str):
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT sub.name, AVG(sc.score / NULLIF(p."maxScore", 0) * 100)
            FROM "ExamScore" sc
            JOIN "ExamPaper" p ON p.id = sc."examPaperId"
            JOIN "Exam" e ON e.id = p."examId"
            JOIN "Subject" sub ON sub.id = p."subjectId"
            WHERE e."schoolId" = %s
            GROUP BY sub.name
            ORDER BY sub.name
            """,
            (school_id,),
        )
        rows = [{"subject": name, "averagePercent": round(float(avg or 0), 1)} for name, avg in cur.fetchall()]
    return {"schoolId": school_id, "subjects": rows}


@app.get("/schools/{school_id}/declining")
def declining(school_id: str):
    """Students whose later subject average is at least 10 points below an earlier one."""
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT st.id, u."firstName", u."lastName", e."startDate",
                   AVG(sc.score / NULLIF(p."maxScore", 0) * 100)
            FROM "ExamScore" sc
            JOIN "ExamPaper" p ON p.id = sc."examPaperId"
            JOIN "Exam" e ON e.id = p."examId"
            JOIN "Student" st ON st.id = sc."studentId"
            JOIN "User" u ON u.id = st."userId"
            WHERE e."schoolId" = %s
            GROUP BY st.id, u."firstName", u."lastName", e."startDate"
            ORDER BY e."startDate"
            """,
            (school_id,),
        )
        series: dict[str, list[float]] = defaultdict(list)
        names: dict[str, str] = {}
        for student_id, first, last, _start, avg in cur.fetchall():
            series[student_id].append(float(avg or 0))
            names[student_id] = f"{first} {last}"
    flagged = []
    for student_id, scores in series.items():
        if len(scores) >= 2 and scores[-1] <= scores[0] - 10:
            flagged.append({"studentId": student_id, "name": names[student_id], "earlier": round(scores[0], 1), "later": round(scores[-1], 1)})
    return {"schoolId": school_id, "students": flagged}
