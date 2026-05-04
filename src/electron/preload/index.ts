import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

import type { LinkedClientEntry } from "../../types";

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
  addApi: (folderName: string, payload: { method: string; tran: string; description: string; name: string }) => ipcRenderer.invoke("project-fs:addApi", folderName, payload),
  updateApi: (folderName: string, apiId: string, payload: { method: string; tran: string; description: string; name: string }) =>
    ipcRenderer.invoke("project-fs:updateApi", folderName, apiId, payload),
  syncApisFromSfdModule: (folderName: string, sfdAbsolutePath: string) =>
    ipcRenderer.invoke("project-fs:syncApisFromSfdModule", folderName, sfdAbsolutePath),
  deleteApi: (folderName: string, apiId: string) => ipcRenderer.invoke("project-fs:deleteApi", folderName, apiId),
  getResponsesStore: (folderName: string) => ipcRenderer.invoke("project-fs:getResponsesStore", folderName),
  upsertApiResponse: (folderName: string, apiName: string, payload: { value: string | null; label: string; description: string; editorType: string; configuration: string }) =>
    ipcRenderer.invoke("project-fs:upsertApiResponse", folderName, apiName, payload),
  deleteApiResponse: (folderName: string, apiName: string, responseValue: string) => ipcRenderer.invoke("project-fs:deleteApiResponse", folderName, apiName, responseValue),
  getAppProxyConfig: () => ipcRenderer.invoke("project-fs:getAppProxyConfig"),
  setAppProxyConfig: (partial: {
    proxyServer?: {
      port?: number;
      enabled?: boolean;
      servingFolderName?: string | null;
      careDummyMobilityPath?: string | null;
      upstreamAutoStart?: boolean;
      upstreamServerWorkdir?: string | null;
      upstreamServerPort?: number;
      upstreamServerCommand?: string | null;
      upstreamNodePath?: string | null;
      careDummyAutoStart?: boolean;
      careDummyServerWorkdir?: string | null;
      careDummyServerPort?: number;
    };
    interceptGateway?: {
      enabled?: boolean;
      clientPort?: number;
      upstreamPort?: number;
      autoStartUpstream?: boolean;
      upstreamWorkdir?: string | null;
    };
    mockTranAliases?: Record<string, string> | null;
    mockProfile?: "legacy-tran-envelope" | "generic-json";
  }) => ipcRenderer.invoke("project-fs:setAppProxyConfig", partial),
  setLinkedClients: (payload: { folderName: string; linkedClients: LinkedClientEntry[] }) =>
    ipcRenderer.invoke("project-fs:setLinkedClients", payload),
  getMockProxyStatus: () => ipcRenderer.invoke("mock-proxy:status"),
  importApisJsonPick: (folderName: string) => ipcRenderer.invoke("project-fs:importApisJsonPick", folderName),
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
  window.electron = electronAPI;
  window.api = api;
}
