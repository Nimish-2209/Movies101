FROM node:22-alpine AS build

WORKDIR /src

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine

WORKDIR /src

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /src/dist ./dist


USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
