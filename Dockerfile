FROM node:22-slim AS build
WORKDIR /app

COPY package*.json ./
ENV NPM_CONFIG_LOGLEVEL=verbose
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
ENV NPM_CONFIG_LOGLEVEL=verbose

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

EXPOSE 8787
CMD ["node", "dist/src/server.js"]
