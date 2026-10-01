FROM node:22-bookworm-slim
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV API_PORT=4000
EXPOSE 4000

CMD ["sh", "-c", "npm run db:deploy && npm start"]
