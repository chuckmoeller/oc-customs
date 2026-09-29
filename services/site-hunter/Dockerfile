# Stage 1: Build React/Vite PWA static assets
FROM node:20-slim AS builder
WORKDIR /app

COPY package.json package-lock.json* .npmrc* ./
RUN npm install --ignore-scripts --no-audit --no-fund

COPY vite.config.js index.html tailwind.config.js* postcss.config.js* ./
COPY public/ ./public/
COPY src/ ./src/

RUN npm run build

# Stage 2: FastAPI Python Runtime
FROM python:3.11-slim
WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY service-account-key.json* ./
COPY app.py ./
COPY --from=builder /app/dist ./dist

EXPOSE 8080
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
