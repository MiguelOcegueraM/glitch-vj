import { app, BrowserWindow, ipcMain, powerSaveBlocker, screen } from "electron";
import * as path from "path";

const isDev = process.argv.includes("--dev");

// GPU performance flags
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
app.commandLine.appendSwitch("ignore-gpu-blocklist");

// Prevent OS sleep / screen dimming during live sets
let powerBlockerId: number | null = null;

let mainWindow: BrowserWindow | null = null;
let outputWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: "hidden",
    titleBarOverlay: process.platform === "win32"
      ? { color: "#0a0a0a", symbolColor: "#666666", height: 32 }
      : false,
    show: false,
    backgroundColor: "#0a0a0a",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(app.getAppPath(), "dist", "preload", "preload.js"),
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

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

  // ── Window controls ──
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

  // ── Output window management ──
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

    outputWindow.on("closed", () => {
      outputWindow = null;
      mainWindow?.webContents.send("output-closed");
    });

    return true;
  });

  // ── Relay commands from control UI to output window ──
  ipcMain.on("output-cmd", (_event, cmd: string, data: any) => {
    if (outputWindow && !outputWindow.isDestroyed()) {
      outputWindow.webContents.send("output-cmd", cmd, data);
    }
  });

  // ── Relay from output back to control (e.g., output-ready) ──
  ipcMain.on("output-ready", () => {
    mainWindow?.webContents.send("output-ready");
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
