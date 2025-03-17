const { app, dialog, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const chokidar = require('chokidar');
const AutoLaunch = require('auto-launch');

class ElectronCloudSync {
    constructor() {
        this.selectedFolder = null;
        this.mainWindow = null;
        this.tray = null;
        this.watcher = null;
        this.autoLauncher = new AutoLaunch({
            name: 'CloudSync',
            path: app.getPath('exe'),
        });
    }

    async init() {
        await this.createAppDirectories();
        this.setupAppLifecycle();
    }

    async createAppDirectories() {
        const appDataPath = path.join(app.getPath('userData'), 'data');
        const uploadedFilesPath = path.join(appDataPath, 'uploaded');

        try {
            await fs.mkdir(appDataPath, { recursive: true });
            await fs.mkdir(uploadedFilesPath, { recursive: true });
        } catch (error) {
            console.error('❌ Error creating app directories:', error);
        }
    }

    setupAppLifecycle() {
        app.whenReady().then(async () => {
            app.setName('CloudSync');
            this.createMainWindow();
            await this.loadAutoStartPreference();
            await this.loadLastSelectedFolder();
            this.setupIpcHandlers();
        });

        app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') app.quit();
        });

        // Add proper quit handling
        app.on('before-quit', () => {
            app.isQuitting = true;
        });
    }

    createMainWindow() {
        this.mainWindow = new BrowserWindow({
            width: 800,
            height: 600,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            },
            show: false // Start hidden
        });

        this.mainWindow.loadFile('index.html');
        
        // Create tray icon
        this.createTray();
        
        // Handle window close event to minimize to tray instead of quitting
        this.mainWindow.on('close', (event) => {
            if (!app.isQuitting) {
                event.preventDefault();
                this.mainWindow.hide();
                return false;
            }
            return true;
        });
    }
    
    createTray() {
        // Use a default icon path - you may want to replace this with your custom icon
        const iconPath = path.join(__dirname, 'icon.png');
        
        // Create the tray icon
        this.tray = new Tray(iconPath);
        this.tray.setToolTip('CloudSync');
        
        // Create context menu
        const contextMenu = Menu.buildFromTemplate([
            { 
                label: 'Show App', 
                click: () => {
                    this.mainWindow.show();
                }
            },
            { 
                label: 'Hide App', 
                click: () => {
                    this.mainWindow.hide();
                }
            },
            { type: 'separator' },
            { 
                label: 'Quit', 
                click: () => {
                    app.isQuitting = true;
                    app.quit();
                }
            }
        ]);
        
        this.tray.setContextMenu(contextMenu);
        
        // Toggle window visibility on tray icon click
        this.tray.on('click', () => {
            if (this.mainWindow.isVisible()) {
                this.mainWindow.hide();
            } else {
                this.mainWindow.show();
            }
        });
    }

    async loadAutoStartPreference() {
        const preferencePath = this.getPreferencePath('autostart-preference.json');
        
        try {
            // Ensure preference file exists
            if (!fsSync.existsSync(preferencePath)) {
                await fs.writeFile(preferencePath, JSON.stringify({ enabled: true }));
            }

            const data = await fs.readFile(preferencePath, 'utf8');
            const { enabled } = JSON.parse(data);

            try {
                if (enabled) {
                    await this.autoLauncher.enable();
                    console.log('✅ Auto-start enabled');
                } else {
                    await this.autoLauncher.disable();
                    console.log('✅ Auto-start disabled');
                }
            } catch (launchError) {
                console.error('❌ Auto-start configuration error:', launchError);
            }
        } catch (error) {
            console.error('❌ Error loading auto-start preference:', error);
        }
    }

    async loadLastSelectedFolder() {
        const folderPath = this.getPreferencePath('lastSelectedFolder.json');
        
        try {
            // Ensure folder preference file exists
            if (!fsSync.existsSync(folderPath)) {
                await fs.writeFile(folderPath, JSON.stringify({ path: null }));
            }

            const data = await fs.readFile(folderPath, 'utf8');
            const parsedData = JSON.parse(data);
            
            if (parsedData.path && fsSync.existsSync(parsedData.path)) {
                this.selectedFolder = parsedData.path;
                await this.setupFolderWatch(this.selectedFolder);
                
                this.mainWindow.webContents.send('folder-watched', this.selectedFolder);
            }
        } catch (error) {
            console.error('❌ Error loading last selected folder:', error);
        }
    }

    setupIpcHandlers() {
        // Folder selection handler
        ipcMain.handle('select-folder', async () => {
            const result = await dialog.showOpenDialog({
                properties: ['openDirectory']
            });

            if (!result.canceled && result.filePaths.length > 0) {
                const newSelectedFolder = result.filePaths[0];
                
                // Stop previous watcher if exists
                if (this.watcher) {
                    this.watcher.close();
                }

                // Save selected folder
                await this.saveSelectedFolder(newSelectedFolder);
                
                this.selectedFolder = newSelectedFolder;
                await this.setupFolderWatch(this.selectedFolder);
                
                this.mainWindow.webContents.send('folder-watched', this.selectedFolder);
                
                return this.selectedFolder;
            }
            return null;
        });

        // Auto-start toggle handler
        ipcMain.handle('toggle-autostart', async (event, enable) => {
            const preferencePath = this.getPreferencePath('autostart-preference.json');
            
            try {
                if (enable) {
                    await this.autoLauncher.enable();
                    await fs.writeFile(preferencePath, JSON.stringify({ enabled: true }));
                    console.log('✅ Auto-start enabled');
                    return true;
                } else {
                    await this.autoLauncher.disable();
                    await fs.writeFile(preferencePath, JSON.stringify({ enabled: false }));
                    console.log('✅ Auto-start disabled');
                    return false;
                }
            } catch (err) {
                console.error('❌ Error toggling auto-start:', err);
                return false;
            }
        });

        // Check auto-start status handler
        ipcMain.handle('check-autostart', async () => {
            const preferencePath = this.getPreferencePath('autostart-preference.json');
            
            try {
                const data = await fs.readFile(preferencePath, 'utf8');
                return JSON.parse(data).enabled;
            } catch (err) {
                console.error('❌ Error checking auto-start:', err);
                return false;
            }
        });
    }

    async saveSelectedFolder(folderPath) {
        const preferencePath = this.getPreferencePath('lastSelectedFolder.json');
        
        try {
            await fs.writeFile(preferencePath, JSON.stringify({ path: folderPath }));
        } catch (error) {
            console.error('❌ Error saving selected folder:', error);
        }
    }

    getPreferencePath(filename) {
        return path.join(app.getPath('userData'), 'data', filename);
    }

    async setupFolderWatch(folderPath) {
        if (!folderPath) return;

        console.log('🔍 Setting up folder watch:', folderPath);
        
        // Close previous watcher if exists
        if (this.watcher) {
            this.watcher.close();
        }

        // Initial full folder sync
        await this.syncExistingFiles(folderPath);

        // Create new watcher
        this.watcher = chokidar.watch(folderPath, { 
            persistent: true, 
            ignoreInitial: false,
            depth: Infinity,
            ignored: /(^|[\/\\])\../ 
        });

        this.watcher
            .on('add', (filePath) => this.handleFileEvent('add', filePath))
            .on('change', (filePath) => this.handleFileEvent('change', filePath))
            .on('error', (error) => {
                console.error('❌ Watcher error:', error);
            });
    }

    async syncExistingFiles(folderPath) {
        const walkDir = async (dir) => {
            const files = await fs.readdir(dir, { withFileTypes: true });
            
            for (const file of files) {
                const res = path.resolve(dir, file.name);
                if (file.isDirectory()) {
                    await walkDir(res);
                } else {
                    // Skip hidden files
                    if (!path.basename(res).startsWith('.')) {
                        console.log('📤 Initial sync for:', res);
                        await this.uploadFile(res);
                    }
                }
            }
        };

        try {
            await walkDir(folderPath);
        } catch (error) {
            console.error('❌ Error during initial sync:', error);
        }
    }

    handleFileEvent(eventType, filePath) {
        console.log(`📂 File ${eventType}:`, filePath);
        this.uploadFile(filePath);
    }

    async uploadFile(filePath) {
        try {
            if (!fsSync.existsSync(filePath)) return;

            const fileBuffer = await fs.readFile(filePath);
            const fileName = path.basename(filePath);

            const formData = new FormData();
            formData.append('file', fileBuffer, {
                filename: fileName,
                contentType: 'application/octet-stream'
            });

            const response = await axios.post('http://localhost:3000/upload', formData, {
                headers: formData.getHeaders()
            });

            console.log('✅ Uploaded:', response.data);
            this.mainWindow.webContents.send('file-uploaded', fileName);
        } catch (error) {
            console.error('❌ Upload failed:', error.message);
        }
    }
}

// Application initialization
const electronCloudSync = new ElectronCloudSync();
electronCloudSync.init();