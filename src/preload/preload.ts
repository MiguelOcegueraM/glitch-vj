import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  // Window controls
  toggleFullscreen: () => ipcRenderer.send("toggle-fullscreen"),
  exitFullscreen: () => ipcRenderer.send("exit-fullscreen"),
  toggleAlwaysOnTop: () => ipcRenderer.send("toggle-always-on-top"),

  // Output window
  toggleOutput: () => ipcRenderer.invoke("toggle-output"),
  onOutputClosed: (callback: () => void) => {
    ipcRenderer.on("output-closed", () => callback());
  },
  onOutputReady: (callback: () => void) => {
    ipcRenderer.on("output-ready", () => callback());
  },

  // Send command to output window (relayed through main process)
  sendToOutput: (cmd: string, data?: any) => {
    ipcRenderer.send("output-cmd", cmd, data);
  },
});
