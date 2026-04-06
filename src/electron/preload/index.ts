import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

const projects = {
  list: () => ipcRenderer.invoke("project-fs:list"),
  create: (payload: { name: string; description: string; isFavorite: boolean }) => ipcRenderer.invoke("project-fs:create", payload),
  updateFavorite: (payload: { folderName: string; isFavorite: boolean }) => ipcRenderer.invoke("project-fs:updateFavorite", payload),
  export: (folderName: string) => ipcRenderer.invoke("project-fs:export", folderName),
  exportZip: (folderName: string) => ipcRenderer.invoke("project-fs:exportZip", folderName),
  import: () => ipcRenderer.invoke("project-fs:import"),
  migrateFromLegacy: (legacy: unknown[]) => ipcRenderer.invoke("project-fs:migrateFromLegacy", legacy),
  getRootPath: () => ipcRenderer.invoke("project-fs:getRootPath"),
  deleteFolder: (folderName: string) => ipcRenderer.invoke("project-fs:delete", folderName),
  listApis: (folderName: string) => ipcRenderer.invoke("project-fs:listApis", folderName),
  addApi: (folderName: string, payload: { method: string; path: string; description: string; name: string }) =>
    ipcRenderer.invoke("project-fs:addApi", folderName, payload),
  updateApi: (
    folderName: string,
    apiId: string,
    payload: { method: string; path: string; description: string; name: string },
  ) => ipcRenderer.invoke("project-fs:updateApi", folderName, apiId, payload),
  deleteApi: (folderName: string, apiId: string) => ipcRenderer.invoke("project-fs:deleteApi", folderName, apiId),
};

const api = { projects };

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
  } catch (error) {
    console.error("[preload] expose electron failed", error);
  }
  try {
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error("[preload] expose api (projects) failed — renderer may fall back to window.electron.ipcRenderer", error);
  }
} else {
  // @ts-expect-error preload
  window.electron = electronAPI;
  // @ts-expect-error preload
  window.api = api;
}
