FROM node:22-slim

WORKDIR /app

# Dependències del backend
COPY backend/package.json ./backend/package.json
RUN cd backend && npm install --omit=dev

# Codi
COPY backend ./backend
COPY frontend ./frontend

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/tensio.db

EXPOSE 3000

CMD ["node", "backend/server.js"]
