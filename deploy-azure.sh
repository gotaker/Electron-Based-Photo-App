#!/bin/bash

# PhotoVault Azure Deployment Script
# This script deploys the PhotoVault app to Azure

set -e

echo "🚀 PhotoVault Azure Deployment Script"
echo "======================================"

# Configuration
RESOURCE_GROUP="photovault-rg"
APP_NAME="photovault-app"
LOCATION="eastus"
APP_SERVICE_PLAN="photovault-plan"
SKU="B1"  # Basic tier - adjust as needed

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo -e "${RED}Error: Azure CLI is not installed${NC}"
    echo "Please install it from: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi

# Login to Azure
echo -e "${YELLOW}Logging in to Azure...${NC}"
az login

# Create Resource Group
echo -e "${YELLOW}Creating resource group: $RESOURCE_GROUP${NC}"
az group create \
    --name $RESOURCE_GROUP \
    --location $LOCATION

# Create App Service Plan
echo -e "${YELLOW}Creating App Service Plan: $APP_SERVICE_PLAN${NC}"
az appservice plan create \
    --name $APP_SERVICE_PLAN \
    --resource-group $RESOURCE_GROUP \
    --sku $SKU \
    --is-linux

# Create Web App
echo -e "${YELLOW}Creating Web App: $APP_NAME${NC}"
az webapp create \
    --resource-group $RESOURCE_GROUP \
    --plan $APP_SERVICE_PLAN \
    --name $APP_NAME \
    --runtime "NODE:18-lts"

# Configure deployment from local Git
echo -e "${YELLOW}Configuring deployment...${NC}"
az webapp deployment source config-local-git \
    --name $APP_NAME \
    --resource-group $RESOURCE_GROUP

# Get deployment credentials
DEPLOY_URL=$(az webapp deployment source show \
    --name $APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --query url -o tsv)

# Configure app settings
echo -e "${YELLOW}Configuring app settings...${NC}"
az webapp config appsettings set \
    --resource-group $RESOURCE_GROUP \
    --name $APP_NAME \
    --settings \
        NODE_ENV=production \
        SCM_DO_BUILD_DURING_DEPLOYMENT=true

# Build the app locally
echo -e "${YELLOW}Building application...${NC}"
npm install
npm run build

echo -e "${GREEN}✅ Deployment configuration complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Initialize git in your project directory (if not already done):"
echo "   git init"
echo "   git add ."
echo "   git commit -m 'Initial commit'"
echo ""
echo "2. Add Azure as a remote:"
echo "   git remote add azure $DEPLOY_URL"
echo ""
echo "3. Deploy to Azure:"
echo "   git push azure main"
echo ""
echo "Your app will be available at: https://$APP_NAME.azurewebsites.net"
