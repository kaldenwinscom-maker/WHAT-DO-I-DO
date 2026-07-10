const { app, BrowserWindow, session, Menu } = require("electron");
const path = require("node:path");

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 760,
    height: 900,
    minWidth: 420,
    minHeight: 600,
    backgroundColor: "#0f1115",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "web", "index.html"));

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Electron blocks getUserMedia by default unless the app explicitly grants
// the "media" permission request, since there's no browser chrome to show
// a permission prompt.
function allowMicrophoneAccess() {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media");
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === "media";
  });
}

app.whenReady().then(() => {
  allowMicrophoneAccess();
  Menu.setApplicationMenu(null);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
