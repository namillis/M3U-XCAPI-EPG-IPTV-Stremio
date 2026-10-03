# Use official Node.js LTS image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# fontconfig gives sharp's text rendering a font configuration for the bundled card fonts
RUN apk add --no-cache fontconfig

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm install --production

# Copy the rest of the code
COPY . .

# Expose the default port
EXPOSE 7000

# Start the server
CMD ["npm", "start"]
