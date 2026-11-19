FROM python:3.12-slim

# Ограничения сандбоксинга CAD-файлов (RULES § 5.5).
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    CAD_MAX_FILE_SIZE_MB=50 \
    CAD_PARSE_TIMEOUT_SEC=30

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && addgroup --system vwc \
    && adduser --system --ingroup vwc --no-create-home vwc

COPY app ./app

# Разбор пользовательских файлов выполняется от непривилегированного пользователя.
USER vwc

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
