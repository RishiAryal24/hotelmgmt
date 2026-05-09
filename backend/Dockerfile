FROM python:3.12-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

COPY backend/requirements.txt .
RUN python -m pip install --upgrade pip setuptools wheel && \
    python -m pip install --no-cache-dir -r requirements.txt

COPY backend/ .

RUN python manage.py collectstatic --noinput

EXPOSE 8000
CMD ["sh", "-c", "gunicorn hotelmgmt.wsgi:application --bind 0.0.0.0:${PORT:-8000} --workers 3"]
