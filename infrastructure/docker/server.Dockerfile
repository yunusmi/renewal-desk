# syntax=docker/dockerfile:1.7
# Backend image: API and worker are the same image with different commands.
ARG NODE_IMAGE=node:22.21.1-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM deps AS build
COPY apps/server apps/server
RUN npm run build -w apps/server

# Test runner stage (integration tests against real PostgreSQL/provider).
FROM build AS test
ENV NODE_ENV=test
WORKDIR /repo/apps/server
CMD ["npx", "jest", "--config", "jest.integration.config.js", "--runInBand"]

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev -w apps/server --no-audit --no-fund
COPY --from=build /repo/apps/server/dist apps/server/dist
COPY apps/server/db apps/server/db
COPY apps/server/.sequelizerc apps/server/.sequelizerc
WORKDIR /app/apps/server
USER node
EXPOSE 3000
CMD ["node", "dist/main-api.js"]
