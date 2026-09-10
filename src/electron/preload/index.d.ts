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
  apiMetadataSources?: string[];
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
  import: () => Promise<
    | {
        ok: true;
        project: ProjectManifest;
        summary?: { detectedFormat: "server-dump" | "grouped-json" | "plain-json"; apiCount: number; responseCount: number; skippedFileCount: number; defaultCount?: number; testCount?: number; errorCount?: number; metadataMappedApiCount?: number; metadataUnmappedApiCount?: number; metadataUnmappedTrans?: string[] };
      }
    | { ok: false; error: string }
  >;
  analyzeImport: () => Promise<
    | {
        ok: true;
        analysis: {
          sessionId: string;
          detectedFormat: "dataforge-project" | "server-dump" | "grouped-json" | "plain-json";
          projectName: string;
          apiCount: number;
          responseCount: number;
          defaultCount: number;
          testCount: number;
          errorCount: number;
          skippedFileCount: number;
          metadataMappedApiCount?: number;
          metadataUnmappedApiCount?: number;
          metadataUnmappedTrans?: string[];
        };
      }
    | { ok: false; error: string }
  >;
  executeImport: (sessionId: string) => ReturnType<ProjectFsApi["import"]>;
  cancelImport: (sessionId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
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
    sfdAbsolutePath: string | string[],
  ) => Promise<{ ok: true; updated: number; skipped: string[] } | { ok: false; error: string }>;
  pickInterfaceDefinition: (payload: { folderName: string; forcePick?: boolean }) => Promise<{ ok: true; paths: string[]; remembered: boolean } | { ok: false; error: string }>;
  deleteApi: (folderName: string, apiId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  getResponsesStore: (folderName: string) => Promise<{ version: number; byApiName: Record<string, unknown[]> }>;
  upsertApiResponse: (
    folderName: string,
    apiName: string,
    payload: { value: string | null; label: string; description: string; editorType: string; configuration: string; queryParams?: Record<string, string> },
  ) => Promise<{ ok: true; value: string } | { ok: false; error: string }>;
  deleteApiResponse: (folderName: string, apiName: string, responseValue: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  getAppProxyConfig: () => Promise<AppProxyConfig>;
  pickServerDirectory: () => Promise<{ ok: true; path: string } | { ok: false; error: string }>;
  detectServerCommand: (workdir: string) => Promise<
    { ok: true; command: string; script: string; packageManager: string } | { ok: false; error: string }
  >;
  prepareProxyTakeover: (payload: { clientPort: number; upstreamPort: number; workdir: string; command: string; confirmed?: boolean }) => Promise<
    { ok: true; stopped: number[] } | { ok: false; error: string; port?: number; detail?: string }
  >;
  restoreProxyTakeover: (payload: { clientPort: number; workdir: string; command: string }) => Promise<
    { ok: true } | { ok: false; error: string }
  >;
  restoreActiveProxyTakeover: () => Promise<{ ok: true; restored: boolean } | { ok: false; error: string }>;
  getStartupRecoveryNotice: () => Promise<{ type: "success" | "error"; message: string } | null>;
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
  getProxyDiagnostics: () => Promise<{
    overall: "healthy" | "checking" | "error" | "inactive";
    summary: string;
    steps: Record<string, {
      state: "healthy" | "checking" | "error" | "inactive";
      title: string;
      detail: string;
      port?: number;
      solution?: string;
    }>;
  }>;
  getRecentProxyRequests: () => Promise<Array<{
    id: string;
    timestamp: string;
    method: string;
    path: string;
    result: "mock" | "upstream" | "error";
    statusCode: number;
    durationMs: number;
    tranId?: string;
    responseLabel?: string;
    apiName?: string;
    responseValue?: string;
    editorType?: "default" | "test" | "error";
    error?: string;
  }>>;
  clearRecentProxyRequests: () => Promise<{ ok: true }>;
  importApisJsonPick: (
    folderName: string,
  ) => Promise<
    | { ok: true; imported: number; touchedApiNames: string[]; errors: string[] }
    | { ok: false; error: string; errors?: string[] }
  >;
}

export {};
