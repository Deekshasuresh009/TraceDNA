FROM python:3.11-slim

# Prevent Python from writing .pyc files and enable unbuffered stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install system dependencies (ffmpeg required for video chunking)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg \
        libpq-dev \
        gcc \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy project files
COPY . .

# Collect static files
RUN python manage.py collectstatic --noinput || true

# Create non-root user for security
RUN addgroup --system appgroup && \
    adduser --system --ingroup appgroup appuser
# USER appuser

EXPOSE 8000

CMD ["gunicorn", "tracedna.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "4", "--timeout", "120"]
