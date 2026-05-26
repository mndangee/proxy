/**
 * Electron 패키지(`file:`)에서는 SPA 경로가 `location.hash`에만 있음.
 * `window.location.href = "/api/..."` 는 `file:///api/...` 로 빠져 빈 화면이 됨.
 */

export function usesHashRouting(): boolean {
  return typeof window !== "undefined" && window.location?.protocol === "file:";
}

/** `file:` 일 때는 해시의 `?` 뒤, 그 외에는 `location.search` */
export function getAppSearchParams(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  if (usesHashRouting()) {
    const raw = window.location.hash.slice(1).trim();
    const qi = raw.indexOf("?");
    const qs = qi >= 0 ? raw.slice(qi + 1) : "";
    return new URLSearchParams(qs);
  }
  return new URLSearchParams(window.location.search);
}

/**
 * `file:` 일 때는 해시의 경로 세그먼트를 브라우저 pathname처럼 반환 (예: `/api/json`, `/project/foo`).
 * 그 외에는 `location.pathname`.
 */
export function getAppPathname(): string {
  if (typeof window === "undefined") return "/";
  if (usesHashRouting()) {
    const raw = window.location.hash.slice(1).trim();
    const pathOnly = raw.split("?")[0].split("#")[0] || "home";
    if (!pathOnly || pathOnly === "home") return "/";
    return pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
  }
  return window.location.pathname || "/";
}

/**
 * 앱 내 경로 이동 (`/` → 홈, `/api/json?...` 등).
 * - `file:`: `location.hash` 갱신 (App의 hashchange 처리와 맞춤)
 * - 그 외: 전체 URL 이동과 동일하게 `assign` 사용
 */
export function navigateApp(path: string): void {
  if (typeof window === "undefined") return;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (usesHashRouting()) {
    try {
      const baseHref = window.location.href.replace(/#.*$/, "");
      const u = new URL(normalized, baseHref);
      let pathPart = u.pathname.replace(/^\//, "").trim();
      if (!pathPart) pathPart = "home";
      const search = u.search.replace(/^\?/, "");
      window.location.hash = search ? `${pathPart}?${search}` : pathPart;
    } catch {
      const raw = normalized.slice(1);
      const head = raw.split("?")[0] || "home";
      window.location.hash = head;
    }
    return;
  }
  window.location.assign(normalized);
}
