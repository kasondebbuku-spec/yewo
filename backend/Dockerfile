# Yewo API. Node 24 includes the built-in SQLite module the API uses.
FROM node:24-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

# The database, NRC photos and backups go on the Railway volume (RAILWAY_VOLUME_MOUNT_PATH,
# or set DATA_DIR). Without one the API refuses to start in production, so no data is lost silently.
EXPOSE 4000
CMD ["node", "src/index.js"]
