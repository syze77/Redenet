const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  sendUserData: (userData) => ipcRenderer.send('user-data', userData), // Envia dados ao processo principal
  onUserDataReceived: (callback) => ipcRenderer.on('user-data-received', (event, response) => callback(response)),
});
