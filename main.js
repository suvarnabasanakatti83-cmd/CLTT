const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800
  });

  win.loadFile(path.join(__dirname,'public/index.html')); 

  win.webContents.openDevTools();
}

app.whenReady().then(createWindow);