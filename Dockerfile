# Reproducible production build for Railway.
# Node 22 LTS base; SQLite runs in-process, so the only persistent state is the
# database file at DATABASE_PATH (mount a Railway volume at /app/data).

FROM node:22-alpine AS build
WORKDIR /app

# Install dependencies (package-lock.json pins versions for reproducibility).
COPY package.json package-lock.json ./
RUN npm ci

# Compile TypeScript to dist/, build the Tailwind stylesheet, copy non-JS assets.
COPY . .
RUN npm run build

# Prune to production dependencies for a smaller runtime image.
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

# data/ lives on a Railway volume in production (never baked into the image);
# the app also creates it at runtime if missing.
RUN mkdir -p /app/data

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist

# Apply migrations at container start (idempotent) then launch the compiled app.
CMD ["sh", "-c", "node dist/scripts/migrate.js && node dist/src/server.js"]
