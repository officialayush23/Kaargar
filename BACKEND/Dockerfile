# Local development only. Render deployment uses its native Python runtime
# (pip install -r requirements.txt + a start command in the dashboard) for
# the web service AND the two Background Worker services (celery worker,
# celery beat) — see DEPLOYMENT_TODO.md. This file is not part of that path.
#
# It exists so `docker-compose up` can run the whole stack (api + celery
# worker + celery beat + redis) on a dev machine with one command, using the
# exact same code and dependencies as production.

FROM python:3.11-slim

WORKDIR /app

# If the build ever fails on a missing-wheel/compiler error for cryptography,
# cffi, or bcrypt (rare on linux/amd64, more likely on linux/arm64), uncomment:
# RUN apt-get update && apt-get install -y --no-install-recommends gcc && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Overridden per-service in docker-compose.yml (celery worker / celery beat
# use a different command; this is just the default if run standalone).
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
