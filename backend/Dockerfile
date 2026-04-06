FROM node:18-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
# Run install instead of ci for production reliability without lockfile
RUN npm install --only=production

COPY . .
EXPOSE 3000

# Use 'node index.js' instead of 'nodemon' dev watcher
CMD ["npm", "start"]
