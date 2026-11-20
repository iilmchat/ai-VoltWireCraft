FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && addgroup --system vwc \
    && adduser --system --ingroup vwc --no-create-home vwc

COPY app ./app
USER vwc

EXPOSE 5004
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5004"]
