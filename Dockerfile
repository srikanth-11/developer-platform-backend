# Multi-stage build: a fat "builder" that compiles TypeScript, then a slim
# "runner" that ships only production deps + the compiled output.

# ---- Stage 1: build ----
FROM node:20-alpine AS builder
WORKDIR /app

# Install ALL deps (incl. dev) using the lockfile for reproducible installs.
COPY package*.json ./
RUN npm ci

# Compile the app (TypeScript -> dist/).
COPY . .
RUN npm run build

# ---- Stage 2: run ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Only PRODUCTION dependencies in the final image (smaller, fewer CVEs).
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy just the compiled output from the builder stage.
COPY --from=builder /app/dist ./dist

# Run as the unprivileged built-in `node` user, never root.
USER node

EXPOSE 3333

# A self-contained healthcheck (no curl/wget in alpine) using Node's http.
HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD node -e "require('http').get('http://localhost:3333/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/main"]
