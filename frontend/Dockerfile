FROM node:20-alpine AS build

WORKDIR /app

# Accept build-time env vars
ARG REACT_APP_BACKEND_URL=""
ARG REACT_APP_MAPBOX_TOKEN=""

ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL
ENV REACT_APP_MAPBOX_TOKEN=$REACT_APP_MAPBOX_TOKEN
ENV CI=true

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps 2>/dev/null || npm install --legacy-peer-deps

# Copy source and build
COPY . .
RUN npx craco build

# ── Production stage ─────────────────────────────────────────
FROM nginx:alpine

# Copy the React build output
COPY --from=build /app/build /usr/share/nginx/html

# Nginx config: SPA routing + reverse proxy to backend
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
