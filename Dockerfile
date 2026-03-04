# ============================================================
# Stage 1: Build
# ============================================================
FROM node:22-alpine AS builder

RUN apk add --no-cache build-base python3

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ============================================================
# Stage 2: Production
# ============================================================
FROM node:22-alpine AS runner

RUN apk add --no-cache build-base python3

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && apk del build-base python3

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY server.ts ./
COPY src ./src
COPY next.config.ts ./
COPY tsconfig.json ./

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

CMD ["npm", "run", "start"]
