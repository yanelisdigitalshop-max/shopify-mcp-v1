# Imagen de producción de Vendiva: construye la interfaz y deja solo lo necesario.

FROM node:22-slim AS construir
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=construir /app/dist ./dist
COPY server ./server
COPY shared ./shared
USER node
EXPOSE 3000
# Las llaves y DATABASE_URL llegan como variables de entorno del hosting.
CMD ["node", "server/index.js"]
