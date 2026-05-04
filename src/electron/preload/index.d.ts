import type { AppProxyConfig, LinkedClientEntry } from "@/types";

export interface ProjectManifest {
  version: number;
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  isFavorite: boolean;
  folderName: string;
  linkedClients?: LinkedClientEntry[];
}

export interface StoredApiEntry {
  id: string;
  method: string;
  tran: string;
  description: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFsApi {
  list: () => Promise<ProjectManifest[]>;
  create: (payload: { name: string; description: string; isFavorite: boolean }) => Promise<{ ok: true; project: ProjectManifest } | { ok: false; error: string }>;
  updateFavorite: (payload: { folderName: string; isFavorite: boolean }) => Promise<{ ok: true } | { ok: false; error: string }>;
  export: (folderName: string) => Promise<{ ok: true; path: string } | { ok: false; error: string }>;
  exportZip: (folderName: string) => Promise<{ ok: true; path: string } | { ok: false; error: string }>;
  import: () => Promise<{ ok: true; project: ProjectManifest } | { ok: false; error: string }>;
  migrateFromLegacy: (legacy: unknown[]) => Promise<{ ok: true; count: number } | { ok: false; error: string }>;
  getRootPath: () => Promise<string>;
  deleteFolder: (folderName: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  listApis: (folderName: string) => Promise<StoredApiEntry[]>;
  addApi: (
    folderName: string,
    payload: { method: string; tran: string; description: string; name: string },
  ) => Promise<{ ok: true; api: StoredApiEntry } | { ok: false; error: string }>;
  updateApi: (
    folderName: string,
    apiId: string,
    payload: { method: string; tran: string; description: string; name: string },
  ) => Promise<{ ok: true; api: StoredApiEntry } | { ok: false; error: string }>;
  syncApisFromSfdModule: (
    folderName: string,
    sfdAbsolutePath: string,
  ) => Promise<{ ok: true; updated: number; skipped: string[] } | { ok: false; error: string }>;
  deleteApi: (folderName: string, apiId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  getResponsesStore: (folderName: string) => Promise<{ version: number; byApiName: Record<string, unknown[]> }>;
  upsertApiResponse: (
    folderName: string,
    apiName: string,
    payload: { value: string | null; label: string; description: string; editorType: string; configuration: string },
  ) => Promise<{ ok: true; value: string } | { ok: false; error: string }>;
  deleteApiResponse: (folderName: string, apiName: string, responseValue: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  getAppProxyConfig: () => Promise<AppProxyConfig>;
  setAppProxyConfig: (
    partial: {
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
    },
  ) => Promise<{ ok: true; config: AppProxyConfig } | { ok: false; error: string }>;
  setLinkedClients: (payload: { folderName: string; linkedClients: LinkedClientEntry[] }) => Promise<{ ok: true } | { ok: false; error: string }>;
  getMockProxyStatus: () => Promise<{
    listening: boolean;
    port: number | null;
    lastError?: string;
    interceptGateway?: { listening: boolean; port: number | null; lastError?: string };
    upstreamSpawn?: { running: boolean; lastError?: string };
    careMockSpawn?: { running: boolean; lastError?: string };
  }>;
  importApisJsonPick: (
    folderName: string,
  ) => Promise<
    | { ok: true; imported: number; touchedApiNames: string[]; errors: string[] }
    | { ok: false; error: string; errors?: string[] }
  >;
}

export {};
