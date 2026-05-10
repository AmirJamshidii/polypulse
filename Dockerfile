# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

FROM deps AS build
WORKDIR /app
COPY . .
RUN --mount=type=cache,target=/root/.npm \
    npx prisma generate
RUN --mount=type=cache,target=/root/.npm \
    npm run build

FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache su-exec
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001 -G nodejs
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/generated ./generated
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.mjs ./prisma.config.mjs
COPY --from=build /app/node_modules/prisma ./node_modules/prisma
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
RUN mkdir -p /app/data && chown -R nestjs:nodejs /app/data
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
