FROM node:20-alpine AS base
RUN apk add --no-cache python3 make g++
WORKDIR /app

# --- deps ----------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/package.json
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json
RUN npm install --no-audit --no-fund

# --- build ---------------------------------------------------------------
FROM deps AS build
COPY tsconfig.base.json ./
COPY shared ./shared
COPY server ./server
COPY client ./client
RUN npm run build

# --- runtime -------------------------------------------------------------
# npm workspaces hoist all deps to /app/node_modules and create a symlink at
# /app/node_modules/@buddysplit/shared -> /app/shared, so we just copy the
# root node_modules plus the built shared/server/client artefacts.
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_DIR=/data
ENV CLIENT_DIST=/app/client/dist

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/shared/package.json ./shared/package.json
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist

EXPOSE 8080
CMD ["node", "server/dist/index.js"]
