FROM node:22-alpine AS base
WORKDIR /app

# Copy root package files
COPY package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/webhook/package.json ./packages/webhook/

# Install dependencies
RUN npm install --workspaces --include-workspace-root

# Copy source
COPY packages/shared/src ./packages/shared/src
COPY packages/webhook/src ./packages/webhook/src

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "packages/webhook/src/index.js"]
