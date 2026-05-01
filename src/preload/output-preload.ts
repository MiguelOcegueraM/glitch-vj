import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("outputAPI", {
  // Receive commands from control UI
  onCommand: (callback: (cmd: string, data: any) => void) => {
    ipcRenderer.on("output-cmd", (_event, cmd: string, data: any) => {
      callback(cmd, data);
    });
  },

  // Notify control UI that output is ready
  sendReady: () => {
    ipcRenderer.send("output-ready");
  },
});
