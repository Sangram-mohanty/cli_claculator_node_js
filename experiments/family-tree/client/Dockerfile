FROM node:26.13.1-alpine AS builder
WORKDIR /app
 # Give the built-in 'node' user ownership of /app 
 RUN chown -R node:node /app
 # Copy package.json and package.lock.json with node ownership
 COPY --chown=node:node package*.json ./
 # Install only main dependencies not dev dependecies
 RUN npm ci
 # Copy application source files with node ownership
 RUN npx ng build --configuration=production --source-map=false
 # ========================================== # Stage 2: Serve with Lightweight Nginx # ==========================================
 FROM nginx:alpine
 # Remove default Nginx static assets
 RUN rm -rf /usr/share/nginx/html/*
 COPY --from=builder /app/dist/family-tree/browser /usr/share/nginx/html 
 # Copy custom Nginx config for Angular routing & Express API proxy
 COPY nginx.conf /etc/nginx/conf.d/default.conf
 EXPOSE 80
 CMD [ "nginx", "-g", "daemon off;" ]