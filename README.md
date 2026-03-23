# PhotoVault - Modern Photo Management Desktop App

A modern, Electron-based photo management application inspired by Google Picasa, with advanced editing tools, face detection, and album organization.

## 🌟 Features

- **Photo Organization**
  - Create and manage albums
  - Tag photos with favorites
  - Search functionality
  - Grid and list views

- **Face Detection**
  - Automatic face detection simulation
  - Group photos by people
  - Smart filtering

- **Advanced Photo Editing**
  - 8 professional filters (B&W, Sepia, Vintage, Warm, Cool, Vivid, Dramatic)
  - Brightness, Contrast, and Saturation adjustments
  - Blur effects
  - Rotate and flip tools
  - Real-time preview

- **Modern Desktop Experience**
  - Cross-platform (Windows, Mac, Linux)
  - Persistent local storage
  - Keyboard shortcuts
  - Fast and responsive UI

## 🚀 Quick Start

### Prerequisites

- Node.js 18 or higher
- npm or yarn

### Local Development

1. **Install dependencies**
   ```bash
   cd photovault-app
   npm install
   ```

2. **Run the app**
   ```bash
   npm start
   ```

3. **Build for production**
   ```bash
   # Build for your current platform
   npm run build

   # Build for specific platforms
   npm run build:win    # Windows
   npm run build:mac    # macOS
   npm run build:linux  # Linux
   ```

## ☁️ Azure Deployment

PhotoVault can be deployed to Azure in multiple ways:

### Option 1: Azure Container Instances (Recommended for Desktop App)

1. **Build Docker image**
   ```bash
   docker build -t photovault:latest .
   ```

2. **Push to Azure Container Registry**
   ```bash
   # Create Azure Container Registry
   az acr create --resource-group photovault-rg \
     --name photovaultregistry --sku Basic

   # Login to ACR
   az acr login --name photovaultregistry

   # Tag and push image
   docker tag photovault:latest photovaultregistry.azurecr.io/photovault:latest
   docker push photovaultregistry.azurecr.io/photovault:latest
   ```

3. **Deploy to Azure Container Instances**
   ```bash
   az container create \
     --resource-group photovault-rg \
     --name photovault-container \
     --image photovaultregistry.azurecr.io/photovault:latest \
     --cpu 2 --memory 4 \
     --registry-login-server photovaultregistry.azurecr.io \
     --registry-username <username> \
     --registry-password <password> \
     --dns-name-label photovault-app \
     --ports 3000
   ```

### Option 2: Azure App Service (For Web Version)

1. **Run the deployment script**
   ```bash
   chmod +x deploy-azure.sh
   ./deploy-azure.sh
   ```

2. **Follow the on-screen instructions** to complete the deployment

### Option 3: Manual Azure App Service Deployment

1. **Login to Azure**
   ```bash
   az login
   ```

2. **Create Resource Group**
   ```bash
   az group create --name photovault-rg --location eastus
   ```

3. **Create App Service Plan**
   ```bash
   az appservice plan create \
     --name photovault-plan \
     --resource-group photovault-rg \
     --sku B1 \
     --is-linux
   ```

4. **Create Web App**
   ```bash
   az webapp create \
     --resource-group photovault-rg \
     --plan photovault-plan \
     --name photovault-app \
     --runtime "NODE:18-lts"
   ```

5. **Deploy Code**
   ```bash
   # Using local Git deployment
   az webapp deployment source config-local-git \
     --name photovault-app \
     --resource-group photovault-rg

   # Get the Git URL and deploy
   git remote add azure <git-url>
   git push azure main
   ```

### Option 4: Azure Static Web Apps (For Web Version)

1. **Install Static Web Apps CLI**
   ```bash
   npm install -g @azure/static-web-apps-cli
   ```

2. **Deploy**
   ```bash
   swa deploy --app-location . \
     --output-location dist \
     --resource-group photovault-rg
   ```

## 🐳 Docker Deployment

### Using Docker Compose

```bash
# Build and run
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Using Docker only

```bash
# Build
docker build -t photovault .

# Run
docker run -p 3000:3000 -v photovault-data:/app/data photovault
```

## 📁 Project Structure

```
photovault-app/
├── main.mjs               # Electron main process (ES modules)
├── preload.js             # Preload script for IPC
├── package.json           # Project configuration
├── services/
│   └── azureSync.mjs      # Optional Azure Blob sync + Face API helpers
├── lib/                   # Shared helpers (e.g. string utils for tests)
├── renderer/              # Frontend files
│   ├── index.html         # Main HTML
│   ├── styles.css         # Styles
│   └── app.js             # Application logic
├── tests/                 # Jest + Node test runner
├── e2e/                   # Playwright smoke tests
├── Dockerfile             # Docker configuration
├── docker-compose.yml     # Docker Compose config
├── deploy-azure.sh        # Azure deployment script
└── README.md              # This file
```

## ⌨️ Keyboard Shortcuts

- **Arrow Keys** - Navigate photos in viewer
- **F** - Toggle favorite
- **Delete** - Delete selected photos
- **Ctrl/Cmd + A** - Select all photos
- **Esc** - Close viewer/editor

## 🔧 Configuration

### Environment Variables

- `NODE_ENV` - Environment mode (development/production)
- `DISPLAY` - X11 display for headless / Docker desktop mode
- `AZURE_STORAGE_CONNECTION_STRING` - Optional; enables **☁️ Sync** to upload local files to Azure Blob
- `AZURE_STORAGE_CONTAINER` - Blob container name (default: `photovault`)
- `AZURE_FACE_ENDPOINT` + `AZURE_FACE_KEY` - Optional; on import, replaces random face counts with Azure Face API detection

### Azure Configuration

Edit `.azure-config` to customize Azure deployment settings for CI/hosting. Blob and Face keys are read from environment variables in the desktop app.

## 📦 Building Installers

The app uses `electron-builder` to create installers:

```bash
# Windows installer (.exe)
npm run build:win

# macOS installer (.dmg)
npm run build:mac

# Linux installer (.AppImage)
npm run build:linux
```

Installers will be created in the `dist/` directory.

## 🛠️ Development

### Project Stack

- **Electron** - Desktop app framework
- **Node.js** - Runtime environment
- **electron-store** - Persistent data storage
- **Sharp** - Thumbnails and persisted edits
- **exifr** - EXIF dates for timeline and display
- **@azure/storage-blob** - Optional cloud sync
- **Vanilla JavaScript** - No framework dependencies for simplicity

### Tests

```bash
npm test          # Jest unit tests + Node test runner
npm run test:e2e  # Playwright (install browsers: npx playwright install chromium)
npm run test:all  # Both
```

### Adding Features

1. **Backend Logic** - Add to `main.mjs`
2. **IPC Handlers** - Add handlers in `main.mjs` and expose in `preload.js`
3. **Frontend Logic** - Add to `renderer/app.js`
4. **Styles** - Update `renderer/styles.css`

## 🔐 Security

- Context isolation enabled
- Node integration disabled in renderer
- Secure IPC communication via preload script
- No eval() or remote module usage

## 📝 Future Enhancements

- [x] Timeline view (grouped by month; uses EXIF capture date when available)
- [x] EXIF-based dates + optional Azure Face counts on import
- [x] Persisted edits (Sharp) for JPEG/PNG/WebP
- [x] Optional Azure Blob sync (env-configured)
- [ ] Crop / resize tools
- [ ] Photo sharing
- [ ] Duplicate detection
- [ ] Batch operations
- [ ] Import from cameras/phones
- [ ] Video support

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

For issues and questions:
- Create an issue on GitHub
- Check existing documentation
- Review Azure deployment docs

## 🌐 Azure Resources

- [Azure App Service Documentation](https://docs.microsoft.com/en-us/azure/app-service/)
- [Azure Container Instances](https://docs.microsoft.com/en-us/azure/container-instances/)
- [Azure CLI Reference](https://docs.microsoft.com/en-us/cli/azure/)

---

Built with ❤️ using Electron and Azure
