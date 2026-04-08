import type { ElectronAPI } from "@electron-toolkit/preload";

import type { ProjectFsApi } from "../electron/preload/index.d.ts";

declare global {
  interface Window {
    /** preload `contextBridge` — Next 브라우저 단독 실행 시 없음 */
    electron?: ElectronAPI;
    api?: {
      projects: ProjectFsApi;
    };
  }
}

export {};
