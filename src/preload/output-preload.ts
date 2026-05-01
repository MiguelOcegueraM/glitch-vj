import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("outputAPI", {
  onSourceId: (callback: (sourceId: string) => void) => {
    ipcRenderer.on("set-source-id", (_event, sourceId: string) => {
      callback(sourceId);
    });
  },
});
