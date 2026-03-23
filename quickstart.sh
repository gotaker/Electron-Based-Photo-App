#!/bin/bash

# PhotoVault Quick Start Script
# This script helps you get started with PhotoVault

set -e

echo "📸 PhotoVault Quick Start"
echo "========================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Check Node version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18 or higher is required"
    echo "Current version: $(node -v)"
    echo "Please upgrade from https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

echo ""
echo "✅ Installation complete!"
echo ""
echo "What would you like to do?"
echo ""
echo "1. Run the app locally"
echo "2. Build for Windows"
echo "3. Build for macOS"
echo "4. Build for Linux"
echo "5. Deploy to Azure"
echo "6. Exit"
echo ""
read -p "Enter your choice (1-6): " choice

case $choice in
    1)
        echo ""
        echo "🚀 Starting PhotoVault..."
        npm start
        ;;
    2)
        echo ""
        echo "🔨 Building for Windows..."
        npm run build:win
        echo "✅ Build complete! Check the dist/ folder"
        ;;
    3)
        echo ""
        echo "🔨 Building for macOS..."
        npm run build:mac
        echo "✅ Build complete! Check the dist/ folder"
        ;;
    4)
        echo ""
        echo "🔨 Building for Linux..."
        npm run build:linux
        echo "✅ Build complete! Check the dist/ folder"
        ;;
    5)
        echo ""
        echo "☁️ Deploying to Azure..."
        if [ -f "deploy-azure.sh" ]; then
            chmod +x deploy-azure.sh
            ./deploy-azure.sh
        else
            echo "❌ deploy-azure.sh not found"
        fi
        ;;
    6)
        echo "👋 Goodbye!"
        exit 0
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac
