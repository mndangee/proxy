"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import CloseIcon from "@/assets/svg/CloseIcon";
import Btn from "@/components/common/Btn";
import CheckBox from "@/components/common/CheckBox";
import Input from "@/components/common/Input";
import { getAppProxyConfig, getMockProxyStatus, hasProjectDiskApi, setAppProxyConfig, type MockProxyStatus } from "@/libs/projects/store";
import type { AppProxyConfig } from "@/types";

const STATUS_POLL_MS = 2000;
const MODAL_ACTION_BTN_CLASS = "!w-auto min-w-[168px] shrink-0";
const MODAL_SAVE_BTN_CLASS = "!w-auto min-w-[88px] shrink-0";

interface ProxyServerSettingsCardProps {
  onClose?: () => void;
}

export default function ProxyServerSettingsCard({ onClose }: ProxyServerSettingsCardProps) {
  const [diskApi] = useState(() => hasProjectDiskApi());
  const [config, setConfig] = useState<AppProxyConfig | null>(null);
  const [portDraft, setPortDraft] = useState("");
  const [status, setStatus] = useState<MockProxyStatus | null>(null);
  const [clientPortDraft, setClientPortDraft] = useState("7779");
  const [upstreamPortDraft, setUpstreamPortDraft] = useState("7778");
  const [gatewayError, setGatewayError] = useState("");
  const [upstreamAutoStartDraft, setUpstreamAutoStartDraft] = useState(false);
  const [upstreamWorkdirDraft, setUpstreamWorkdirDraft] = useState("");
  const [upstreamSaveError, setUpstreamSaveError] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);

  const reloadConfig = useCallback(async () => {
    const c = await getAppProxyConfig();
    setConfig(c);
    setPortDraft(String(c.proxyServer.port));
  }, []);

  const bumpStatus = useCallback(async () => {
    if (!diskApi) {
      setStatus(null);
      return;
    }
    setStatus(await getMockProxyStatus());
  }, [diskApi]);

  useEffect(() => {
    void reloadConfig();
  }, [reloadConfig]);

  useEffect(() => {
    void bumpStatus();
    if (!diskApi) return;
    const id = window.setInterval(() => void bumpStatus(), STATUS_POLL_MS);
    return () => window.clearInterval(id);
  }, [diskApi, bumpStatus]);

  useEffect(() => {
    if (config) {
      const ig = config.interceptGateway;
      setClientPortDraft(String(ig?.clientPort ?? 7779));
      setUpstreamPortDraft(String(ig?.upstreamPort ?? 7778));
      setUpstreamAutoStartDraft(Boolean(config.proxyServer.upstreamAutoStart));
      setUpstreamWorkdirDraft(config.proxyServer.upstreamServerWorkdir ?? "");
    }
  }, [config]);

  const statusOverview = useMemo(() => {
    if (!diskApi || !config) {
      return {
        tone: "muted" as const,
        headline: "Electron 앱에서 연결 상태를 확인하세요",
        hint: "브라우저만으로는 로컬 서버가 동작하지 않습니다.",
      };
    }
    const mockListen = status?.listening;
    const mockErr = status?.lastError;
    const mockPort = status?.port ?? config.proxyServer.port;
    const gwOn = Boolean(config.interceptGateway?.enabled);
    const gwListen = status?.interceptGateway?.listening;
    const gwErr = status?.interceptGateway?.lastError;
    const gwPort = status?.interceptGateway?.port ?? config.interceptGateway?.clientPort;

    if (mockErr) {
      return { tone: "error" as const, headline: "모의 서버 오류", hint: mockErr };
    }
    if (gwOn && gwErr) {
      return { tone: "error" as const, headline: "게이트웨이 오류", hint: gwErr };
    }
    if (mockListen && gwOn && gwListen) {
      return {
        tone: "ready" as const,
        headline: "네트워크 게이트웨이 준비 완료",
        hint: `모의 서버 localhost:${mockPort} · 게이트웨이 localhost:${gwPort ?? "—"}`,
      };
    }
    if (mockListen && !gwOn) {
      return {
        tone: "ready" as const,
        headline: "모의 서버 실행 중",
        hint: "가로채기 시작을 누르면 API 가로채기(게이트웨이)를 켤 수 있습니다.",
      };
    }
    if (mockListen && gwOn && !gwListen && !gwErr) {
      return { tone: "warn" as const, headline: "게이트웨이 기동 중…", hint: "잠시 후 다시 확인해 주세요." };
    }
    if (config.proxyServer.enabled && !mockListen) {
      return { tone: "warn" as const, headline: "모의 서버 기동 중…", hint: "포트 충돌이 없는지 확인해 주세요." };
    }
    return {
      tone: "muted" as const,
      headline: "프록시 대기 중",
      hint: "가로채기 시작으로 모의 서버와 게이트웨이를 켤 수 있습니다.",
    };
  }, [diskApi, config, status]);

  const onDisableGateway = async () => {
    setSaveBusy(true);
    try {
      const r = await setAppProxyConfig({ interceptGateway: { enabled: false, autoStartUpstream: false } });
      if (r.ok) {
        setConfig(r.config);
        await bumpStatus();
      }
    } finally {
      setSaveBusy(false);
    }
  };

  const onApplyAutoIntercept = async () => {
    setGatewayError("");
    const clientPort = Number.parseInt(clientPortDraft.replace(/\s/g, ""), 10);
    const upstreamPort = Number.parseInt(upstreamPortDraft.replace(/\s/g, ""), 10);
    const mockPort = Number.parseInt(portDraft.replace(/\s/g, ""), 10);

    if (!Number.isFinite(clientPort) || clientPort < 1 || clientPort > 65535) {
      setGatewayError("클라이언트 포트는 1~65535 사이여야 합니다.");
      return;
    }
    if (!Number.isFinite(upstreamPort) || upstreamPort < 1 || upstreamPort > 65535) {
      setGatewayError("프로젝트 서버 포트는 1~65535 사이여야 합니다.");
      return;
    }
    if (!Number.isFinite(mockPort) || mockPort < 1 || mockPort > 65535) {
      setGatewayError("프록시 서버 포트를 먼저 올바르게 입력해 주세요.");
      return;
    }
    if (clientPort === upstreamPort) {
      setGatewayError("클라이언트 포트와 프로젝트 서버 포트는 달라야 합니다.");
      return;
    }
    if (clientPort === mockPort) {
      setGatewayError("클라이언트 포트와 프록시 서버 포트는 달라야 합니다.");
      return;
    }
    if (upstreamPort === mockPort) {
      setGatewayError("프로젝트 서버 포트와 프록시 서버 포트는 달라야 합니다.");
      return;
    }

    setSaveBusy(true);
    try {
      const r = await setAppProxyConfig({
        proxyServer: {
          enabled: true,
          port: mockPort,
          upstreamServerPort: upstreamPort,
          careDummyServerPort: upstreamPort,
        },
        interceptGateway: {
          enabled: true,
          clientPort,
          upstreamPort,
        },
      });
      if (r.ok) {
        setConfig(r.config);
        setPortDraft(String(r.config.proxyServer.port));
        setClientPortDraft(String(r.config.interceptGateway?.clientPort ?? clientPort));
        setUpstreamPortDraft(String(r.config.interceptGateway?.upstreamPort ?? upstreamPort));
        await bumpStatus();
      } else {
        setGatewayError("자동 가로채기 설정 저장에 실패했습니다.");
      }
    } finally {
      setSaveBusy(false);
    }
  };

  const onSaveUpstreamAutoStart = async () => {
    setUpstreamSaveError("");
    const workdir = upstreamWorkdirDraft.trim();
    if (upstreamAutoStartDraft && !workdir) {
      setUpstreamSaveError("자동 실행을 켜려면 프로젝트 서버 폴더를 입력해 주세요.");
      return;
    }
    setSaveBusy(true);
    try {
      const r = await setAppProxyConfig({
        proxyServer: {
          upstreamAutoStart: upstreamAutoStartDraft,
          upstreamServerWorkdir: workdir || null,
        },
      });
      if (r.ok) {
        setConfig(r.config);
        setUpstreamAutoStartDraft(Boolean(r.config.proxyServer.upstreamAutoStart));
        setUpstreamWorkdirDraft(r.config.proxyServer.upstreamServerWorkdir ?? "");
        await bumpStatus();
      } else {
        setUpstreamSaveError("업스트림 자동 실행 저장에 실패했습니다.");
      }
    } finally {
      setSaveBusy(false);
    }
  };

  const autoStartCheckState = { upstreamAutoStart: upstreamAutoStartDraft };
  const syncAutoStartCheckState: Dispatch<SetStateAction<Record<string, boolean>>> = (nextValue) => {
    const next = typeof nextValue === "function" ? nextValue(autoStartCheckState) : nextValue;
    setUpstreamAutoStartDraft(Boolean(next.upstreamAutoStart));
    if (upstreamSaveError) setUpstreamSaveError("");
  };

  const overviewAccent =
    statusOverview.tone === "ready"
      ? "border-emerald-200/80 from-emerald-50/90 to-background-white"
      : statusOverview.tone === "warn"
        ? "border-amber-200/80 from-amber-50/80 to-background-white"
        : statusOverview.tone === "error"
          ? "border-red-200/80 from-red-50/80 to-background-white"
          : "border-gray-200 from-gray-50/90 to-background-white";

  const modalSectionClass = "rounded-4 border border-gray-200 bg-background-white px-6 py-4 shadow-sm";
  const modalSectionTitleClass = "typo-body-1-normal text-label-normal font-semibold";

  if (config == null) {
    return (
      <div className="w-full space-y-5 p-8">
        <p className="typo-body-2-normal text-label-normal">설정을 불러오는 중…</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-5 p-8">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="typo-title-2 text-label-normal font-bold">프록시 설정</h2>
          <p className="typo-body-2-normal text-label-assistant mt-2 leading-relaxed">
            모의 서버 및 요청/응답 방식을 구성합니다. <br />
            프록시 설정을 통해 API 가로채기 및 업스트림 서버 관리를 효율적으로 제어할 수 있습니다.
          </p>
        </div>
        <button
          type="button"
          className="hover:bg-background-secondary-weak mt-1 cursor-pointer rounded p-1 text-neutral-900 hover:text-neutral-700"
          aria-label="닫기"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </header>

      {!diskApi ? (
        <p className="typo-body-2-normal text-label-normal">
          Electron 앱으로 실행해야 실제로 포트에 뜹니다. <br />
          브라우저만 켠 경우 설정은 저장되어도 로컬 서버는 동작하지 않습니다.
        </p>
      ) : null}

      <section className="rounded-4 border border-gray-200 bg-gray-50/70 p-5">
        <p className={modalSectionTitleClass}>빠른 설정</p>
        <ul className="typo-body-2-normal text-label-assistant mt-3">
          <li className="mb-2">1. 프로젝트 서버 폴더 경로를 지정하세요.</li>
          <li className="mb-2">2. 가로채기 포트와 서버 포트를 겹치지 않게 설정하세요.</li>
          <li>
            3. <strong>&apos;가로채기 시작&apos;</strong> 버튼을 눌러 활성화하세요.
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <div className={modalSectionTitleClass}>업스트림 자동 실행</div>
          <div className="">
            <CheckBox
              size="small"
              value="upstreamAutoStart"
              label="서버 시작 시 업스트림 자동 실행 활성화"
              disabled={saveBusy}
              checkBoxStateList={autoStartCheckState}
              setCheckBoxStateList={syncAutoStartCheckState}
              className="typo-body-2-normal text-label-normal"
            />
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <div className="typo-caption-1 text-label-primary mb-3">프로젝트 서버 폴더(dummy.server.js 위치)</div>
            <Input
              value={upstreamWorkdirDraft}
              width="100%"
              size="small"
              placeholder="/Users/…/care/server"
              disabled={saveBusy}
              error={!!upstreamSaveError}
              onChange={(e) => {
                setUpstreamWorkdirDraft(e.target.value);
                if (upstreamSaveError) setUpstreamSaveError("");
              }}
            />
          </div>
          <Btn category="secondary" size="small" width="auto" className={MODAL_SAVE_BTN_CLASS} disabled={saveBusy} onClick={() => void onSaveUpstreamAutoStart()}>
            저장
          </Btn>
        </div>
        {upstreamSaveError ? <p className="typo-caption-1 text-label-negative mt-2">{upstreamSaveError}</p> : null}
      </section>

      <section className="mt-8">
        <div className={`mb-3 ${modalSectionTitleClass}`}>포트 설정</div>
        <div className="flex items-center justify-between gap-5">
          <div className="">
            <span className="typo-caption-1 text-label-primary mb-2">API 가로채기 포트 (게이트웨이)</span>
            <Input
              value={clientPortDraft}
              width="100%"
              size="small"
              disabled={saveBusy}
              error={!!gatewayError}
              onChange={(e) => {
                setClientPortDraft(e.target.value);
                if (gatewayError) setGatewayError("");
              }}
            />
          </div>
          <div className="">
            <span className="typo-caption-1 text-label-primary mb-2">프로젝트 서버 포트</span>
            <Input
              value={upstreamPortDraft}
              width="100%"
              size="small"
              disabled={saveBusy}
              error={!!gatewayError}
              onChange={(e) => {
                setUpstreamPortDraft(e.target.value);
                if (gatewayError) setGatewayError("");
              }}
            />
          </div>
          <div className="">
            <span className="typo-caption-1 text-label-primary mb-2">프록시(모의) 서버 포트</span>
            <Input
              value={portDraft}
              width="100%"
              size="small"
              disabled={saveBusy}
              error={!!gatewayError}
              onChange={(e) => {
                setPortDraft(e.target.value);
                if (gatewayError) setGatewayError("");
              }}
            />
          </div>
        </div>
        {gatewayError ? <p className="typo-caption-1 text-label-negative mt-3">{gatewayError}</p> : null}
      </section>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-100 pt-5">
        {config.interceptGateway?.enabled ? (
          <Btn category="secondary" size="medium" width="auto" className={MODAL_ACTION_BTN_CLASS} disabled={saveBusy} onClick={() => void onDisableGateway()}>
            게이트웨이 끄기
          </Btn>
        ) : null}
        <Btn
          category="primary"
          size="medium"
          width="auto"
          className={MODAL_ACTION_BTN_CLASS}
          disabled={saveBusy}
          startIcon={<span className="text-xs leading-none">▷</span>}
          onClick={() => void onApplyAutoIntercept()}
        >
          가로채기 시작
        </Btn>
      </div>
    </div>
  );
}
