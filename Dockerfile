FROM node:20-alpine

WORKDIR /app

# deps
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# source
COPY tsconfig.json ./
COPY server ./server
COPY public ./public
COPY scripts ./scripts
COPY README.md spec.md .env.example ./

# build
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
