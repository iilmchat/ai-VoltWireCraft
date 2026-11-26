FROM python:3.12-slim AS cad-tools

# LibreDWG отсутствует в стандартных репозиториях Debian — собираем dwg2dxf из исходников.
# `--enable-release` требует GNU plotutils (libplot + plot.h) для dwgplot в build stage.
# Пакеты нужны только на этапе сборки: в runtime копируются лишь dwg2dxf/dxf2dwg/libredwg.
# HTTPS-источники apt: зеркало по HTTP недоступно в CI/изолированных средах.
RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list /etc/apt/sources.list.d/* 2>/dev/null || true \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential autoconf automake libtool texinfo perl git ca-certificates \
        plotutils libplot-dev \
    && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 https://github.com/LibreDWG/libredwg.git /tmp/libredwg \
    && cd /tmp/libredwg \
    && ./autogen.sh \
    && ./configure --disable-bindings --disable-docs --enable-release \
    && make -j"$(nproc)" \
    && make install \
    && ldconfig \
    && rm -rf /tmp/libredwg

FROM python:3.12-slim

# Ограничения сандбоксинга CAD-файлов (RULES § 5.5).
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    CAD_MAX_FILE_SIZE_MB=50 \
    CAD_PARSE_TIMEOUT_SEC=30 \
    DWG_CONVERTER_TYPE=auto

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && addgroup --system vwc \
    && adduser --system --ingroup vwc --no-create-home vwc

# dwg2dxf и разделяемая библиотека LibreDWG для конвертации DWG → DXF.
COPY --from=cad-tools /usr/local/bin/dwg2dxf /usr/local/bin/dwg2dxf
COPY --from=cad-tools /usr/local/bin/dxf2dwg /usr/local/bin/dxf2dwg
COPY --from=cad-tools /usr/local/lib/libredwg.so* /usr/local/lib/
RUN ldconfig

COPY app ./app

# Разбор пользовательских файлов выполняется от непривилегированного пользователя.
USER vwc

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
