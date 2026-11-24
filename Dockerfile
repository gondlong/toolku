# ---------------------------------------------------------------------------
# Stage 1: LibreDWG (dwg2dxf) — built from source.
# libredwg is NOT packaged in Debian/Ubuntu repos, so it must be compiled.
# Requires python3 + python3-dev, otherwise ./configure aborts with
# "no suitable Python interpreter found".
# The toolchain and sources do not ship in the final image.
# ---------------------------------------------------------------------------
FROM debian:bookworm-slim AS libredwg-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl wget \
        build-essential autoconf automake libtool cmake swig texinfo \
        pkg-config python3 python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Fetch the release tarball (no git needed). Falls back to a shallow clone if
# the release asset is unavailable.
ARG LIBREDWG_VERSION=0.13.3
RUN set -eux; \
    cd /tmp; \
    if ! wget -q --show-progress \
        "https://github.com/LibreDWG/libredwg/releases/download/${LIBREDWG_VERSION}/libredwg-${LIBREDWG_VERSION}.tar.gz" \
        -O libredwg.tar.gz; then \
        apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*; \
        git clone --depth 1 https://github.com/LibreDWG/libredwg.git libredwg; \
        cd libredwg; \
    else \
        tar xzf libredwg.tar.gz; \
        cd "libredwg-${LIBREDWG_VERSION}"; \
    fi; \
    if [ ! -x ./configure ]; then ./autogen.sh; fi; \
    ./configure --disable-bindings --disable-debug --enable-release \
    && make -j"$(nproc)" \
    && make install \
    && rm -rf /tmp/libredwg*


# ---------------------------------------------------------------------------
# Stage 2: runtime
# ---------------------------------------------------------------------------
FROM python:3.12-slim

WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive \
    PIP_NO_CACHE_DIR=1 \
    PYTHONUNBUFFERED=1

#  - LibreOffice (Writer/Impress/Calc/Draw) -> Office->PDF conversion
#  - fonts-dejavu / fonts-liberation        -> readable PDF output
RUN apt-get update && apt-get install -y --no-install-recommends \
        libreoffice-writer libreoffice-impress libreoffice-calc libreoffice-draw \
        fonts-dejavu fonts-liberation fonts-noto-core \
        ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

# NOTE: the `libretranslate` pip package is a CLIENT library with a huge
# dependency tree. The translation SERVER runs as its own container
# (libretranslate/libretranslate:latest) — see docker-compose.yml.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App
COPY . .
RUN mkdir -p /app/translations

# Bring dwg2dxf + libredwg shared libraries into the final image
COPY --from=libredwg-builder /usr/local/bin/dwg2dxf /usr/local/bin/dwg2dxf
COPY --from=libredwg-builder /usr/local/lib/libredwg* /usr/local/lib/
RUN ldconfig && (dwg2dxf --version 2>&1 | head -2 || true)

# Run as non-root
RUN useradd -m -u 1000 toolku \
    && chown -R toolku:toolku /app
USER toolku

# LibreOffice needs a writable HOME for its user profile
ENV HOME=/home/toolku

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/healthz || exit 1

# Production WSGI server (gunicorn): 2 workers x 4 threads.
# gunicorn.conf.py also neutralises the `Server: gunicorn` banner.
CMD ["gunicorn", "-c", "gunicorn.conf.py", "app:app"]
