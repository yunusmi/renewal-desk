# syntax=docker/dockerfile:1.7
ARG NODE_IMAGE=node:22.21.1-bookworm-slim

FROM ${NODE_IMAGE} AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm npm ci -w apps/web --no-audit --no-fund
COPY apps/web apps/web
RUN npm run build -w apps/web

FROM nginxinc/nginx-unprivileged:1.27.3-alpine AS runtime
COPY infrastructure/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
