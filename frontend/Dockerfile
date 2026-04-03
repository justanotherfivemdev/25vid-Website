FROM node:20-alpine AS build

WORKDIR /app

# Accept build-time env vars
ARG REACT_APP_BACKEND_URL=""
ARG REACT_APP_MAPBOX_TOKEN=""
ARG REACT_APP_WORLDMONITOR_URL="/worldmonitor/"

ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL
ENV REACT_APP_MAPBOX_TOKEN=$REACT_APP_MAPBOX_TOKEN
ENV REACT_APP_WORLDMONITOR_URL=$REACT_APP_WORLDMONITOR_URL
ENV CI=true

# Install dependencies
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Copy source and build
COPY frontend/ .
RUN npm run build

# ── Build World Monitor ──────────────────────────────────────
FROM node:20-alpine AS worldmonitor-build

WORKDIR /app

COPY worldmonitor/package.json ./
RUN npm install

COPY worldmonitor/ .
RUN npm run build

# ── Production stage ─────────────────────────────────────────
FROM nginx:alpine

# Copy the React build output
COPY --from=build /app/build /usr/share/nginx/html

# Copy the World Monitor build output
COPY --from=worldmonitor-build /app/dist /usr/share/nginx/html/worldmonitor

# Nginx config: SPA routing + reverse proxy to backend
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
