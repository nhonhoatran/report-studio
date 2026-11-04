# ---- build stage -----------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --no-audit --no-fund
COPY server server
COPY web web
RUN npm run build -w web && npm run build -w server \
 && npm prune --omit=dev \
 && mkdir -p server/node_modules

# ---- runtime stage ---------------------------------------------------------
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=4000 \
    HOST=0.0.0.0 \
    WEB_DIST=/app/web/dist
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/node_modules ./server/node_modules
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/web/dist ./web/dist
COPY package.json ./
USER app
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
CMD ["node", "server/dist/index.js"]
