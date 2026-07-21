# ---- Build stage: compile the Vite SPA ----
FROM node:22-alpine AS build
WORKDIR /app

# Install deps against the lockfile (includes devDeps needed for tsc + vite build).
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Runtime stage: serve static assets with nginx ----
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
