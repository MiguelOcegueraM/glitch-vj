import { app, BrowserWindow, ipcMain, powerSaveBlocker, screen } from "electron";
import * as path from "path";

const isDev = process.argv.includes("--dev");

// GPU performance flags
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
app.commandLine.appendSwitch("ignore-gpu-blocklist");
// Let requestAnimationFrame cap at 60fps — unlimited wastes GPU cycles that Resolume needs
// app.commandLine.appendSwitch("disable-frame-rate-limit");
// app.commandLine.appendSwitch("disable-gpu-vsync");

// Prevent OS sleep / screen dimming during live sets
let powerBlockerId: number | null = null;

let mainWindow: BrowserWindow | null = null;
let outputWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    frame: false,
    titleBarStyle: "hidden",
    titleBarOverlay: process.platform === "win32"
      ? { color: "#000000", symbolColor: "#ffffff", height: 32 }
      : false,
    show: false,
    backgroundColor: "#000000",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(app.getAppPath(), "dist", "preload", "preload.js"),
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  // Only open DevTools in dev mode
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), "dist", "renderer", "index.html"));
  }

  // Prevent sleep while the app is running
  powerBlockerId = powerSaveBlocker.start("prevent-display-sleep");

  ipcMain.on("toggle-fullscreen", () => {
    if (!mainWindow) return;
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  });

  ipcMain.on("exit-fullscreen", () => {
    if (!mainWindow) return;
    if (mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(false);
    }
  });

  ipcMain.on("toggle-always-on-top", () => {
    if (!mainWindow) return;
    const current = mainWindow.isAlwaysOnTop();
    mainWindow.setAlwaysOnTop(!current);
  });

  // Output window: open on second monitor (or same if only one)
  ipcMain.handle("toggle-output", () => {
    if (outputWindow) {
      outputWindow.close();
      outputWindow = null;
      return false;
    }

    if (!mainWindow) return false;

    // Find the external display (prefer non-primary)
    const displays = screen.getAllDisplays();
    const primaryDisplay = screen.getPrimaryDisplay();
    const externalDisplay = displays.find((d) => d.id !== primaryDisplay.id);
    const targetDisplay = externalDisplay || primaryDisplay;
    const { x, y, width, height } = targetDisplay.bounds;

    // Get the main window's media source ID for capture
    const sourceId = mainWindow.getMediaSourceId();

    outputWindow = new BrowserWindow({
      x,
      y,
      width,
      height,
      frame: false,
      fullscreen: true,
      backgroundColor: "#000000",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(app.getAppPath(), "dist", "preload", "output-preload.js"),
      },
    });

    if (isDev) {
      outputWindow.loadURL("http://localhost:5173/output.html");
    } else {
      outputWindow.loadFile(path.join(app.getAppPath(), "dist", "renderer", "output.html"));
    }

    // Send the source ID once the output window is ready
    outputWindow.webContents.once("did-finish-load", () => {
      outputWindow?.webContents.send("set-source-id", sourceId);
    });

    outputWindow.on("closed", () => {
      outputWindow = null;
      // Notify main window that output closed
      mainWindow?.webContents.send("output-closed");
    });

    return true;
  });

  mainWindow.on("closed", () => {
    if (outputWindow) {
      outputWindow.close();
      outputWindow = null;
    }
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (powerBlockerId !== null) {
    powerSaveBlocker.stop(powerBlockerId);
  }
  app.quit();
});
