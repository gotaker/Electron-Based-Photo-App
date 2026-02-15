# PhotoVault - Azure Deployment Guide

This guide walks you through deploying PhotoVault to Azure Cloud.

## Prerequisites

Before you begin, ensure you have:

1. **Azure Account**
   - Sign up at [azure.microsoft.com](https://azure.microsoft.com/free/)
   - Get $200 free credit for new accounts

2. **Azure CLI**
   - Install from [here](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli)
   - Verify installation: `az --version`

3. **Docker** (for containerized deployment)
   - Install from [docker.com](https://www.docker.com/products/docker-desktop)
   - Verify: `docker --version`

4. **Node.js 18+**
   - Download from [nodejs.org](https://nodejs.org/)
   - Verify: `node --version`

5. **Git**
   - Install from [git-scm.com](https://git-scm.com/)
   - Verify: `git --version`

## Deployment Options

PhotoVault can be deployed to Azure in several ways. Choose the one that fits your needs:

### Option A: Azure App Service (Easiest)
**Best for:** Quick deployment, automatic scaling
**Cost:** ~$13-55/month depending on tier

### Option B: Azure Container Instances
**Best for:** Containerized apps, more control
**Cost:** Pay-per-second billing, ~$10-30/month

### Option C: Azure Virtual Machines
**Best for:** Full control, custom configurations
**Cost:** Varies, starting at ~$15/month

---

## Option A: Azure App Service Deployment

### Step 1: Initial Setup

1. **Login to Azure**
   ```bash
   az login
   ```

2. **Set your subscription** (if you have multiple)
   ```bash
   az account list --output table
   az account set --subscription "YOUR_SUBSCRIPTION_ID"
   ```

### Step 2: Automated Deployment

1. **Run the deployment script**
   ```bash
   cd photovault-app
   chmod +x deploy-azure.sh
   ./deploy-azure.sh
   ```

2. **Follow the prompts** - the script will:
   - Create resource group
   - Create app service plan
   - Create web app
   - Configure deployment settings

3. **Deploy your code**
   ```bash
   # Initialize git if not already done
   git init
   git add .
   git commit -m "Initial commit"

   # Add Azure remote (URL provided by script)
   git remote add azure <DEPLOYMENT_URL>

   # Deploy
   git push azure main
   ```

### Step 3: Configure Your App

1. **Set environment variables**
   ```bash
   az webapp config appsettings set \
     --resource-group photovault-rg \
     --name photovault-app \
     --settings \
       NODE_ENV=production \
       PORT=8080
   ```

2. **Enable logging**
   ```bash
   az webapp log config \
     --name photovault-app \
     --resource-group photovault-rg \
     --application-logging filesystem \
     --level information
   ```

3. **View logs**
   ```bash
   az webapp log tail \
     --name photovault-app \
     --resource-group photovault-rg
   ```

### Step 4: Access Your App

Your app will be available at:
```
https://photovault-app.azurewebsites.net
```

---

## Option B: Azure Container Instances Deployment

### Step 1: Create Container Registry

```bash
# Create resource group
az group create \
  --name photovault-rg \
  --location eastus

# Create Azure Container Registry
az acr create \
  --resource-group photovault-rg \
  --name photovaultregistry \
  --sku Basic \
  --admin-enabled true

# Get registry credentials
az acr credential show \
  --name photovaultregistry \
  --resource-group photovault-rg
```

### Step 2: Build and Push Docker Image

```bash
# Login to ACR
az acr login --name photovaultregistry

# Build image
docker build -t photovault:latest .

# Tag for ACR
docker tag photovault:latest \
  photovaultregistry.azurecr.io/photovault:latest

# Push to ACR
docker push photovaultregistry.azurecr.io/photovault:latest
```

### Step 3: Deploy Container Instance

```bash
# Get ACR credentials
ACR_USERNAME=$(az acr credential show \
  --name photovaultregistry \
  --query username -o tsv)

ACR_PASSWORD=$(az acr credential show \
  --name photovaultregistry \
  --query passwords[0].value -o tsv)

# Create container instance
az container create \
  --resource-group photovault-rg \
  --name photovault-container \
  --image photovaultregistry.azurecr.io/photovault:latest \
  --cpu 2 \
  --memory 4 \
  --registry-login-server photovaultregistry.azurecr.io \
  --registry-username $ACR_USERNAME \
  --registry-password $ACR_PASSWORD \
  --dns-name-label photovault-app \
  --ports 3000 \
  --restart-policy Always
```

### Step 4: Access Your Container

```bash
# Get container IP
az container show \
  --resource-group photovault-rg \
  --name photovault-container \
  --query ipAddress.fqdn -o tsv
```

Your app will be available at: `http://photovault-app.<region>.azurecontainer.io:3000`

---

## Option C: GitHub Actions Automated Deployment

### Step 1: Setup GitHub Repository

1. **Create a new repository** on GitHub
2. **Push your code**
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/photovault.git
   git push -u origin main
   ```

### Step 2: Configure Azure Credentials

1. **Create a service principal**
   ```bash
   az ad sp create-for-rbac \
     --name "photovault-github" \
     --role contributor \
     --scopes /subscriptions/YOUR_SUBSCRIPTION_ID/resourceGroups/photovault-rg \
     --sdk-auth
   ```

2. **Copy the JSON output** - you'll need it for GitHub secrets

### Step 3: Add GitHub Secrets

Go to your repository → Settings → Secrets and variables → Actions

Add these secrets:
- `AZURE_CREDENTIALS` - The JSON from service principal
- `AZURE_WEBAPP_NAME` - Your app name (e.g., photovault-app)
- `AZURE_RESOURCE_GROUP` - photovault-rg
- `ACR_LOGIN_SERVER` - photovaultregistry.azurecr.io
- `ACR_USERNAME` - From `az acr credential show`
- `ACR_PASSWORD` - From `az acr credential show`

### Step 4: Deploy

Simply push to main branch:
```bash
git add .
git commit -m "Trigger deployment"
git push origin main
```

GitHub Actions will automatically build and deploy your app!

---

## Monitoring and Management

### View Application Logs

```bash
# Stream logs
az webapp log tail \
  --name photovault-app \
  --resource-group photovault-rg

# Download logs
az webapp log download \
  --name photovault-app \
  --resource-group photovault-rg
```

### Scale Your App

```bash
# Scale up (more powerful instance)
az appservice plan update \
  --name photovault-plan \
  --resource-group photovault-rg \
  --sku S1

# Scale out (more instances)
az appservice plan update \
  --name photovault-plan \
  --resource-group photovault-rg \
  --number-of-workers 3
```

### Monitor Performance

```bash
# Enable Application Insights
az monitor app-insights component create \
  --app photovault-insights \
  --location eastus \
  --resource-group photovault-rg
```

---

## Cost Optimization

### Free Tier Options

Azure offers free tiers for:
- **Azure App Service** - F1 tier (limited resources)
- **Azure Container Registry** - Basic tier (first month free)
- **12 months free** - 750 hours of B1S VMs

### Reduce Costs

1. **Use B-series for development**
   ```bash
   az appservice plan update \
     --sku B1 \
     --resource-group photovault-rg
   ```

2. **Auto-shutdown** (for VMs)
   Configure in Azure Portal → VM → Auto-shutdown

3. **Delete when not in use**
   ```bash
   az group delete --name photovault-rg
   ```

---

## Troubleshooting

### App won't start

1. **Check logs**
   ```bash
   az webapp log tail --name photovault-app -g photovault-rg
   ```

2. **Verify Node version**
   ```bash
   az webapp config show --name photovault-app -g photovault-rg
   ```

### Container fails to deploy

1. **Check ACR credentials**
   ```bash
   az acr credential show --name photovaultregistry
   ```

2. **Verify image exists**
   ```bash
   az acr repository list --name photovaultregistry
   ```

### GitHub Actions fails

1. Check secrets are configured correctly
2. Verify service principal has permissions
3. Check workflow logs in GitHub Actions tab

---

## Security Best Practices

1. **Enable HTTPS only**
   ```bash
   az webapp update \
     --name photovault-app \
     --resource-group photovault-rg \
     --https-only true
   ```

2. **Add custom domain and SSL**
   ```bash
   az webapp config hostname add \
     --webapp-name photovault-app \
     --resource-group photovault-rg \
     --hostname www.yourdomain.com
   ```

3. **Enable managed identity**
   ```bash
   az webapp identity assign \
     --name photovault-app \
     --resource-group photovault-rg
   ```

4. **Set up authentication**
   - Azure Portal → Authentication → Add identity provider

---

## Next Steps

1. **Add Azure Storage** for photo storage
2. **Enable Azure Cognitive Services** for real face recognition
3. **Set up Azure CDN** for better performance
4. **Configure backups**
5. **Add custom domain**

---

## Support Resources

- [Azure Documentation](https://docs.microsoft.com/azure)
- [Azure CLI Reference](https://docs.microsoft.com/cli/azure)
- [GitHub Actions for Azure](https://github.com/Azure/actions)
- [Azure Support Plans](https://azure.microsoft.com/support/plans/)

---

## Cleanup

When you're done testing, delete all resources:

```bash
# Delete everything
az group delete --name photovault-rg --yes --no-wait

# Or delete specific resources
az webapp delete --name photovault-app -g photovault-rg
az acr delete --name photovaultregistry -g photovault-rg
```

---

**Need Help?** Open an issue on GitHub or check Azure documentation.
