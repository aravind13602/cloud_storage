const { ipcRenderer } = require('electron');

document.getElementById('startSync').addEventListener('click', async () => {
    const folder = await ipcRenderer.invoke('select-folder');
    if (folder) {
        document.getElementById('folderPath').innerText = `Watching: ${folder}`;
    }
});

ipcRenderer.on('file-uploaded', (event, filename) => {
    const fileList = document.getElementById('fileList');
    const listItem = document.createElement('li');
    listItem.innerText = `✅ ${filename} uploaded`;
    fileList.appendChild(listItem);
});
