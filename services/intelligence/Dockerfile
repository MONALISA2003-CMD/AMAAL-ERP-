FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONPATH=/app/services/intelligence
WORKDIR /app
COPY services/intelligence /app/services/intelligence
RUN pip install --no-cache-dir -r /app/services/intelligence/requirements.lock
EXPOSE 8091
CMD ["python", "-m", "amaal_intelligence.server"]
