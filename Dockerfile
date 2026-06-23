FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=dependencies /app/node_modules ./node_modules
COPY --chown=app:app package.json server.js ./
COPY --chown=app:app data ./data
COPY --chown=app:app lib ./lib
COPY --chown=app:app public ./public
USER app
EXPOSE 3000
CMD ["node", "server.js"]
