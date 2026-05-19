FROM node:22-alpine AS base
WORKDIR /app

# Copy root package files
COPY package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/scheduler/package.json ./packages/scheduler/

# Install dependencies
RUN npm install --workspaces --include-workspace-root

# Copy source
COPY packages/shared/src ./packages/shared/src
COPY packages/scheduler/src ./packages/scheduler/src

ENV NODE_ENV=production

CMD ["node", "packages/scheduler/src/index.js"]
