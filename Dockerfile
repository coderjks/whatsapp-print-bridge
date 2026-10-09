FROM node:20-slim

# CUPS client for `lp`, LibreOffice for DOCX/PPTX/XLS -> PDF
RUN apt-get update && apt-get install -y --no-install-recommends \
    cups-client \
    libreoffice-writer libreoffice-impress libreoffice-calc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY dist ./dist

ENV INBOX_DIR=/app/inbox
VOLUME ["/app/inbox", "/app/auth"]
EXPOSE 3000
CMD ["node", "dist/index.js"]
