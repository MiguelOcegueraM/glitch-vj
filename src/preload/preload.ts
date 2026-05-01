import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  toggleFullscreen: () => ipcRenderer.send("toggle-fullscreen"),
  exitFullscreen: () => ipcRenderer.send("exit-fullscreen"),
  toggleAlwaysOnTop: () => ipcRenderer.send("toggle-always-on-top"),
});
