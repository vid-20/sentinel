FROM node:18-alpine

WORKDIR /app

# Copy package.json and install dependencies
COPY package.json .
RUN npm install

# Copy application source
COPY . .

# Expose Vite dev server port
EXPOSE 5173

# Run Vite in host mode
CMD ["npm", "run", "dev"]
