FROM node:22-alpine AS frontend-build

WORKDIR /frontend
COPY package*.json ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
RUN npm run build

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    API_UPSTREAM=127.0.0.1:8000 \
    RUN_API=true

WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx gettext-base \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md ./
COPY src ./src
RUN pip install --no-cache-dir .

COPY --from=frontend-build /frontend/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/templates/default.conf.template
COPY deploy/entrypoint.sh /usr/local/bin/subnet-designer-entrypoint
RUN chmod +x /usr/local/bin/subnet-designer-entrypoint

EXPOSE 8080
CMD ["/usr/local/bin/subnet-designer-entrypoint"]
