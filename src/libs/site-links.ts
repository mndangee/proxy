/**
 * 공개 저장소 URL — README, 다운로드 페이지에서 공통 사용.
 * 기본 브랜치는 raw/zip 링크에 쓰입니다. main에 병합 후 `main`으로 바꾸는 것을 권장합니다.
 */
export const SITE_GITHUB_OWNER_REPO = "mndangee/proxy" as const;
export const SITE_GITHUB_REPO_URL = `https://github.com/${SITE_GITHUB_OWNER_REPO}` as const;
export const SITE_GITHUB_DEFAULT_BRANCH = "feature/proxy" as const;

export const SITE_GITHUB_RELEASES_URL = `${SITE_GITHUB_REPO_URL}/releases` as const;
export const SITE_GITHUB_LATEST_RELEASE_URL = `${SITE_GITHUB_REPO_URL}/releases/latest` as const;

export function siteGithubBlobUrl(pathInRepo: string): string {
  const segs = pathInRepo.split("/").map(encodeURIComponent).join("/");
  return `${SITE_GITHUB_REPO_URL}/blob/${SITE_GITHUB_DEFAULT_BRANCH}/${segs}`;
}

export function siteGithubRawUrl(pathInRepo: string): string {
  const segs = pathInRepo.split("/").map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${SITE_GITHUB_OWNER_REPO}/${SITE_GITHUB_DEFAULT_BRANCH}/${segs}`;
}

export function siteGithubArchiveZipUrl(branch: string = SITE_GITHUB_DEFAULT_BRANCH): string {
  return `${SITE_GITHUB_REPO_URL}/archive/refs/heads/${encodeURIComponent(branch)}.zip`;
}
