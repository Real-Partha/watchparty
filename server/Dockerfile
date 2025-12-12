FROM node:20-slim AS build
WORKDIR /app

# Install dependencies (include dev deps for build)
COPY package*.json ./
RUN npm ci

# Build TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output
COPY --from=build /app/dist ./dist

EXPOSE 8080
CMD ["node", "dist/index.js"]
