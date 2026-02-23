# ---------------------------------------------------------------------------
# Prism — Multi-stage Dockerfile
# Stage 1: Install dependencies and compile TypeScript
# Stage 2: Production image with only runtime artifacts
# ---------------------------------------------------------------------------

# ---- Build stage ----
FROM node:22-slim AS build

WORKDIR /app

# Copy workspace root files needed for npm install
COPY package.json package-lock.json tsconfig.json tsconfig.base.json ./

# Copy package manifests for each workspace package
COPY packages/core/package.json packages/core/tsconfig.json packages/core/
COPY packages/app/package.json packages/app/tsconfig.json packages/app/

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY packages/core/src/ packages/core/src/
COPY packages/app/src/ packages/app/src/

# Build TypeScript (core first, then app — handled by project references)
RUN npm run build

# ---- Production stage ----
FROM node:22-slim AS production

WORKDIR /app

# Install git + CA certs (needed for HTTPS cloning) + curl (healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends git curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy workspace root files
COPY package.json package-lock.json tsconfig.json tsconfig.base.json ./

# Copy package manifests
COPY packages/core/package.json packages/core/
COPY packages/app/package.json packages/app/

# Install production dependencies only
RUN npm ci --omit=dev

# Install drizzle-kit locally for migrations (it's a devDependency in core but needed at runtime for migrate)
RUN npm install --no-save drizzle-kit@0.30.6

# Copy compiled output from build stage
COPY --from=build /app/packages/core/dist/ packages/core/dist/
COPY --from=build /app/packages/app/dist/ packages/app/dist/

# Copy non-TypeScript assets that tsc doesn't emit
COPY packages/app/src/dashboard/public/ packages/app/dist/dashboard/public/

# Copy drizzle migrations and config
COPY drizzle/ drizzle/
COPY drizzle.config.ts ./

# Copy prism config
COPY prism.config.yaml ./

# Copy prompts directory
COPY prompts/ prompts/

# Copy entrypoint script
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

# Create directory for ephemeral clones
RUN mkdir -p /tmp/prism-clones

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -sf http://localhost:3100/login || exit 1

ENTRYPOINT ["./entrypoint.sh"]
