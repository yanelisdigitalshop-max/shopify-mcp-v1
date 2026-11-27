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
# ffmpeg une la voz (de ella o de IA) con el video de Runway al descargarlo.
# pg_dump 17 (del repositorio oficial de PostgreSQL) hace las copias de seguridad de la base;
# sirve para servidores PostgreSQL 17 o anteriores.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates postgresql-common \
  && /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y \
  && apt-get install -y --no-install-recommends postgresql-client-17 \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=construir /app/dist ./dist
COPY server ./server
COPY shared ./shared
USER node
EXPOSE 3000
# Las llaves y DATABASE_URL llegan como variables de entorno del hosting.
CMD ["node", "server/index.js"]
