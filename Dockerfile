# Stage 1: Build the application
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code and build the React app and Express server
COPY . .
RUN npm run build

# Stage 2: Production environment
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy build output from the builder stage
COPY --from=builder /app/dist ./dist

# Expose port (Cloud Run sets PORT env, but exposing is good practice)
EXPOSE 3000

# Start the server
CMD ["node", "dist/server.cjs"]
