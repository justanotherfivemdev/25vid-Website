FROM node:20-alpine AS build

WORKDIR /app

# Accept build-time env vars
ARG REACT_APP_BACKEND_URL=""
ARG REACT_APP_MAPBOX_TOKEN=""

ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL
ENV REACT_APP_MAPBOX_TOKEN=$REACT_APP_MAPBOX_TOKEN
ENV CI=true

# Install dependencies
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Copy source and build (World Monitor is integrated into the frontend)
COPY frontend/ .
COPY worldmonitor/src/ src/features/worldmonitor/
COPY worldmonitor/data/ src/features/worldmonitor/data/
RUN npm run build

# ── Production stage ─────────────────────────────────────────
FROM nginx:alpine

# Copy the React build output (includes integrated World Monitor)
COPY --from=build /app/build /usr/share/nginx/html

# Nginx config: SPA routing + reverse proxy to backend
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
