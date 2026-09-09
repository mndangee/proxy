"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type JSX, type SetStateAction } from "react";

import CloseIcon from "@/assets/svg/CloseIcon";
import ExpandArrowIcon from "@/assets/svg/ExpandArrowIcon";
import Btn from "@/components/common/Btn";
import CheckBox from "@/components/common/CheckBox";
import Input from "@/components/common/Input";
import { ConfirmModal } from "@/components/common/modals";
import { detectServerCommand, getAppProxyConfig, getMockProxyStatus, getProxyDiagnostics, hasProjectDiskApi, pickServerDirectory, prepareProxyTakeover, restoreActiveProxyTakeover, restoreProxyTakeover, setAppProxyConfig, type MockProxyStatus, type ProxyDiagnostics } from "@/libs/projects/store";
import type { AppProxyConfig } from "@/types";

interface ProxyServerSettingsCardProps {
  onClose?: () => void;
  onBusyChange?: (busy: boolean) => void;
}

type ProxySetupErrorField = "clientPort" | "upstreamPort" | "mockPort" | "workdir" | "command";
type ProxySetupError = {
  stage: "validation" | "takeover" | "upstream" | "mock" | "gateway" | "restore";
  title: string;
  description: string;
  solution: string;
  technicalDetail?: string;
  fields?: ProxySetupErrorField[];
};
type ProxyConnectionStage =
  | "idle"
  | "validating"
  | "detecting-server-command"
  | "checking-current-port"
  | "waiting-for-takeover-confirmation"
  | "switching-current-port"
  | "applying-configuration"
  | "starting-services"
  | "verifying-connection"
  | "connected"
  | "stopping-services"
  | "restoring-project-server"
  | "failed";
type ProxyConnectionProgress = { stage: ProxyConnectionStage; startedAt: number | null; updatedAt: number };

function parsePort(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return null;
  const port = Number.parseInt(normalized, 10);
  return Number.isFinite(port) && port >= 1 && port <= 65535 ? port : null;
}

function setupErrorFromTechnical(
  stage: ProxySetupError["stage"],
  technicalDetail: string,
  fallbackDescription: string,
  fields?: ProxySetupErrorField[],
): ProxySetupError {
  const detail = technicalDetail.trim();
  if (/EADDRINUSE|address already in use|port-still-in-use/i.test(detail)) {
    return { stage, title: "포트를 사용할 수 없습니다", description: fallbackDescription, solution: "사용 중인 프로그램을 종료하거나 충돌하는 포트를 변경한 뒤 다시 연결해 주세요.", technicalDetail: detail, fields };
  }
  if (/ECONNREFUSED|connection refused/i.test(detail)) {
    return { stage, title: "프로젝트 서버에 연결할 수 없습니다", description: fallbackDescription, solution: "프로젝트 서버 실행 상태와 서버 이동 포트를 확인해 주세요.", technicalDetail: detail, fields: fields ?? ["upstreamPort"] };
  }
  if (/Node\.js|node\s*v?\d+|code\s*1|exited.*1/i.test(detail)) {
    return { stage, title: "프로젝트 서버가 실행 중 종료되었습니다", description: fallbackDescription, solution: "서버 코드 폴더와 감지된 실행 방법, 프로젝트에 필요한 Node 버전을 확인해 주세요.", technicalDetail: detail, fields: fields ?? ["command"] };
  }
  if (/ENOENT|no such file|not found|invalid-directory/i.test(detail)) {
    return { stage, title: "서버 폴더 또는 실행 파일을 찾을 수 없습니다", description: fallbackDescription, solution: "프로젝트 서버 코드가 있는 폴더를 다시 선택해 주세요.", technicalDetail: detail, fields: fields ?? ["workdir"] };
  }
  return { stage, title: stage === "restore" ? "원래 서버를 복구하지 못했습니다" : "연결을 완료하지 못했습니다", description: fallbackDescription, solution: "설정을 확인한 뒤 다시 연결해 주세요.", ...(detail ? { technicalDetail: detail } : {}), fields };
}

export default function ProxyServerSettingsCard({ onClose, onBusyChange }: ProxyServerSettingsCardProps): JSX.Element {
  const [diskApi] = useState(() => hasProjectDiskApi());
  const [config, setConfig] = useState<AppProxyConfig | null>(null);
  const [clientPortDraft, setClientPortDraft] = useState("7777");
  const [upstreamPortDraft, setUpstreamPortDraft] = useState("7778");
  const [mockPortDraft, setMockPortDraft] = useState("4780");
  const [autoStartDraft, setAutoStartDraft] = useState(false);
  const [workdirDraft, setWorkdirDraft] = useState("");
  const [commandDraft, setCommandDraft] = useState("");
  const [commandHint, setCommandHint] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [error, setError] = useState<ProxySetupError | null>(null);
  const [technicalErrorOpen, setTechnicalErrorOpen] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<MockProxyStatus | null>(null);
  const [diagnostics, setDiagnostics] = useState<ProxyDiagnostics | null>(null);
  const [takeoverConfirm, setTakeoverConfirm] = useState<{ port: number; detail: string } | null>(null);
  const [connectionProgress, setConnectionProgress] = useState<ProxyConnectionProgress>(() => ({ stage: "idle", startedAt: null, updatedAt: Date.now() }));
  const operationInFlightRef = useRef(false);

  const updateConnectionStage = (stage: ProxyConnectionStage, startNew = false): void => {
    const now = Date.now();
    setConnectionProgress((current) => ({ stage, startedAt: stage === "idle" ? null : startNew ? now : (current.startedAt ?? now), updatedAt: now }));
  };

  const showError = (next: ProxySetupError): void => {
    setError(next);
    setTechnicalErrorOpen(false);
    updateConnectionStage("failed");
    if (next.fields?.some((field) => field !== "clientPort")) setAdvancedOpen(true);
  };

  const clearError = (): void => {
    setError(null);
    setTechnicalErrorOpen(false);
  };

  const reloadConfig = useCallback(async () => {
    const next = await getAppProxyConfig();
    setConfig(next);
    setClientPortDraft(String(next.interceptGateway?.clientPort ?? 7777));
    setUpstreamPortDraft(String(next.interceptGateway?.upstreamPort ?? next.proxyServer.upstreamServerPort ?? 7778));
    setMockPortDraft(String(next.proxyServer.port));
    setAutoStartDraft(Boolean(next.proxyServer.upstreamAutoStart));
    setWorkdirDraft(next.proxyServer.upstreamServerWorkdir ?? "");
    setCommandDraft(next.proxyServer.upstreamServerCommand ?? "");
  }, []);

  const reloadStatus = useCallback(async () => {
    if (!diskApi) return;
    const [status, nextDiagnostics] = await Promise.all([getMockProxyStatus(), getProxyDiagnostics()]);
    setRuntimeStatus(status);
    setDiagnostics(nextDiagnostics);
  }, [diskApi]);

  useEffect(() => { void reloadConfig(); }, [reloadConfig]);
  useEffect(() => {
    onBusyChange?.(saveBusy);
  }, [saveBusy, onBusyChange]);
  useEffect(() => {
    if (!diskApi) return;
    void reloadStatus();
    const timer = window.setInterval(() => void reloadStatus(), 1500);
    return () => window.clearInterval(timer);
  }, [diskApi, reloadStatus]);
  useEffect(() => {
    if (saveBusy) return;
    const isConnected = Boolean(runtimeStatus?.interceptGateway?.listening);
    setConnectionProgress((current) => {
      if (isConnected && current.stage !== "connected") return { stage: "connected", startedAt: current.startedAt, updatedAt: Date.now() };
      if (!isConnected && current.stage === "connected") return { stage: "idle", startedAt: null, updatedAt: Date.now() };
      return current;
    });
  }, [runtimeStatus, saveBusy]);

  const startProxy = async (takeoverConfirmed = false): Promise<void> => {
    if (operationInFlightRef.current) return;
    updateConnectionStage("validating", !takeoverConfirmed);
    clearError();
    const clientPort = parsePort(clientPortDraft);
    const upstreamPort = parsePort(upstreamPortDraft);
    const mockPort = parsePort(mockPortDraft);
    if (clientPort == null) return showError({ stage: "validation", title: "현재 서버 포트를 확인해 주세요", description: "현재 서버 포트가 올바르지 않습니다.", solution: "1부터 65535 사이의 포트를 입력해 주세요.", fields: ["clientPort"] });
    if (upstreamPort == null) return showError({ stage: "validation", title: "서버 이동 포트를 확인해 주세요", description: "프로젝트 서버를 옮겨 실행할 포트가 올바르지 않습니다.", solution: "1부터 65535 사이의 포트를 입력해 주세요.", fields: ["upstreamPort"] });
    if (mockPort == null) return showError({ stage: "validation", title: "DataForge 내부 포트를 확인해 주세요", description: "더미 응답 서버가 사용할 포트가 올바르지 않습니다.", solution: "1부터 65535 사이의 포트를 입력해 주세요.", fields: ["mockPort"] });
    if (new Set([clientPort, upstreamPort, mockPort]).size !== 3) return showError({ stage: "validation", title: "입력한 포트가 겹칩니다", description: "각 서버는 서로 다른 포트를 사용해야 합니다.", solution: "현재 서버, 서버 이동, DataForge 내부 포트를 서로 다르게 입력해 주세요.", fields: ["clientPort", "upstreamPort", "mockPort"] });
    if (autoStartDraft && !workdirDraft.trim()) return showError({ stage: "validation", title: "서버 코드 폴더가 필요합니다", description: "프로젝트 서버 자동 연결이 켜져 있지만 서버 폴더가 선택되지 않았습니다.", solution: "프로젝트 서버 코드가 있는 폴더를 선택해 주세요.", fields: ["workdir"] });

    let workdir: string | null = null;
    let serverCommand = commandDraft.trim();
    let stoppedExistingServer = false;
    operationInFlightRef.current = true;
    setSaveBusy(true);
    try {
      workdir = workdirDraft.trim() || null;
      if (autoStartDraft && workdir && !serverCommand) {
        updateConnectionStage("detecting-server-command");
        const detected = await detectServerCommand(workdir);
        if (!detected.ok) {
          showError(setupErrorFromTechnical("upstream", detected.error, "선택한 폴더에서 서버 실행 방법을 자동으로 찾지 못했습니다.", ["command"]));
          return;
        }
        serverCommand = detected.command;
        setCommandDraft(serverCommand);
        setCommandHint(`${detected.packageManager} · ${detected.script} 자동 감지`);
      }
      if (autoStartDraft && workdir) {
        updateConnectionStage(takeoverConfirmed ? "switching-current-port" : "checking-current-port");
        const takeover = await prepareProxyTakeover(clientPort, upstreamPort, workdir, serverCommand, takeoverConfirmed);
        if (!takeover.ok) {
          if (takeover.error === "confirmation-required") {
            updateConnectionStage("waiting-for-takeover-confirmation");
            setTakeoverConfirm({ port: takeover.port ?? clientPort, detail: takeover.detail ?? "사용 중인 서버를 종료한 뒤 DataForge로 전환합니다." });
          } else {
            showError(setupErrorFromTechnical("takeover", `${takeover.error}${takeover.detail ? `: ${takeover.detail}` : ""}`, "현재 포트를 사용 중인 기존 서버를 종료하지 못했습니다.", ["clientPort"]));
          }
          return;
        }
        stoppedExistingServer = takeover.stopped.length > 0;
      }
      updateConnectionStage("applying-configuration");
      const result = await setAppProxyConfig({
        proxyServer: { enabled: true, port: mockPort, upstreamAutoStart: autoStartDraft, upstreamServerWorkdir: workdir, upstreamServerPort: upstreamPort, upstreamServerCommand: serverCommand || null, upstreamNodePath: null },
        interceptGateway: { enabled: true, clientPort, upstreamPort, autoStartUpstream: autoStartDraft, upstreamWorkdir: workdir },
      });
      if (!result.ok) {
        if (stoppedExistingServer && workdir) {
          const restored = await restoreProxyTakeover(clientPort, workdir, serverCommand);
          showError(restored.ok
            ? setupErrorFromTechnical("gateway", result.error, "DataForge 연결을 시작하지 못해 기존 프로젝트 서버를 원래 포트로 복구했습니다.")
            : setupErrorFromTechnical("restore", restored.error, "DataForge 연결에 실패했고 기존 서버도 자동으로 복구하지 못했습니다."));
        } else {
          showError(setupErrorFromTechnical("gateway", result.error, "입력한 설정으로 DataForge 프록시 서버를 시작하지 못했습니다."));
        }
        return;
      }
      setConfig(result.config);
      updateConnectionStage("starting-services");
      let startError = "";
      let started = false;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        updateConnectionStage("verifying-connection");
        const status = await getMockProxyStatus();
        const proxyReady = Boolean(status?.interceptGateway?.listening && status.listening);
        const projectServerReady = !autoStartDraft || Boolean(status?.upstreamSpawn?.running || status?.careMockSpawn?.running);
        if (proxyReady && projectServerReady) {
          setRuntimeStatus(status);
          started = true;
          break;
        }
        startError = status?.interceptGateway?.lastError?.trim()
          || (autoStartDraft ? status?.upstreamSpawn?.lastError?.trim() || status?.careMockSpawn?.lastError?.trim() : "")
          || status?.lastError?.trim()
          || "";
        if (startError) break;
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }
      if (!started) {
        const stopped = await setAppProxyConfig({ proxyServer: { enabled: false }, interceptGateway: { enabled: false, autoStartUpstream: false } });
        if (stopped.ok) setConfig(stopped.config);
        if (stoppedExistingServer && workdir) {
          const restored = await restoreProxyTakeover(clientPort, workdir, serverCommand);
          showError(restored.ok
            ? setupErrorFromTechnical("upstream", startError, "프로젝트 서버를 시작하지 못해 기존 서버를 원래 포트로 복구했습니다.")
            : setupErrorFromTechnical("restore", `${startError}${startError ? " / " : ""}${restored.error}`, "DataForge 연결과 기존 서버 자동 복구에 실패했습니다."));
        } else {
          showError(setupErrorFromTechnical(autoStartDraft ? "upstream" : "gateway", startError, "프록시 서버의 실행 상태를 확인하지 못했습니다."));
        }
        await reloadStatus();
        return;
      }
      await reloadStatus();
      updateConnectionStage("connected");
    } catch (unexpected) {
      const detail = unexpected instanceof Error ? unexpected.message : String(unexpected);
      try {
        const stopped = await setAppProxyConfig({ proxyServer: { enabled: false }, interceptGateway: { enabled: false, autoStartUpstream: false } });
        if (stopped.ok) setConfig(stopped.config);
      } catch {
        // 아래 복구 및 오류 안내를 계속 진행한다.
      }
      if (stoppedExistingServer && workdir) {
        try {
          const restored = await restoreProxyTakeover(clientPort, workdir, serverCommand);
          showError(restored.ok
            ? setupErrorFromTechnical("gateway", detail, "예상하지 못한 오류로 연결을 중단하고 기존 서버를 원래 포트로 복구했습니다.")
            : setupErrorFromTechnical("restore", `${detail} / ${restored.error}`, "연결 중 오류가 발생했고 기존 서버도 자동으로 복구하지 못했습니다."));
        } catch (restoreError) {
          showError(setupErrorFromTechnical("restore", `${detail} / ${restoreError instanceof Error ? restoreError.message : String(restoreError)}`, "연결 중 오류가 발생했고 기존 서버도 자동으로 복구하지 못했습니다."));
        }
      } else {
        showError(setupErrorFromTechnical("gateway", detail, "연결 처리 중 예상하지 못한 오류가 발생했습니다."));
      }
      try { await reloadStatus(); } catch { /* 오류 카드 표시를 유지한다. */ }
    } finally {
      operationInFlightRef.current = false;
      setSaveBusy(false);
    }
  };

  const stopProxy = async (): Promise<void> => {
    if (operationInFlightRef.current) return;
    operationInFlightRef.current = true;
    updateConnectionStage("stopping-services", true);
    setSaveBusy(true);
    clearError();
    try {
      const result = await setAppProxyConfig({ proxyServer: { enabled: false }, interceptGateway: { enabled: false, autoStartUpstream: false } });
      if (result.ok) {
        setConfig(result.config);
        updateConnectionStage("restoring-project-server");
        const restored = await restoreActiveProxyTakeover();
        if (!restored.ok) showError(setupErrorFromTechnical("restore", restored.error, "DataForge 연결은 중지했지만 기존 프로젝트 서버를 자동으로 복구하지 못했습니다."));
        else updateConnectionStage("idle");
      } else showError({ stage: "gateway", title: "연결을 끊지 못했습니다", description: "DataForge 프록시 서버를 정상적으로 중지하지 못했습니다.", solution: "잠시 후 다시 시도하고, 계속되면 앱을 재실행해 주세요." });
      await reloadStatus();
    } catch (unexpected) {
      const detail = unexpected instanceof Error ? unexpected.message : String(unexpected);
      showError(setupErrorFromTechnical("restore", detail, "연결 해제 또는 기존 프로젝트 서버 복구 중 예상하지 못한 오류가 발생했습니다."));
      try { await reloadStatus(); } catch { /* 오류 카드 표시를 유지한다. */ }
    } finally {
      operationInFlightRef.current = false;
      setSaveBusy(false);
    }
  };

  const autoStartState = { autoStart: autoStartDraft };
  const setAutoStartState: Dispatch<SetStateAction<Record<string, boolean>>> = (nextValue) => {
    const next = typeof nextValue === "function" ? nextValue(autoStartState) : nextValue;
    setAutoStartDraft(Boolean(next.autoStart));
    clearError();
  };

  const selectServerDirectory = async (): Promise<void> => {
    clearError();
    const picked = await pickServerDirectory();
    if (!picked.ok) return;
    setWorkdirDraft(picked.path);
    const detected = await detectServerCommand(picked.path);
    if (detected.ok) {
      setCommandDraft(detected.command);
      setCommandHint(`${detected.packageManager} · ${detected.script} 자동 감지`);
    } else {
      setCommandDraft("");
      setCommandHint("");
      showError(setupErrorFromTechnical("upstream", detected.error, "폴더는 선택했지만 서버 실행 방법을 찾지 못했습니다.", ["command"]));
    }
  };

  if (!config) return <div className="w-full p-8"><p className="typo-body-2-normal text-label-normal">설정을 불러오는 중…</p></div>;

  const running = Boolean(runtimeStatus?.interceptGateway?.listening);
  const runtimeError = runtimeStatus?.interceptGateway?.lastError?.trim() || runtimeStatus?.lastError?.trim() || "";
  const upstreamRunning = Boolean(runtimeStatus?.upstreamSpawn?.running || runtimeStatus?.careMockSpawn?.running);
  const overall = diagnostics?.overall ?? (running ? "healthy" : runtimeError ? "error" : "inactive");
  const overallTitle = overall === "healthy" ? "API 연결 정상" : overall === "checking" ? "연결 확인 중" : overall === "error" ? "확인이 필요합니다" : "연결되지 않음";
  const diagnosticSteps = diagnostics ? Object.values(diagnostics.steps) : [];

  return (
    <div className="w-full bg-white" data-connection-stage={connectionProgress.stage}>
      <ConfirmModal
        isOpen={takeoverConfirm != null}
        anchorMain
        title={`포트 ${takeoverConfirm?.port ?? clientPortDraft}를 사용 중인 서버를 종료할까요?`}
        message={<p className="whitespace-pre-wrap text-left">{takeoverConfirm?.detail}</p>}
        cancelLabel="취소"
        confirmLabel="종료하고 전환"
        onClose={() => {
          setTakeoverConfirm(null);
          updateConnectionStage("idle");
        }}
        onConfirm={async () => {
          setTakeoverConfirm(null);
          await startProxy(true);
        }}
      />
      <header className="border-border-enabled flex items-start justify-between gap-3 border-b bg-white px-6 py-5">
        <div>
          <h2 className="typo-title-2 text-label-normal font-bold">더미 응답 연결</h2>
          <p className="typo-body-2-normal text-label-assistant mt-1">프로젝트의 요청 주소를 바꾸지 않고 저장한 더미 응답을 사용합니다.</p>
        </div>
        <button type="button" disabled={saveBusy} className="hover:bg-background-secondary-weak mt-1 cursor-pointer rounded p-1 text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40" aria-label="닫기" onClick={onClose}><CloseIcon /></button>
      </header>

      <div className="px-6 py-5">

      <div className="flex items-center justify-between gap-4">
        <p className="typo-body-2-normal text-label-normal font-medium">처음 사용하시나요?</p>
        <button type="button" className="typo-caption-1 text-label-neutral hover:text-label-normal cursor-pointer font-semibold underline underline-offset-4" onClick={() => setGuideOpen((open) => !open)}>
          {guideOpen ? "연결 방법 접기" : "연결 방법 보기"}
        </button>
      </div>

      {guideOpen ? (
        <section className="rounded-4 mt-3 border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="typo-body-1-normal text-label-normal font-semibold">처음 연결하시나요?</h3>
              <p className="typo-caption-1 text-label-assistant mt-1">프로젝트 코드를 수정하지 않아도 아래 세 단계로 더미 응답을 사용할 수 있습니다.</p>
            </div>
            <button type="button" className="text-label-assistant cursor-pointer text-lg leading-none" aria-label="사용 방법 닫기" onClick={() => setGuideOpen(false)}>×</button>
          </div>
          <ol className="mt-4 space-y-2">
            <li className="rounded-3 border-border-enabled grid grid-cols-[24px_112px_1px_minmax(0,1fr)] items-center gap-4 border bg-white px-4 py-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-700">1</span>
              <p className="typo-body-2-normal text-label-normal font-semibold">서버 폴더 선택</p>
              <span className="h-5 w-px bg-gray-200" />
              <p className="typo-caption-1 text-label-assistant">추가 설정에서 서버 코드 폴더를 선택하면 실행 방법을 자동으로 찾습니다.</p>
            </li>
            <li className="rounded-3 border-border-enabled grid grid-cols-[24px_112px_1px_minmax(0,1fr)] items-center gap-4 border bg-white px-4 py-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-700">2</span>
              <p className="typo-body-2-normal text-label-normal font-semibold">현재 포트 확인</p>
              <span className="h-5 w-px bg-gray-200" />
              <p className="typo-caption-1 text-label-assistant">프로젝트가 현재 호출하는 서버 포트가 맞는지 확인합니다.</p>
            </li>
            <li className="rounded-3 border-border-enabled grid grid-cols-[24px_112px_1px_minmax(0,1fr)] items-center gap-4 border bg-white px-4 py-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-700">3</span>
              <p className="typo-body-2-normal text-label-normal font-semibold">연결 시작</p>
              <span className="h-5 w-px bg-gray-200" />
              <p className="typo-caption-1 text-label-assistant">더미 응답 연결을 누른 뒤 프로젝트는 평소처럼 사용하면 됩니다.</p>
            </li>
          </ol>
        </section>
      ) : null}

      <section className={`rounded-4 mt-4 border bg-white p-4 shadow-sm ${overall === "healthy" ? "border-emerald-200" : overall === "checking" ? "border-amber-200" : overall === "error" ? "border-red-200" : "border-gray-200"}`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <span className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${overall === "healthy" ? "bg-emerald-500" : overall === "checking" ? "bg-amber-500" : overall === "error" ? "bg-red-500" : "bg-gray-300"}`} />
            <div className="min-w-0 flex-1">
              <p className={`typo-body-1-normal font-semibold ${overall === "healthy" ? "text-label-normal" : overall === "checking" ? "text-amber-800" : overall === "error" ? "text-red-800" : "text-label-normal"}`}>{overallTitle}</p>
              <p className="typo-body-2-normal text-label-assistant mt-1">{diagnostics?.summary || runtimeError || "현재 서버 포트를 확인하고 연결을 시작해 주세요."}</p>
            </div>
          </div>
          {diagnostics ? (
          <button type="button" className="typo-caption-1 text-label-neutral hover:text-label-normal shrink-0 cursor-pointer font-semibold underline underline-offset-4" onClick={() => setDiagnosticsOpen((open) => !open)}>
            {diagnosticsOpen ? "연결 상태 접기" : "연결 상태 자세히 보기"}
          </button>
          ) : null}
        </div>
      </section>

      {diagnosticsOpen && diagnosticSteps.length > 0 ? (
        <section className="rounded-4 mt-3 divide-y border border-gray-200 bg-white px-5">
          {diagnosticSteps.map((step) => (
            <div key={step.title} className="flex gap-3 py-4">
              <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${step.state === "healthy" ? "bg-emerald-500" : step.state === "checking" ? "bg-amber-500" : step.state === "error" ? "bg-red-500" : "bg-gray-300"}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="typo-body-2-normal text-label-normal font-semibold">{step.title}</p>
                  {step.port ? <span className="typo-caption-1 text-label-assistant">:{step.port}</span> : null}
                </div>
                <p className="typo-caption-1 text-label-assistant mt-1">{step.detail}</p>
                {step.solution && step.state !== "healthy" ? <p className="typo-caption-1 mt-2 text-red-700">해결 방법: {step.solution}</p> : null}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {!diskApi ? <p className="typo-caption-1 mt-3 text-amber-700">더미 응답 연결은 설치한 데스크톱 앱에서 사용할 수 있습니다.</p> : null}

      <section className="mt-6">
        <h3 className="typo-body-1-normal text-label-normal font-semibold">프로젝트 서버 정보</h3>
        <p className="typo-caption-1 text-label-assistant mt-1">브라우저 주소에 표시된 현재 포트만 입력하세요. 서버를 옮겨 실행할 포트는 자동으로 설정됩니다.</p>
        <div className="mt-4">
          <label className="block">
            <span className="typo-body-2-normal text-label-normal font-medium">현재 서버 포트</span>
            <div className="mt-2 flex items-center gap-3"><Input value={clientPortDraft} width={140} size="medium" disabled={saveBusy || running} error={Boolean(error?.fields?.includes("clientPort"))} onChange={(event) => {
              const nextValue = event.target.value;
              setClientPortDraft(nextValue);
              const nextPort = parsePort(nextValue);
              if (nextPort != null) setUpstreamPortDraft(String(nextPort === 65535 ? 65534 : nextPort + 1));
              clearError();
            }} /><span className="typo-caption-1 text-label-assistant">localhost:{clientPortDraft || "-"}</span></div>
          </label>
        </div>
      </section>

      <section className="mt-6 border-t border-gray-100 pt-5">
        <button type="button" className="typo-body-2-normal text-label-normal flex w-full cursor-pointer items-center justify-between font-semibold" onClick={() => setAdvancedOpen((open) => !open)} aria-expanded={advancedOpen}>
          <span>추가 설정</span>
          <ExpandArrowIcon className={`text-label-normal h-[10px] w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
        </button>
        {advancedOpen ? (
          <div className="mt-4 space-y-5">
            <div className="grid grid-cols-2 items-start gap-4">
            <label className="block">
              <span className="typo-body-2-normal text-label-normal font-medium">서버 이동 포트</span>
              <p className="typo-caption-1 text-label-assistant mt-1 mb-2">자동으로 설정됩니다. 다른 프로그램과 충돌할 때만 변경하세요.</p>
              <Input value={upstreamPortDraft} width="100%" size="small" disabled={saveBusy || running} error={Boolean(error?.fields?.includes("upstreamPort"))} onChange={(event) => { setUpstreamPortDraft(event.target.value); clearError(); }} />
            </label>
            <label className="block">
              <span className="typo-body-2-normal text-label-normal font-medium">더미 서버 내부 포트</span>
              <p className="typo-caption-1 text-label-assistant mt-1 mb-2">다른 프로그램과 충돌할 때만 변경하세요.</p>
              <Input value={mockPortDraft} width="100%" size="small" disabled={saveBusy || running} error={Boolean(error?.fields?.includes("mockPort"))} onChange={(event) => { setMockPortDraft(event.target.value); clearError(); }} />
            </label>
            </div>
            <div className="rounded-4 border-border-enabled bg-gray-50 p-4">
            <CheckBox size="small" value="autoStart" label="실행 중인 프로젝트 서버 자동 연결 (권장)" disabled={saveBusy || running} checkBoxStateList={autoStartState} setCheckBoxStateList={setAutoStartState} className="typo-body-2-normal text-label-normal" />
            {autoStartDraft ? (
              <div className="mt-4 space-y-4">
                <p className="typo-caption-1 text-label-assistant">DataForge가 현재 서버를 안전하게 전환하고, 연결을 끊으면 원래 포트로 되돌립니다.</p>
                <label className="block">
                  <span className="typo-body-2-normal text-label-normal font-medium">서버 코드 폴더</span>
                  <div className="mt-2 flex gap-2">
                    <Input value={workdirDraft} width="100%" size="small" placeholder="/Users/…/project/server" disabled={saveBusy || running} error={Boolean(error?.fields?.includes("workdir"))} onChange={(event) => { setWorkdirDraft(event.target.value); clearError(); }} />
                    <button type="button" className="typo-body-2-normal shrink-0 rounded border border-gray-300 bg-white px-4 text-label-normal" disabled={saveBusy || running} onClick={() => void selectServerDirectory()}>폴더 선택</button>
                  </div>
                </label>
                <label className="block">
                  <span className="typo-body-2-normal text-label-normal font-medium">감지된 실행 방법</span>
                  <p className="typo-caption-1 text-label-assistant mt-1 mb-2">{commandHint || "폴더를 선택하면 자동으로 설정합니다. 필요한 경우에만 직접 수정하세요."}</p>
                  <Input value={commandDraft} width="100%" size="small" placeholder="자동 감지" disabled={saveBusy || running} error={Boolean(error?.fields?.includes("command"))} onChange={(event) => { setCommandDraft(event.target.value); setCommandHint("직접 입력"); clearError(); }} />
                </label>
              </div>
            ) : null}
            {running && autoStartDraft ? <p className="typo-caption-1 text-label-assistant">프로젝트 서버: {upstreamRunning ? "정상 연결됨" : "연결 확인 중"}</p> : null}
            </div>
          </div>
        ) : null}
      </section>

      {error ? (
        <section role="alert" className="rounded-4 mt-5 border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />
            <div className="min-w-0 flex-1">
              <h3 className="typo-body-1-normal font-semibold text-red-900">{error.title}</h3>
              <p className="typo-body-2-normal mt-1 text-red-800">{error.description}</p>
              <div className="mt-3 rounded-3 border border-red-100 bg-white/70 px-4 py-3">
                <p className="typo-caption-1 font-semibold text-red-900">해결 방법</p>
                <p className="typo-caption-1 mt-1 text-red-800">{error.solution}</p>
              </div>
              {error.technicalDetail ? (
                <div className="mt-3">
                  <button type="button" className="typo-caption-1 cursor-pointer font-semibold text-red-800 underline underline-offset-4" onClick={() => setTechnicalErrorOpen((open) => !open)}>
                    {technicalErrorOpen ? "기술 정보 접기" : "기술 정보 보기"}
                  </button>
                  {technicalErrorOpen ? <pre className="typo-caption-1 mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-3 bg-red-100/70 p-3 text-left text-red-900">{error.technicalDetail}</pre> : null}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      </div>

      <footer className="border-border-enabled sticky bottom-0 z-10 flex items-center justify-between gap-4 border-t bg-gray-50 px-6 py-3">
        <p className="typo-caption-1 text-label-assistant">현재 상태: <strong className={running ? "text-emerald-700" : "text-label-normal"}>{running ? "활성 프록시 가동 중" : "연결 대기"}</strong></p>
        <div className="flex gap-3">
          {running || config.interceptGateway?.enabled ? <Btn category="secondary" variant size="medium" width={120} disabled={saveBusy} onClick={() => void stopProxy()}>연결 끊기</Btn> : null}
          {!running ? <Btn category="primary" size="medium" width={140} disabled={saveBusy || !diskApi} onClick={() => void startProxy()}>{saveBusy ? "연결 중…" : "연결 시작"}</Btn> : null}
        </div>
      </footer>
    </div>
  );
}
