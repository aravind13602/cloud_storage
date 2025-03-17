const { ipcRenderer } = require('electron');

// Folder path display
ipcRenderer.on('folder-watched', (event, folder) => {
    document.getElementById('folderPath').innerText = `Watching: ${folder}`;
});

// Folder selection button
document.getElementById('selectFolder').addEventListener('click', async () => {
    const folder = await ipcRenderer.invoke('select-folder');
    if (folder) {
        document.getElementById('folderPath').innerText = `Watching: ${folder}`;
    }
});

// Minimize to tray functionality
document.addEventListener('DOMContentLoaded', () => {
    // Optional: Add a minimize to tray button if you want explicit control
    const minimizeBtn = document.getElementById('minimizeToTray');
    if (minimizeBtn) {
        minimizeBtn.addEventListener('click', () => {
            ipcRenderer.send('minimize-to-tray');
        });
    }
});

// Auto-start toggle functionality
const autoStartToggle = document.getElementById('autoStartToggle');

// Check initial auto-start status when page loads
async function checkAutoStartStatus() {
    try {
        const isEnabled = await ipcRenderer.invoke('check-autostart');
        autoStartToggle.checked = isEnabled;
    } catch (error) {
        console.error('Error checking auto-start:', error);
        autoStartToggle.checked = false;
    }
}
checkAutoStartStatus();

// Toggle auto-start when switch is clicked
autoStartToggle.addEventListener('change', async () => {
    try {
        const result = await ipcRenderer.invoke('toggle-autostart', autoStartToggle.checked);

        // If toggle fails, revert the checkbox
        if (result !== autoStartToggle.checked) {
            autoStartToggle.checked = result;
        }
    } catch (error) {
        console.error('Error toggling auto-start:', error);
        autoStartToggle.checked = !autoStartToggle.checked;
    }
});

// File upload listener
ipcRenderer.on('file-uploaded', (event, filename) => {
    console.log(`File uploaded: ${filename}`);
});