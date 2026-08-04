FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY prisma/ ./prisma/
COPY prisma.config.ts ./

RUN npm ci

COPY src/ ./src/

RUN npm run build

FROM node:22-alpine

WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY package*.json ./

RUN npm ci --omit=dev && npm cache clean --force

# Reuse the client generated in the builder. Dependencies are installed before
# the schema is copied into the runtime image, so generate it during the build.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/dist ./dist
COPY prisma/ ./prisma/

USER appuser

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy --schema prisma/schema.prisma && node dist/main"]
