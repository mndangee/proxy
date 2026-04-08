/**
 * Electron userData 내 프로젝트 디렉터리 레이아웃 (버전 1)
 *
 * DataForge-projects/
 *   {folderName}/                 ← 프로젝트 이름 기반 slug, 충돌 시 -2, -3 …
 *     project.json                ← 메타데이터 (id, name, description, 날짜, 즐겨찾기, folderName)
 *     apis/
 *       index.json                ← API 목록 (향후 확장; 현재는 [])
 *       {apiSlug}/                ← (향후) API 단위
 *         api.json
 *         responses/
 *           {responseId}.json
 *
 * 공유: {folderName} 폴더 전체를 복사·압축해 전달 → 다른 PC에서 「프로젝트 가져오기」로 선택
 */

export const PROJECT_FS_LAYOUT_VERSION = 1;
