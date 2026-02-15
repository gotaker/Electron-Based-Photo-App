# Use Node.js LTS as base image
FROM node:18-bullseye

# Install dependencies for Electron
RUN apt-get update && apt-get install -y \
    libgtk-3-0 \
    libnotify4 \
    libnss3 \
    libxss1 \
    libxtst6 \
    xvfb \
    libgbm1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy app files
COPY . .

# Expose port (if running as web service)
EXPOSE 3000

# Set environment variables
ENV DISPLAY=:99

# Start Xvfb and run the app
CMD Xvfb :99 -screen 0 1024x768x16 & npm start
