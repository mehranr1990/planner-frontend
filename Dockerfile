# Production image for the Next.js web app (deployment only).
# Built by the backend repository's compose.yaml (service "web"). NEXT_PUBLIC_*
# values are inlined at build time; they are configuration, never secrets.
FROM node:24.22.1-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG NEXT_PUBLIC_API_MODE=live
ARG NEXT_PUBLIC_API_ORIGIN=
ARG NEXT_PUBLIC_ERASURE_POLICY_VERSION=
ENV NEXT_PUBLIC_API_MODE=$NEXT_PUBLIC_API_MODE \
  NEXT_PUBLIC_API_ORIGIN=$NEXT_PUBLIC_API_ORIGIN \
  NEXT_PUBLIC_ERASURE_POLICY_VERSION=$NEXT_PUBLIC_ERASURE_POLICY_VERSION
RUN npm run build

FROM node:24.22.1-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
