FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js room-state.js ./
COPY public ./public

# Sliplane injeta PORT automaticamente; o fallback local é 3000.
EXPOSE 3000
CMD ["node", "server.js"]
