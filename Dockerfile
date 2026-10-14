# Production image: builds the Astro server and runs it as an unprivileged user.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
# git fetches the content repository (over HTTPS); tar unpacks revisions.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates tar \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src/server ./src/server
COPY --from=build /app/src/lib ./src/lib
COPY deploy/entrypoint.sh /usr/local/bin/entrypoint.sh
USER node
EXPOSE 4321
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:4321/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["entrypoint.sh"]
CMD ["node", "dist/server/entry.mjs"]
