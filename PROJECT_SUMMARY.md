# PhotoVault - Project Summary

## 🎯 What is PhotoVault?

PhotoVault is a modern, desktop photo management application built with Electron. It's inspired by Google Picasa but designed for modern operating systems with cloud deployment capabilities on Azure.

## ✨ Key Features

### Photo Management
- Import and organize photos
- Create custom albums
- Tag favorites
- Search functionality
- Grid and list views
- Simulated face detection

### Photo Editing
- 8 professional filters
- Brightness, contrast, saturation controls
- Blur effects
- Rotation and flipping
- Real-time preview

### Desktop Experience
- Cross-platform (Windows, Mac, Linux)
- Fast and responsive
- Persistent local storage
- Keyboard shortcuts
- Modern, clean interface

## 🏗️ Architecture

### Technology Stack

**Frontend:**
- HTML5, CSS3, JavaScript (Vanilla)
- No framework dependencies for simplicity
- Modern ES6+ features

**Backend:**
- Electron (Desktop app framework)
- Node.js 18+
- electron-store (persistent storage)

**Deployment:**
- Docker containerization
- Azure App Service ready
- GitHub Actions CI/CD
- Multi-platform builds

### Project Structure

```
photovault-app/
├── main.mjs                  # Electron main process (ES modules)
├── preload.js                # IPC bridge (security)
├── package.json              # Dependencies & scripts
├── services/
│   └── azureSync.mjs         # Optional Azure Blob + Face API
├── lib/                      # Shared helpers (tests / utilities)
├── renderer/                 # Frontend application
│   ├── index.html            # Main UI
│   ├── styles.css            # All styles
│   └── app.js                # Application logic
├── tests/                    # Jest + Node tests
├── e2e/                      # Playwright smoke tests
├── build/                    # App icons
│   └── ICON_README.md        # Icon requirements
├── .github/
│   └── workflows/
│       └── azure-deploy.yml  # CI/CD pipeline
├── Dockerfile                # Container config
├── docker-compose.yml        # Local docker setup
├── deploy-azure.sh           # Azure deployment script
├── quickstart.sh             # Quick setup script
├── README.md                 # Main documentation
├── AZURE_DEPLOYMENT_GUIDE.md # Azure setup guide
└── .gitignore                # Git exclusions
```

**Dependencies note:** `express` / `multer` were removed; the app is IPC + file-based storage. Optional Azure uploads use `@azure/storage-blob` when `AZURE_STORAGE_CONNECTION_STRING` is set.

## 🚀 Getting Started

### Prerequisites

1. **Node.js 18+** - [Download](https://nodejs.org/)
2. **npm** - Comes with Node.js
3. **Git** - [Download](https://git-scm.com/)

### Installation

```bash
# Clone or navigate to the project
cd photovault-app

# Quick start (interactive)
./quickstart.sh

# Or manual installation
npm install

# Run the app
npm start
```

### Building Installers

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux

# All platforms
npm run build
```

## ☁️ Azure Deployment

### Quick Deploy

```bash
# Automated deployment
./deploy-azure.sh
```

### Manual Deploy

See `AZURE_DEPLOYMENT_GUIDE.md` for detailed instructions on:
- Azure App Service deployment
- Container deployment
- GitHub Actions CI/CD
- Cost optimization
- Monitoring and scaling

## 🎨 Customization

### Adding Features

1. **Backend Logic**
   - Edit `main.mjs`
   - Add IPC handlers for communication

2. **Frontend Logic**
   - Edit `renderer/app.js`
   - Add new functions and event handlers

3. **Styling**
   - Edit `renderer/styles.css`
   - Uses CSS custom properties for theming

4. **UI Components**
   - Edit `renderer/index.html`
   - Add new sections and modals

### Connecting to Azure Services

#### Azure Blob Storage (Photo Storage)
```javascript
// Add to package.json
"@azure/storage-blob": "^12.x.x"

// In main.mjs
const { BlobServiceClient } = require('@azure/storage-blob');
```

#### Azure Cognitive Services (Face Recognition)
```javascript
// Add to package.json
"@azure/cognitiveservices-face": "^5.x.x"

// In main.mjs
const { FaceClient } = require('@azure/cognitiveservices-face');
```

## 📊 Data Storage

### Local Storage (electron-store)

Data is stored locally in:
- **Windows:** `%APPDATA%\photovault-app`
- **macOS:** `~/Library/Application Support/photovault-app`
- **Linux:** `~/.config/photovault-app`

### Data Structure

```javascript
// Photos (renderer receives thumbnails as base64 `src` from main)
{
  id: "hex-id",
  name: "photo.jpg",
  storagePath: "/abs/path/...",
  thumbnailPath: "/abs/thumbnails/hex-id.jpg",
  captureDateISO: "2024-06-15T12:00:00.000Z", // from EXIF when available
  date: "6/15/2024",
  favorite: false,
  faces: 2,
  album: null,
  tags: []
}

// Albums
{
  id: 123456789,
  name: "Vacation 2024",
  photos: []
}
```

## 🔒 Security

### Implemented Security Features

1. **Context Isolation** - Renderer process is isolated
2. **No Node Integration** - Renderer can't access Node.js directly
3. **Preload Script** - Controlled IPC communication
4. **No Remote Module** - All IPC is explicit
5. **Content Security Policy** - Prevents XSS attacks

### Best Practices

- Always validate user input
- Sanitize file names
- Use HTTPS for remote resources
- Keep dependencies updated
- Follow principle of least privilege

## 🧪 Testing

### Manual Testing Checklist

- [ ] Import photos from local files
- [ ] Create and delete albums
- [ ] Add photos to albums
- [ ] Mark photos as favorites
- [ ] Search for photos
- [ ] Edit photos (filters, adjustments)
- [ ] Export edited photos
- [ ] View photos in fullscreen
- [ ] Navigate with keyboard shortcuts
- [ ] Delete photos

### Future: Automated Testing

Consider adding:
- Unit tests (Jest)
- E2E tests (Spectron/Playwright)
- Integration tests
- Performance tests

## 📈 Roadmap

### Phase 1: Core Features ✅
- [x] Photo import and management
- [x] Album organization
- [x] Basic editing
- [x] Electron app structure
- [x] Azure deployment setup

### Phase 2: Enhanced Features
- [x] Real face counts via Azure Face API (optional; env `AZURE_FACE_*`)
- [x] Cloud sync (Azure Blob Storage; optional; env `AZURE_STORAGE_*`)
- [ ] Advanced editing (crop, resize)
- [x] Timeline view (grouped by month; EXIF dates)
- [x] Metadata editing (EXIF read on import; display + timeline)

### Phase 3: Advanced Features
- [ ] Video support
- [ ] Sharing functionality
- [ ] Collaborative albums
- [ ] Mobile companion app
- [ ] Plugin system

### Phase 4: Enterprise Features
- [ ] Multi-user support
- [ ] Access control
- [ ] Audit logging
- [ ] Bulk operations
- [ ] API for integrations

## 🐛 Known Limitations

1. **Face Detection** - Random counts on import unless `AZURE_FACE_ENDPOINT` and `AZURE_FACE_KEY` are set.

2. **Photo Editing** - JPEG, PNG, and WebP can be saved via Sharp; GIF/BMP and others are not editable in place.

3. **Cloud Sync** - Upload-only stub; conflict policy is local-canonical with last upload overwriting blobs (see `services/azureSync.mjs`).

4. **Large Libraries** - Gallery uses incremental loading (IntersectionObserver); very large sets may still need further tuning.

5. **RAW Format** - Not supported
   - Solution: Add RAW processing library

## 💰 Cost Estimates (Azure)

### Development/Testing
- **Azure App Service B1:** ~$13/month
- **Azure Storage:** ~$0.50/month (50GB)
- **Total:** ~$13-15/month

### Production (Low Traffic)
- **Azure App Service S1:** ~$55/month
- **Azure Storage:** ~$2/month (100GB)
- **Azure CDN:** ~$5/month
- **Total:** ~$62/month

### Production (High Traffic)
- **Azure App Service P1V2:** ~$150/month
- **Azure Storage:** ~$10/month (1TB)
- **Azure CDN:** ~$20/month
- **Azure Cognitive Services:** ~$15/month
- **Total:** ~$195/month

*Note: Use Azure Cost Calculator for accurate estimates*

## 🤝 Contributing

### How to Contribute

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Write/update tests
5. Update documentation
6. Submit a pull request

### Code Style

- Use consistent indentation (2 spaces)
- Write descriptive variable names
- Add comments for complex logic
- Follow existing patterns

## 📚 Resources

### Documentation
- [Electron Docs](https://www.electronjs.org/docs)
- [Azure Docs](https://docs.microsoft.com/azure)
- [Node.js Docs](https://nodejs.org/docs)

### Tutorials
- [Electron Tutorial](https://www.electronjs.org/docs/latest/tutorial)
- [Azure App Service](https://docs.microsoft.com/azure/app-service/)
- [Docker Tutorial](https://docs.docker.com/get-started/)

### Tools
- [VS Code](https://code.visualstudio.com/)
- [Azure Portal](https://portal.azure.com/)
- [GitHub Actions](https://github.com/features/actions)

## 📞 Support

### Get Help
- Open an issue on GitHub
- Check existing documentation
- Review Azure documentation
- Community forums

### Report Bugs
1. Check if already reported
2. Create detailed issue with:
   - Steps to reproduce
   - Expected behavior
   - Actual behavior
   - Screenshots
   - System info

## 📝 License

MIT License - Feel free to use this project for personal or commercial purposes.

---

## 🎓 Learning Outcomes

By working with this project, you'll learn:

1. **Electron Development**
   - Main and renderer processes
   - IPC communication
   - Security best practices
   - Building cross-platform apps

2. **Azure Cloud**
   - App Service deployment
   - Container deployment
   - CI/CD pipelines
   - Cost management

3. **Modern JavaScript**
   - ES6+ features
   - Async/await
   - Event handling
   - DOM manipulation

4. **DevOps**
   - Docker containerization
   - GitHub Actions
   - Automated deployment
   - Version control

---

**Built with ❤️ for the modern desktop**

Ready to deploy? See `AZURE_DEPLOYMENT_GUIDE.md` for step-by-step instructions!
