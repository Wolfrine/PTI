FROM node:22-slim AS build
WORKDIR /app/tools/pti-mcp
COPY tools/pti-mcp/package*.json ./
RUN npm ci --ignore-scripts
COPY tools/pti-mcp/ ./
COPY personal-harness/core.mjs /app/personal-harness/core.mjs
COPY food-app/core.mjs food-app/intelligence.mjs food-app/places.mjs /app/food-app/
RUN npm run build && npm prune --omit=dev --ignore-scripts
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/tools/pti-mcp/package*.json ./
COPY --from=build --chown=node:node /app/tools/pti-mcp/node_modules ./node_modules
COPY --from=build --chown=node:node /app/tools/pti-mcp/dist ./dist
USER node
EXPOSE 8080
CMD ["node", "dist/http.js"]
