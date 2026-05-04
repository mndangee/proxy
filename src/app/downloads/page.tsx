"use client";

import type { ReactNode } from "react";

import Header from "@/components/shared/Header";
import {
  SITE_GITHUB_DEFAULT_BRANCH,
  SITE_GITHUB_LATEST_RELEASE_URL,
  SITE_GITHUB_RELEASES_URL,
  SITE_GITHUB_REPO_URL,
  siteGithubArchiveZipUrl,
  siteGithubBlobUrl,
  siteGithubRawUrl,
} from "@/libs/site-links";

const btnPrimary =
  "typo-body-2-normal text-label-common bg-background-primary hover:bg-background-primary-hover inline-flex min-h-9 items-center justify-center rounded-3 px-5 py-3 font-medium no-underline transition-colors";
const btnSecondary =
  "typo-body-2-normal text-label-primary border-border-primary hover:bg-background-primary-weak inline-flex min-h-9 items-center justify-center rounded-3 border bg-background-white px-5 py-3 font-medium no-underline transition-colors";

function goBackOrHome() {
  if (typeof window === "undefined") return;
  if (window.history.length > 1) {
    window.history.back();
    return;
  }
  if (window.location.protocol === "file:") {
    window.location.hash = "home";
    return;
  }
  window.location.href = "/";
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#13A4EC] underline-offset-2 hover:underline">
      {children}
    </a>
  );
}

export default function DownloadsPage() {
  const pptName = "DataForge-프로젝트-개요-및-사용법.pptx";
  const pptRaw = siteGithubRawUrl(`docs/${pptName}`);
  const usageMdBlob = siteGithubBlobUrl("docs/project-full-flow-usage.md");
  const dataGuideBlob = siteGithubBlobUrl("docs/data-lifecycle-guide.md");
  const zipUrl = siteGithubArchiveZipUrl();

  return (
    <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-border-enabled bg-background-white shrink-0 border-b">
        <div className="mx-auto w-full max-w-[1600px] px-6 pt-6">
          <button
            type="button"
            onClick={goBackOrHome}
            className="typo-caption-1 text-label-assistant hover:text-label-normal mb-1 w-fit cursor-pointer text-left transition-colors"
          >
            ← 뒤로
          </button>
        </div>
        <Header variant="main" title="다운로드 · 공유" className="!pt-3" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[960px] px-6 py-8">
          <p className="typo-body-2-normal text-label-assistant mb-8">
            이 페이지의 링크를 팀에 그대로 공유하면 됩니다. 저장소는{" "}
            <ExternalLink href={SITE_GITHUB_REPO_URL}>{SITE_GITHUB_REPO_URL}</ExternalLink> 입니다. (기본 브랜치 링크:{" "}
            <code className="typo-caption-1 rounded-2 bg-gray-100 px-2 py-0.5">{SITE_GITHUB_DEFAULT_BRANCH}</code>)
          </p>

          <section className="mb-10">
            <h2 className="typo-title-3 text-label-normal mb-3">설치 파일 (macOS · Windows)</h2>
            <p className="typo-body-2-normal text-label-assistant mb-4">
              배포용 <strong className="text-label-normal">DMG / 설치 exe</strong>는 GitHub Releases에 올려 두는 방식을 권장합니다. 아래에서 최신 릴리스를 확인하세요.
            </p>
            <div className="flex flex-wrap gap-3">
              <a href={SITE_GITHUB_LATEST_RELEASE_URL} target="_blank" rel="noopener noreferrer" className={btnPrimary}>
                최신 릴리스 열기
              </a>
              <a href={SITE_GITHUB_RELEASES_URL} target="_blank" rel="noopener noreferrer" className={btnSecondary}>
                모든 릴리스
              </a>
            </div>
            <p className="typo-caption-1 text-label-assistant mt-4">
              릴리스에 파일이 아직 없다면 저장소를 클론한 뒤 <code className="rounded bg-gray-100 px-1">npm run build:mac</code> 또는{" "}
              <code className="rounded bg-gray-100 px-1">npm run build:win</code>으로 로컬에서 만든 뒤, 생성된{" "}
              <code className="rounded bg-gray-100 px-1">dist/</code> 폴더의 설치 파일을 공유하면 됩니다.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="typo-title-3 text-label-normal mb-3">소스 코드 (ZIP)</h2>
            <p className="typo-body-2-normal text-label-assistant mb-4">
              Git 없이 소스만 받을 때 사용합니다. 브랜치: <code className="typo-caption-1 rounded-2 bg-gray-100 px-2 py-0.5">{SITE_GITHUB_DEFAULT_BRANCH}</code>
            </p>
            <a href={zipUrl} target="_blank" rel="noopener noreferrer" className={btnPrimary}>
              ZIP 다운로드
            </a>
          </section>

          <section className="mb-10">
            <h2 className="typo-title-3 text-label-normal mb-3">문서 · 자료</h2>
            <ul className="typo-body-2-normal text-label-assistant list-inside list-disc space-y-2">
              <li>
                <ExternalLink href={usageMdBlob}>프로젝트 전체 동작 사용법 (Markdown)</ExternalLink>
              </li>
              <li>
                <ExternalLink href={dataGuideBlob}>데이터 라이프사이클 가이드 (Markdown)</ExternalLink>
              </li>
              <li>
                <ExternalLink href={pptRaw}>개요 및 사용법 PPT ({pptName})</ExternalLink> — 브라우저에서 열리면 다운로드 또는 다른 이름으로 저장
              </li>
            </ul>
          </section>

          <section className="rounded-4 border-border-enabled bg-background-white border p-5">
            <h2 className="typo-body-1-normal text-label-normal mb-2 font-semibold">README에서도 동일 링크</h2>
            <p className="typo-caption-1 text-label-assistant">
              저장소 루트 <code className="rounded bg-gray-100 px-1">README.md</code>의「다운로드 · 공유」절에 위 링크들이 정리되어 있습니다.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
