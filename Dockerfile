FROM node:20-bookworm-slim

# System Chromium (skips Puppeteer's own ~170MB Chromium download) + Xvfb
# (virtual display so Chrome can run headful inside the container — see
# docker-entrypoint.sh; headful is deliberately preferred over headless
# because ChatGPT's bot detection flags headless sessions far more
# aggressively) + fonts so pages render/measure text the same as on a
# desktop, + the shared libs Chromium needs at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
        chromium \
        xvfb \
        dumb-init \
        ca-certificates \
        fonts-liberation \
        fonts-noto-color-emoji \
        libnss3 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libcups2 \
        libdrm2 \
        libxkbcommon0 \
        libxcomposite1 \
        libxdamage1 \
        libxfixes3 \
        libxrandr2 \
        libgbm1 \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libasound2 \
        libatspi2.0-0 \
        libx11-xcb1 \
    && rm -rf /var/lib/apt/lists/*

# Must be set before `npm install` runs puppeteer's postinstall — skips its
# bundled Chromium download since we use the system package above instead.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    PORT=3001

WORKDIR /app

# Install deps first so this layer stays cached across source-only changes.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .
RUN chmod +x docker-entrypoint.sh

# Run as a non-root user. --no-sandbox (set in puppeteerService.js) is still
# required even so — containers normally lack the privileges Chrome's own
# sandbox needs regardless of which user owns the process.
RUN groupadd -r chatgpt \
    && useradd -r -g chatgpt -m chatgpt \
    && mkdir -p chrome-user-data logs \
    && chown -R chatgpt:chatgpt /app
USER chatgpt

# chrome-user-data persists the logged-in session across restarts; mount a
# named volume over it (see docker-compose.yml) or you'll re-run the login
# flow on every container start.
VOLUME ["/app/chrome-user-data", "/app/logs"]

EXPOSE 3001

ENTRYPOINT ["dumb-init", "--", "./docker-entrypoint.sh"]
CMD ["node", "server.js"]
