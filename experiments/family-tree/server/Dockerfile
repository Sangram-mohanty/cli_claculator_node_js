FROM node:26.13.1-alpine
WORKDIR /app 
ENV NODE_ENV=production 
# Give the built-in 'node' user ownership of /app 
RUN chown -R node:node /app
 # Copy package.json and package.lock.json with node ownership 
 COPY --chown=node:node package*.json ./ 
 # Install only main dependencies not dev dependecies 
 RUN npm ci --omit=dev 
 # Copy application source files with node ownership
 COPY --chown=node:node . .
 # Switch to non-root user 
 USER node 
 EXPOSE 3000 
  CMD ["node", "src/server.js"]