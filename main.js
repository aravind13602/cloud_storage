const { app, dialog, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data'); // Import form-data library
const chokidar = require('chokidar');

let selectedFolder = null;
let mainWindow;

app.whenReady().then(() => {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true
        }
    });

    selectedFolder = dialog.showOpenDialogSync({
        properties: ['openDirectory']
    })?.[0];

    if (!selectedFolder) {
        app.quit();
        return;
    }

    watchFolder(selectedFolder);
});

const watchFolder = (folderPath) => {
    chokidar.watch(folderPath, { persistent: true, ignoreInitial: true })
        .on('add', (filePath) => {
            console.log('📂 New file detected:', filePath);
            setTimeout(() => uploadFile(filePath), 1000); // Small delay before uploading
        });
};

const uploadFile = async (filePath) => {
    try {
        if (!fs.existsSync(filePath)) return;

        const fileBuffer = fs.readFileSync(filePath);
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
    } catch (error) {
        console.error('❌ Upload failed:', error.message);
    }
};

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});