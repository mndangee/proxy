import type { ElectronAPI } from "@electron-toolkit/preload";

export interface ProjectManifest {
  version: number;
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  isFavorite: boolean;
  folderName: string;
}

export interface ProjectFsApi {
  list: () => Promise<ProjectManifest[]>;
  create: (payload: { name: string; description: string; isFavorite: boolean }) => Promise<
    { ok: true; project: ProjectManifest } | { ok: false; error: string }
  >;
  updateFavorite: (payload: { folderName: string; isFavorite: boolean }) => Promise<{ ok: true } | { ok: false; error: string }>;
  export: (folderName: string) => Promise<{ ok: true; path: string } | { ok: false; error: string }>;
  exportZip: (folderName: string) => Promise<{ ok: true; path: string } | { ok: false; error: string }>;
  import: () => Promise<{ ok: true; project: ProjectManifest } | { ok: false; error: string }>;
  migrateFromLegacy: (legacy: unknown[]) => Promise<{ ok: true; count: number } | { ok: false; error: string }>;
  getRootPath: () => Promise<string>;
  deleteFolder: (folderName: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: {
      projects: ProjectFsApi;
    };
  }
}

export {};
