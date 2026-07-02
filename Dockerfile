# Build + serve SPA tĩnh. Dùng cho deploy dạng container (Mắt Bão App Platform...).
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY server.mjs ./
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.mjs"]
