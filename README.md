# Analytics service

Optional Python service for attendance totals, subject averages, and a simple comparison of earlier and later exam averages.

It reads PostgreSQL. It does not replace the API, and it does not score wellbeing, behaviour, or health.

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
set DATABASE_URL=postgresql://edumanage:edumanage@localhost:5432/edumanage
uvicorn app:app --port 4100
```

Set `ANALYTICS_URL=http://localhost:4100` on the API if a future client wants to call it. The web dashboards already compute their charts in the Node API.
