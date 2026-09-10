/// <reference path="./vite-env.d.ts" />
import { app, shell, BrowserWindow, ipcMain } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";

import {
  flushProxyRequestHistory,
  initializeProxyRequestHistory,
  stopInterceptGatewayServer,
} from "./intercept-gateway";
import { applyMockProxyFromConfig, registerMockProxyIpc, stopMockProxyServer } from "./mock-proxy-server";
import { disableProxyConfigAfterCrashRecovery, registerProjectFsIpc } from "./project-fs";
import { restoreActiveProxyTakeover, restorePendingProxyTakeoverOnStartup } from "./proxy-port-takeover";

let quitCleanupStarted = false;
let quitCleanupFinished = false;
type StartupRecoveryNotice = { type: "success" | "error"; message: string };
let startupRecoveryNotice: StartupRecoveryNotice | null = null;

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId("com.electron");

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // IPC test
  ipcMain.on("ping", () => console.log("pong"));

  /** IPC는 app.ready 이후에만 등록(Electron 버전에 따른 핸들러 유실 방지) */
  registerProjectFsIpc();
  registerMockProxyIpc();
  ipcMain.removeHandler("proxy:get-startup-recovery-notice");
  ipcMain.handle("proxy:get-startup-recovery-notice", () => {
    const notice = startupRecoveryNotice;
    startupRecoveryNotice = null;
    return notice;
  });
  await initializeProxyRequestHistory();
  const crashRecovery = await restorePendingProxyTakeoverOnStartup();
  if (!crashRecovery.ok || crashRecovery.restored) {
    await disableProxyConfigAfterCrashRecovery().catch((error) => console.error("[startup-recovery] failed to disable proxy config:", error));
    if (!crashRecovery.ok) {
      console.error("[startup-recovery]", crashRecovery.error);
      startupRecoveryNotice = {
        type: "error",
        message: `프로젝트 서버를 자동으로 복구하지 못했습니다.\n\n${crashRecovery.error}\n\n프록시 설정에서 서버 폴더와 실행 방법을 확인한 뒤 다시 연결해 주세요.`,
      };
    } else {
      startupRecoveryNotice = { type: "success", message: "이전에 전환했던 프로젝트 서버를 원래 포트로 복구했습니다." };
    }
  } else {
    void applyMockProxyFromConfig();
  }

  createWindow();

  app.on("activate", function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", (event) => {
  if (quitCleanupFinished) return;
  event.preventDefault();
  if (quitCleanupStarted) return;
  quitCleanupStarted = true;

  void (async () => {
    try {
      // 원래 포트를 복구하기 전에 DataForge가 점유한 포트와 관리 서버를 모두 정리한다.
      await stopInterceptGatewayServer();
      await stopMockProxyServer();
      await flushProxyRequestHistory();
      const restored = await restoreActiveProxyTakeover();
      if (!restored.ok) console.error("[app-quit] failed to restore the original project server:", restored.error);
    } catch (error) {
      console.error("[app-quit] proxy cleanup failed:", error);
    } finally {
      quitCleanupFinished = true;
      app.quit();
    }
  })();
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
