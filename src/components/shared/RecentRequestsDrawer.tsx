"use client";

import { useEffect, useState, type JSX } from "react";
import { createPortal } from "react-dom";

import CloseIcon from "@/assets/svg/CloseIcon";
import HistoryIcon from "@/assets/svg/HistoryIcon";
import Btn from "@/components/common/Btn";
import { ConfirmModal, NoticeModal } from "@/components/common/modals";
import { getAppPathname, navigateApp } from "@/libs/app-navigation";
import {
  clearRecentProxyRequests,
  getAppProxyConfig,
  getEndpointsForProject,
  getRecentProxyRequests,
  getStoredProjects,
  type ProxyRequestRecord,
} from "@/libs/projects/store";

function isTranApiRequest(request: ProxyRequestRecord): boolean {
  if (request.method !== "POST") return false;
  try {
    return new URL(request.path, "http://127.0.0.1").pathname === "/api";
  } catch {
    return request.path.split("?", 1)[0] === "/api";
  }
}

type RequestApiMetadata = { name: string; description: string };

function findRequestApiMetadata(request: ProxyRequestRecord, servingFolderName: string | null): RequestApiMetadata | null {
  const requestApiName = request.apiName?.trim() ?? "";
  const tranId = request.tranId?.trim() ?? "";
  const normalizedApiName = requestApiName.toLowerCase();
  const normalizedTranId = tranId.toLowerCase();

  const projects = getStoredProjects();
  const orderedProjects = servingFolderName
    ? [...projects].sort((a, b) => Number(b.folderName === servingFolderName) - Number(a.folderName === servingFolderName))
    : projects;
  for (const project of orderedProjects) {
    const endpoint = getEndpointsForProject(project.id).find((item) => {
      const name = item.name.trim().toLowerCase();
      const tran = item.tran.trim().toLowerCase();
      return Boolean(
        (normalizedApiName && name === normalizedApiName)
        || (normalizedTranId && tran === normalizedTranId),
      );
    });
    if (endpoint) return { name: endpoint.name.trim(), description: endpoint.description.trim() };
  }

  return requestApiName ? { name: requestApiName, description: "" } : null;
}

function mockApiDetailHref(request: ProxyRequestRecord, metadata: RequestApiMetadata | null): string | null {
  if (request.result !== "mock") return null;

  // 이전 기록이나 외부 모의 서버 응답에는 apiName 헤더가 없을 수 있습니다.
  // 가져온 더미 데이터는 tranId가 API 이름인 경우가 많으므로 상세 화면 이동의 안전한 폴백으로 사용합니다.
  const apiName = metadata?.name?.trim() || request.apiName?.trim() || request.tranId?.trim() || "";
  if (!apiName) return null;
  return `/api/${encodeURIComponent(apiName)}`;
}

type RequestDateGroup = { key: string; label: string; requests: ProxyRequestRecord[] };
const RECENT_REQUESTS_SEEN_AT_KEY = "dataforge-recent-requests-seen-at";

function groupRequestsByDate(requests: ProxyRequestRecord[]): RequestDateGroup[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
  const groups = new Map<string, RequestDateGroup>();

  for (const request of requests) {
    const date = new Date(request.timestamp);
    const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    const label = dateStart === todayStart
      ? "오늘"
      : dateStart === yesterdayStart
        ? "어제"
        : date.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
    const group = groups.get(key);
    if (group) group.requests.push(request);
    else groups.set(key, { key, label, requests: [request] });
  }

  return [...groups.values()];
}

export default function RecentRequestsDrawer(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [requests, setRequests] = useState<ProxyRequestRecord[]>([]);
  const [clearing, setClearing] = useState(false);
  const [seenThroughMs, setSeenThroughMs] = useState(0);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearErrorOpen, setClearErrorOpen] = useState(false);
  const [servingFolderName, setServingFolderName] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState(() => getAppPathname());

  useEffect(() => {
    setPortalTarget(document.body);
    const saved = Number(window.localStorage.getItem(RECENT_REQUESTS_SEEN_AT_KEY));
    if (Number.isFinite(saved) && saved > 0) setSeenThroughMs(saved);
  }, []);

  useEffect(() => {
    const syncPath = () => setCurrentPath(getAppPathname());
    window.addEventListener("hashchange", syncPath);
    window.addEventListener("popstate", syncPath);
    window.addEventListener("dataforge-before-navigate", syncPath);
    return () => {
      window.removeEventListener("hashchange", syncPath);
      window.removeEventListener("popstate", syncPath);
      window.removeEventListener("dataforge-before-navigate", syncPath);
    };
  }, []);

  useEffect(() => {
    const reload = async (): Promise<void> => {
      const [next, config] = await Promise.all([getRecentProxyRequests(), getAppProxyConfig()]);
      setRequests(next.filter(isTranApiRequest));
      setServingFolderName(config.proxyServer.servingFolderName ?? null);
    };
    void reload();
    const timer = window.setInterval(() => void reload(), 1500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  useEffect(() => {
    if (!open || requests.length === 0) return;
    const newestTimestamp = Math.max(...requests.map((request) => new Date(request.timestamp).getTime()).filter(Number.isFinite));
    if (!Number.isFinite(newestTimestamp) || newestTimestamp <= seenThroughMs) return;
    setSeenThroughMs(newestTimestamp);
    window.localStorage.setItem(RECENT_REQUESTS_SEEN_AT_KEY, String(newestTimestamp));
  }, [open, requests, seenThroughMs]);

  const clearHistory = async (): Promise<void> => {
    if (requests.length === 0 || clearing) return;
    setClearing(true);
    const cleared = await clearRecentProxyRequests();
    setClearConfirmOpen(false);
    if (cleared) {
      setRequests([]);
      setOpen(true);
    } else {
      setClearErrorOpen(true);
    }
    setClearing(false);
  };

  const requestGroups = groupRequestsByDate(requests);
  const unreadCount = requests.filter((request) => new Date(request.timestamp).getTime() > seenThroughMs).length;
  const fabBottom = currentPath === "/api/json" ? 104 : 64;

  if (!portalTarget) return <></>;

  return createPortal(
    <>
      <ConfirmModal
        isOpen={clearConfirmOpen}
        title="최근 요청 기록을 지울까요?"
        message="저장된 최근 요청 기록이 모두 삭제되며 복구할 수 없습니다."
        cancelLabel="취소"
        confirmLabel="기록 지우기"
        onClose={() => {
          setClearConfirmOpen(false);
          setOpen(true);
        }}
        onConfirm={clearHistory}
      />
      <NoticeModal
        isOpen={clearErrorOpen}
        message="요청 기록을 지우지 못했습니다. 잠시 후 다시 시도해 주세요."
        onClose={() => {
          setClearErrorOpen(false);
          setOpen(true);
        }}
      />
      <button
        type="button"
        className={`bg-background-primary hover:bg-background-primary-hover fixed flex h-14 w-14 cursor-pointer items-center justify-center rounded-full text-white shadow-lg transition-[opacity,transform,box-shadow] duration-200 hover:scale-105 hover:shadow-xl ${open ? "pointer-events-none translate-x-4 opacity-0" : "translate-x-0 opacity-100"}`}
        style={{ right: 20, bottom: fabBottom, zIndex: 900, backgroundColor: "#0057FF" }}
        aria-label="최근 요청 패널 열기"
        title="최근 요청"
        aria-expanded={open}
        aria-controls="recent-requests-drawer"
        onClick={() => setOpen(true)}
      >
        <HistoryIcon className="h-6 w-6" color="#FFFFFF" />
        {unreadCount > 0 ? (
          <span aria-label={`새 요청 ${unreadCount}개`} className="absolute -top-1 -right-1 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-red-500 px-1 text-xs leading-none font-bold text-white shadow-sm">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      <button
        type="button"
        aria-label="최근 요청 패널 닫기"
        tabIndex={open ? 0 : -1}
        className={`fixed top-0 right-0 bottom-11 left-0 cursor-default bg-black/30 transition-opacity duration-200 ${open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
        style={{ zIndex: 1250 }}
        onClick={() => setOpen(false)}
      />

      <aside
        id="recent-requests-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recent-requests-drawer-title"
        aria-hidden={!open}
        className={`bg-background-white fixed top-0 right-0 bottom-11 flex w-[min(400px,calc(100vw-24px))] flex-col shadow-2xl transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}
        style={{ zIndex: 1260, backgroundColor: "#FFFFFF" }}
      >
        <header className="border-border-enabled bg-background-white flex shrink-0 items-center justify-between border-b px-6 py-5">
          <div>
            <h2 id="recent-requests-drawer-title" className="typo-title-3 text-label-normal font-bold">최근 API 요청</h2>
            <p className="typo-caption-1 text-label-assistant mt-1">프로젝트를 사용하는 동안 요청을 확인할 수 있습니다.</p>
          </div>
          <button
            type="button"
            className="hover:bg-background-secondary-weak cursor-pointer rounded p-2 text-neutral-900"
            aria-label="닫기"
            onClick={() => setOpen(false)}
          >
            <CloseIcon />
          </button>
        </header>

        <div className={`bg-background-white min-h-0 flex-1 overflow-y-auto ${requests.length > 0 ? "px-5 py-4" : "flex items-center justify-center px-6 py-10"}`}>
          {requests.length === 0 ? (
            <div className="max-w-[280px] text-center">
              <p className="typo-body-1-normal text-label-normal font-semibold">트랜 요청 대기 중</p>
              <p className="typo-body-2-normal text-label-assistant mt-2 leading-relaxed">프로젝트에서 API를 사용하면 POST /api 요청의 tranId가 여기에 표시됩니다.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {requestGroups.map((group) => (
                <section key={group.key} aria-labelledby={`recent-request-date-${group.key}`}>
                  <h3 id={`recent-request-date-${group.key}`} className="typo-caption-1 text-label-assistant mb-2 font-semibold">
                    {group.label}
                  </h3>
                  <div className="space-y-3">
              {group.requests.map((request) => {
                const resultText = request.result === "mock" ? "더미 응답" : request.result === "upstream" ? "실제 서버" : "실패";
                const apiMetadata = findRequestApiMetadata(request, servingFolderName);
                const apiDetailHref = mockApiDetailHref(request, apiMetadata);
                const canEditMock = Boolean(apiDetailHref);
                const openMockEditor = (): void => {
                  if (!apiDetailHref) return;
                  setOpen(false);
                  navigateApp(apiDetailHref);
                };
                return (
                  <button
                    type="button"
                    key={request.id}
                    disabled={!canEditMock}
                    title={canEditMock ? "사용된 더미 데이터 수정" : undefined}
                    className={`rounded-4 w-full border border-gray-200 bg-white p-4 text-left ${canEditMock ? "hover:border-border-primary hover:bg-background-primary-weak cursor-pointer transition-colors" : "cursor-default"}`}
                    onClick={openMockEditor}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="typo-body-1-normal text-label-normal truncate font-bold" title={request.tranId || "트랜 ID 없음"}>{request.tranId || "트랜 ID 확인 불가"}</p>
                        {apiMetadata?.name ? (
                          <p
                            className="typo-caption-1 text-label-assistant mt-1 truncate"
                            title={[apiMetadata.name, apiMetadata.description].filter(Boolean).join(" · ")}
                          >
                            <span className="text-label-normal font-medium">{apiMetadata.name}</span>
                            {apiMetadata.description ? <span> · {apiMetadata.description}</span> : null}
                          </p>
                        ) : null}
                        <p className="typo-caption-1 text-label-assistant mt-1">POST /api</p>
                      </div>
                      <span className={`typo-caption-1 shrink-0 font-semibold ${request.result === "mock" ? "text-blue-700" : request.result === "upstream" ? "text-emerald-700" : "text-red-700"}`}>{resultText}</span>
                    </div>
                    <div className="typo-caption-1 text-label-assistant mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                      <span>{new Date(request.timestamp).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                      <span>·</span><span>{request.statusCode}</span>
                      <span>·</span><span>{request.durationMs}ms</span>
                      {request.responseLabel ? <><span>·</span><span>{request.responseLabel}</span></> : null}
                    </div>
                    {request.error ? <p className="typo-caption-1 mt-2 text-red-700">{request.error}</p> : null}
                  </button>
                );
              })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        <footer className="border-border-enabled bg-background-white flex shrink-0 gap-3 border-t px-6 py-4">
          <Btn category="secondary" variant width="100%" disabled={requests.length === 0 || clearing} onClick={() => {
            setOpen(false);
            setClearConfirmOpen(true);
          }}>
            {clearing ? "지우는 중" : "기록 지우기"}
          </Btn>
          <Btn category="secondary" variant width="100%" onClick={() => setOpen(false)}>닫기</Btn>
        </footer>
      </aside>
    </>,
    portalTarget,
  );
}
