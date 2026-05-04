"use client";

import { useCallback, useEffect, useState } from "react";

import Btn from "@/components/common/Btn";
import CheckBox, { type checkBoxObjectType } from "@/components/common/CheckBox";
import Input from "@/components/common/Input";
import {
  getAppProxyConfig,
  getMockProxyStatus,
  hasProjectDiskApi,
  setAppProxyConfig,
  type MockProxyStatus,
} from "@/libs/projects/store";
import type { AppProxyConfig } from "@/types";

const STATUS_POLL_MS = 2000;
const PROXY_ENABLED_KEY = "proxy-enabled";
const CARE_DUMMY_AUTO_KEY = "upstream-auto";

interface ProxyServerSettingsCardProps {
  inModal?: boolean;
}

export default function ProxyServerSettingsCard({ inModal = false }: ProxyServerSettingsCardProps) {
  const [diskApi] = useState(() => hasProjectDiskApi());
  const [config, setConfig] = useState<AppProxyConfig | null>(null);
  const [enabledCheck, setEnabledCheck] = useState<checkBoxObjectType>({ [PROXY_ENABLED_KEY]: false });
  const [portDraft, setPortDraft] = useState("");
  const [status, setStatus] = useState<MockProxyStatus | null>(null);
  const [portError, setPortError] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [profileDraft, setProfileDraft] = useState<"legacy-tran-envelope" | "generic-json">("legacy-tran-envelope");
  const [tranAliasesDraft, setTranAliasesDraft] = useState("{}");
  const [tranAliasesError, setTranAliasesError] = useState("");
  const [careAutoCheck, setCareAutoCheck] = useState<checkBoxObjectType>({ [CARE_DUMMY_AUTO_KEY]: false });
  const [careWorkdirDraft, setCareWorkdirDraft] = useState("");
  const [carePortDraft, setCarePortDraft] = useState("7778");
  const [careCommandDraft, setCareCommandDraft] = useState("");
  const [upstreamNodePathDraft, setUpstreamNodePathDraft] = useState("");
  const [careSettingsError, setCareSettingsError] = useState("");

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
      const enabled = Boolean(config.proxyServer.enabled);
      setEnabledCheck((prev) => (prev[PROXY_ENABLED_KEY] === enabled ? prev : { [PROXY_ENABLED_KEY]: enabled }));
      setTranAliasesDraft(JSON.stringify(config.mockTranAliases ?? {}, null, 2));
      setProfileDraft((config.mockProfile ?? "legacy-tran-envelope") === "generic-json" ? "generic-json" : "legacy-tran-envelope");
      const careAuto =
        typeof config.proxyServer.upstreamAutoStart === "boolean"
          ? config.proxyServer.upstreamAutoStart
          : Boolean(config.proxyServer.careDummyAutoStart);
      setCareAutoCheck((prev) => (prev[CARE_DUMMY_AUTO_KEY] === careAuto ? prev : { [CARE_DUMMY_AUTO_KEY]: careAuto }));
      setCareWorkdirDraft(config.proxyServer.upstreamServerWorkdir ?? config.proxyServer.careDummyServerWorkdir ?? "");
      setCarePortDraft(String(config.proxyServer.upstreamServerPort ?? config.proxyServer.careDummyServerPort ?? 7778));
      setCareCommandDraft(config.proxyServer.upstreamServerCommand ?? "");
      setUpstreamNodePathDraft(config.proxyServer.upstreamNodePath ?? "");
    }
  }, [config]);

  const setProxyEnabledCheckState = useCallback<React.Dispatch<React.SetStateAction<checkBoxObjectType>>>(
    (action) => {
      setEnabledCheck((prev) => {
        const next = typeof action === "function" ? action(prev) : action;
        const prevOn = Boolean(prev[PROXY_ENABLED_KEY]);
        const nextOn = Boolean(next[PROXY_ENABLED_KEY]);
        if (prevOn !== nextOn) {
          void (async () => {
            setSaveBusy(true);
            try {
              const r = await setAppProxyConfig({ proxyServer: { enabled: nextOn } });
              if (r.ok) {
                setConfig(r.config);
                await bumpStatus();
              } else {
                setEnabledCheck({ [PROXY_ENABLED_KEY]: prevOn });
              }
            } catch {
              setEnabledCheck({ [PROXY_ENABLED_KEY]: prevOn });
            } finally {
              setSaveBusy(false);
            }
          })();
        }
        return next;
      });
    },
    [bumpStatus],
  );

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

  const onSaveTranAliases = async () => {
    setTranAliasesError("");
    let parsed: unknown;
    try {
      parsed = JSON.parse(tranAliasesDraft.replace(/^\uFEFF/, "").trim() || "{}");
    } catch {
      setTranAliasesError("JSON 형식이 올바르지 않습니다.");
      return;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      setTranAliasesError('최상위는 객체여야 합니다. 예: { "요청트랜": "스토어API이름" }');
      return;
    }
    const obj = parsed as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v !== "string") {
        setTranAliasesError(`"${k}" 값은 문자열(스토어 API 이름)이어야 합니다.`);
        return;
      }
    }
    setSaveBusy(true);
    try {
      const r = await setAppProxyConfig({ mockTranAliases: obj as Record<string, string> });
      if (r.ok) {
        setConfig(r.config);
        setTranAliasesDraft(JSON.stringify(r.config.mockTranAliases ?? {}, null, 2));
        await bumpStatus();
      } else {
        setTranAliasesError("저장에 실패했습니다.");
      }
    } finally {
      setSaveBusy(false);
    }
  };

  const onChangeProfile = async (nextProfile: "legacy-tran-envelope" | "generic-json") => {
    setProfileDraft(nextProfile);
    setSaveBusy(true);
    try {
      const r = await setAppProxyConfig({ mockProfile: nextProfile });
      if (r.ok) {
        setConfig(r.config);
        await bumpStatus();
      }
    } finally {
      setSaveBusy(false);
    }
  };

  const setCareAutoCheckState = useCallback<React.Dispatch<React.SetStateAction<checkBoxObjectType>>>(
    (action) => {
      setCareAutoCheck((prev) => {
        const next = typeof action === "function" ? action(prev) : action;
        const prevOn = Boolean(prev[CARE_DUMMY_AUTO_KEY]);
        const nextOn = Boolean(next[CARE_DUMMY_AUTO_KEY]);
        if (prevOn !== nextOn) {
          void (async () => {
            setSaveBusy(true);
            try {
              const r = await setAppProxyConfig({ proxyServer: { upstreamAutoStart: nextOn } });
              if (r.ok) {
                setConfig(r.config);
                await bumpStatus();
              } else {
                setCareAutoCheck({ [CARE_DUMMY_AUTO_KEY]: prevOn });
              }
            } catch {
              setCareAutoCheck({ [CARE_DUMMY_AUTO_KEY]: prevOn });
            } finally {
              setSaveBusy(false);
            }
          })();
        }
        return next;
      });
    },
    [bumpStatus],
  );

  const onSaveCareDummySettings = async () => {
    setCareSettingsError("");
    const n = Number.parseInt(carePortDraft.replace(/\s/g, ""), 10);
    if (!Number.isFinite(n) || n < 1 || n > 65535) {
      setCareSettingsError("업스트림 포트는 1~65535 사이로 입력해 주세요.");
      return;
    }
    if (config && n === config.proxyServer.port) {
      setCareSettingsError("업스트림 포트는 모의 서버 포트와 같을 수 없습니다.");
      return;
    }
    if (config?.interceptGateway?.enabled && n === config.interceptGateway.clientPort) {
      setCareSettingsError("업스트림 포트는 게이트웨이 클라이언트 포트와 같을 수 없습니다.");
      return;
    }
    setSaveBusy(true);
    try {
      const r = await setAppProxyConfig({
        proxyServer: {
          upstreamServerWorkdir: careWorkdirDraft.trim() || null,
          upstreamServerPort: n,
          upstreamServerCommand: careCommandDraft.trim() || null,
          upstreamNodePath: upstreamNodePathDraft.trim() || null,
        },
      });
      if (r.ok) {
        setConfig(r.config);
        setCarePortDraft(String(r.config.proxyServer.upstreamServerPort ?? r.config.proxyServer.careDummyServerPort ?? n));
        setCareWorkdirDraft(r.config.proxyServer.upstreamServerWorkdir ?? r.config.proxyServer.careDummyServerWorkdir ?? "");
        setCareCommandDraft(r.config.proxyServer.upstreamServerCommand ?? "");
        setUpstreamNodePathDraft(r.config.proxyServer.upstreamNodePath ?? "");
        await bumpStatus();
      } else {
        setCareSettingsError("저장에 실패했습니다.");
      }
    } finally {
      setSaveBusy(false);
    }
  };

  const onApplyPort = async () => {
    setPortError("");
    const n = Number.parseInt(portDraft.replace(/\s/g, ""), 10);
    if (!Number.isFinite(n) || n < 1 || n > 65535) {
      setPortError("1~65535 사이 포트를 입력해 주세요.");
      return;
    }
    if (config) {
      const careP = Number.parseInt(carePortDraft.replace(/\s/g, ""), 10);
      if (Number.isFinite(careP) && careP === n) {
        setPortError("모의 서버 포트와 업스트림 자동 실행 포트는 달라야 합니다.");
        return;
      }
    }
    setSaveBusy(true);
    try {
      const r = await setAppProxyConfig({ proxyServer: { port: n } });
      if (r.ok) {
        setConfig(r.config);
        setPortDraft(String(r.config.proxyServer.port));
        await bumpStatus();
      } else {
        setPortError("저장에 실패했습니다.");
      }
    } finally {
      setSaveBusy(false);
    }
  };

  const summaryClass = "typo-body-2-normal cursor-pointer list-none font-medium text-label-normal [&::-webkit-details-marker]:hidden";
  const profileGuide =
    profileDraft === "legacy-tran-envelope"
      ? "레거시 트랜 봉투: body의 header.tranId를 키로 찾고, responseMessage 봉투로 응답합니다."
      : "일반 JSON API: /mock/{key}, /api/{key}, x-mock-key, mockKey/query/body를 키로 찾고 원본 JSON을 응답합니다.";

  return (
    <div
      className={`border-1 border-gray-200 bg-background-white rounded-5 w-full overflow-hidden ${inModal ? "mt-0 max-w-none" : "mt-9 max-w-[1600px]"}`}
    >
      <div className="typo-title-3 bg-gray-50 px-8 py-6 font-bold">로컬 모의 API 설정</div>
      <div className="space-y-6 px-8 py-6">
        {!diskApi ? (
          <p className="typo-body-1-normal text-label-assistant">
            Electron 앱으로 실행해야 실제로 포트에 뜹니다. 브라우저만 켠 경우 설정은 저장되어도 로컬 서버는 동작하지 않습니다.
          </p>
        ) : null}

        <section className="rounded-3 border border-gray-200 bg-gray-50/80 px-5 py-4 space-y-3">
          <h2 className="typo-body-1-normal font-semibold text-label-normal">처음 사용하는 경우 (3단계)</h2>
          <ol className="typo-body-2-normal list-decimal space-y-2 pl-5 text-label-normal">
            <li>프로젝트에서 테스트할 API와 응답 JSON을 저장합니다.</li>
            <li>이 화면에서 모의 서버를 켜고 포트(기본 4780)를 적용합니다.</li>
            <li>클라이언트 API 베이스를 `http://localhost:(모의서버포트)/api`로 맞춘 뒤 호출을 확인합니다.</li>
          </ol>
          <p className="typo-caption-1 text-label-assistant">
            팁: 기존 시스템 포트가 고정이라면 「가로채기 게이트웨이」를 함께 사용하면 됩니다.
          </p>
        </section>

        {config == null ? (
          <p className="typo-body-2-normal text-label-assistant">설정을 불러오는 중…</p>
        ) : (
          <>
            {config.interceptGateway?.enabled ? (
              <section className="rounded-3 border border-amber-300 bg-amber-50 px-4 py-3">
                <p className="typo-body-2-normal text-amber-900">
                  가로채기 게이트웨이가 현재 켜져 있습니다. 직접 호출 모드만 쓰려면 게이트웨이를 끄세요.
                </p>
                <div className="mt-2">
                  <Btn category="secondary" size="small" width={132} disabled={saveBusy} onClick={() => void onDisableGateway()}>
                    게이트웨이 끄기
                  </Btn>
                </div>
              </section>
            ) : null}

            <section className="space-y-3">
              <h2 className="typo-body-1-normal font-medium text-label-normal">1) 모의 서버</h2>
              <p className="typo-body-2-normal text-label-assistant">클라이언트 요청을 받아 저장된 응답을 반환하는 서버입니다.</p>
              <CheckBox
                category="checkbox"
                size="small"
                label="모의 서버 사용"
                value={PROXY_ENABLED_KEY}
                checkBoxStateList={enabledCheck}
                setCheckBoxStateList={setProxyEnabledCheckState}
              />
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <div className="typo-caption-1 text-label-assistant mb-2">모의 서버 포트</div>
                  <Input
                    value={portDraft}
                    width={120}
                    size="small"
                    disabled={saveBusy}
                    error={!!portError}
                    onChange={(e) => {
                      setPortDraft(e.target.value);
                      if (portError) setPortError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void onApplyPort();
                    }}
                  />
                </div>
                <Btn category="secondary" size="small" width={88} disabled={saveBusy} onClick={() => void onApplyPort()}>
                  적용
                </Btn>
              </div>
              {portError ? <p className="typo-caption-1 text-label-negative">{portError}</p> : null}
              <p className="typo-body-2-normal">
                <span className="text-label-assistant">상태 · </span>
                {diskApi && status?.listening ? (
                  <span className="text-green-700">
                    localhost:{status.port ?? config.proxyServer.port} 에서 수신 중
                  </span>
                ) : diskApi && status?.lastError ? (
                  <span className="text-red-600">시작 실패 — {status.lastError}</span>
                ) : diskApi && config.proxyServer.enabled ? (
                  <span className="text-label-assistant">준비 중…</span>
                ) : (
                  <span className="text-label-assistant">중지됨</span>
                )}
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <div className="typo-caption-1 text-label-assistant mb-2">요청/응답 방식</div>
                  <select
                    value={profileDraft}
                    disabled={saveBusy}
                    onChange={(e) => void onChangeProfile(e.target.value === "generic-json" ? "generic-json" : "legacy-tran-envelope")}
                    className="typo-body-2-normal border-border-enabled text-label-normal rounded-3 bg-background-white border px-3 py-2 outline-none focus:border-gray-400"
                  >
                    <option value="legacy-tran-envelope">레거시 트랜 봉투 (header.tranId)</option>
                    <option value="generic-json">일반 JSON API (REST)</option>
                  </select>
                </div>
              </div>
              <p className="typo-caption-1 text-label-assistant">{profileGuide}</p>
            </section>

            <section className="border-t-1 border-gray-100 pt-6 space-y-3">
              <h2 className="typo-body-1-normal font-medium text-label-normal">2) 업스트림 서버 자동 실행 (선택)</h2>
              <p className="typo-body-2-normal text-label-assistant">
                모의 서버를 켤 때 백엔드 서버도 같이 띄우고 싶을 때 사용합니다. 명령을 비우면{" "}
                <code className="rounded bg-gray-100 px-1 text-[13px]">dummy.server.js -port</code>를 기본 시도합니다.
              </p>
              <CheckBox
                category="checkbox"
                size="small"
                label="모의 서버 시작/종료와 함께 업스트림 서버도 자동 실행/종료"
                value={CARE_DUMMY_AUTO_KEY}
                checkBoxStateList={careAutoCheck}
                setCheckBoxStateList={setCareAutoCheckState}
              />
              <div className="flex flex-wrap items-end gap-3 max-w-[900px]">
                <div className="min-w-[200px] flex-1">
                  <div className="typo-caption-1 text-label-assistant mb-2">백엔드 작업 폴더</div>
                  <Input
                    value={careWorkdirDraft}
                    width="100%"
                    size="small"
                    disabled={saveBusy}
                    error={!!careSettingsError}
                    placeholder="예: ~/git/my-backend/server"
                    onChange={(e) => {
                      setCareWorkdirDraft(e.target.value);
                      if (careSettingsError) setCareSettingsError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void onSaveCareDummySettings();
                    }}
                  />
                </div>
                <div>
                  <div className="typo-caption-1 text-label-assistant mb-2">백엔드 포트</div>
                  <Input
                    value={carePortDraft}
                    width={120}
                    size="small"
                    disabled={saveBusy}
                    error={!!careSettingsError}
                    onChange={(e) => {
                      setCarePortDraft(e.target.value);
                      if (careSettingsError) setCareSettingsError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void onSaveCareDummySettings();
                    }}
                  />
                </div>
                <div className="min-w-[280px] flex-1">
                  <div className="typo-caption-1 text-label-assistant mb-2">
                    실행 명령 (선택, <code className="rounded bg-gray-100 px-1 text-[12px]">{'{{port}}'}</code> 치환 지원)
                  </div>
                  <Input
                    value={careCommandDraft}
                    width="100%"
                    size="small"
                    disabled={saveBusy}
                    error={!!careSettingsError}
                    placeholder="예: npm run dev -- --port {{port}} 또는 {{node}} server.js --port {{port}}"
                    onChange={(e) => {
                      setCareCommandDraft(e.target.value);
                      if (careSettingsError) setCareSettingsError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void onSaveCareDummySettings();
                    }}
                  />
                </div>
                <div className="min-w-[260px] flex-1">
                  <div className="typo-caption-1 text-label-assistant mb-2">사용할 Node 경로 (선택)</div>
                  <Input
                    value={upstreamNodePathDraft}
                    width="100%"
                    size="small"
                    disabled={saveBusy}
                    error={!!careSettingsError}
                    placeholder="맥: ~/.nvm/.../node · 윈도: %NVM_HOME%\\v16.x.x\\node.exe 또는 C:\\Program Files\\nodejs\\node.exe"
                    onChange={(e) => {
                      setUpstreamNodePathDraft(e.target.value);
                      if (careSettingsError) setCareSettingsError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void onSaveCareDummySettings();
                    }}
                  />
                </div>
                <Btn category="secondary" size="small" width={88} disabled={saveBusy} onClick={() => void onSaveCareDummySettings()}>
                  저장
                </Btn>
              </div>
              {careSettingsError ? <p className="typo-caption-1 text-label-negative">{careSettingsError}</p> : null}
              <p className="typo-body-2-normal">
                <span className="text-label-assistant">업스트림 프로세스 · </span>
                {diskApi && status?.careMockSpawn?.running ? (
                  <span className="text-green-700">실행 중</span>
                ) : diskApi && status?.careMockSpawn?.lastError ? (
                  <span className="text-red-600">{status.careMockSpawn.lastError}</span>
                ) : (config.proxyServer.upstreamAutoStart ?? config.proxyServer.careDummyAutoStart) ? (
                  <span className="text-label-assistant">대기 또는 미기동(위 오류 참고)</span>
                ) : (
                  <span className="text-label-assistant">자동 실행 끔</span>
                )}
              </p>
            </section>

            <details className="rounded-3 border border-gray-200 bg-white px-4 py-2">
              <summary className={summaryClass}>3) 키 매핑(별칭) 설정 (선택)</summary>
              <div className="mt-3 space-y-3 pb-2">
                <p className="typo-body-2-normal text-label-assistant">
                  요청에 들어오는 키 이름과 DataForge API 이름이 다를 때만 사용하세요.
                  형식: <code className="rounded bg-gray-100 px-1 text-[13px]">{"{ \"요청키\": \"저장된API이름\" }"}</code>
                </p>
                <textarea
                  className="typo-body-2-normal w-full min-h-[100px] max-w-[720px] rounded-3 border border-gray-200 bg-gray-50/50 px-4 py-3 font-mono text-[13px] text-label-normal outline-none focus:border-gray-400"
                  spellCheck={false}
                  disabled={saveBusy}
                  value={tranAliasesDraft}
                  onChange={(e) => {
                    setTranAliasesDraft(e.target.value);
                    if (tranAliasesError) setTranAliasesError("");
                  }}
                />
                {tranAliasesError ? <p className="typo-caption-1 text-label-negative">{tranAliasesError}</p> : null}
                <Btn category="secondary" size="small" width={88} disabled={saveBusy} onClick={() => void onSaveTranAliases()}>
                  저장
                </Btn>
                <p className="typo-caption-1 text-label-assistant">
                  예: <code className="rounded bg-gray-100 px-1">{`{ "VD.MOVS0047": "pblCoupon" }`}</code>
                </p>
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
