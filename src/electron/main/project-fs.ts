import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import { join } from "path";

import { app, dialog, ipcMain } from "electron";

export const PROJECT_MANIFEST_VERSION = 1;

export interface ProjectManifest {
  version: number;
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  isFavorite: boolean;
  folderName: string;
}

function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s.slice(0, 80) || "project";
}

export function getProjectsRoot(): string {
  return join(app.getPath("userData"), "DataForge-projects");
}

async function ensureProjectsRoot(): Promise<void> {
  await fs.mkdir(getProjectsRoot(), { recursive: true });
}

async function uniqueFolderName(base: string, slug: string): Promise<string> {
  let name = slug.slice(0, 80) || "project";
  let attempt = name;
  let n = 2;
  for (;;) {
    try {
      await fs.access(join(base, attempt));
      attempt = `${name}-${n++}`;
    } catch {
      return attempt;
    }
  }
}

/** IPC로 받은 폴더명에 경로 분리자·탈출 방지 */
function isSafeProjectFolderName(name: string): boolean {
  if (!name || name.length > 200) return false;
  if (name.includes("..") || name.includes("/") || name.includes("\\")) return false;
  return true;
}

async function readManifest(projectRoot: string): Promise<ProjectManifest | null> {
  try {
    const raw = await fs.readFile(join(projectRoot, "project.json"), "utf-8");
    const data = JSON.parse(raw) as ProjectManifest;
    if (!data || typeof data !== "object" || data.version !== PROJECT_MANIFEST_VERSION) return null;
    if (typeof data.id !== "string" || typeof data.name !== "string") return null;
    return data;
  } catch {
    return null;
  }
}

type LegacyRow = {
  id?: string;
  name?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  isFavorite?: boolean;
  folderName?: string;
};

export function registerProjectFsIpc(): void {
  ipcMain.removeHandler("project-fs:list");
  ipcMain.removeHandler("project-fs:create");
  ipcMain.removeHandler("project-fs:updateFavorite");
  ipcMain.removeHandler("project-fs:export");
  ipcMain.removeHandler("project-fs:import");
  ipcMain.removeHandler("project-fs:migrateFromLegacy");
  ipcMain.removeHandler("project-fs:getRootPath");
  ipcMain.removeHandler("project-fs:delete");

  ipcMain.handle("project-fs:list", async (): Promise<ProjectManifest[]> => {
    await ensureProjectsRoot();
    const root = getProjectsRoot();
    const entries = await fs.readdir(root, { withFileTypes: true });
    const projects: ProjectManifest[] = [];

    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const folderName = ent.name;
      const manifest = await readManifest(join(root, folderName));
      if (!manifest) continue;
      projects.push({ ...manifest, folderName });
    }

    projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return projects;
  });

  ipcMain.handle("project-fs:create", async (_e, payload: unknown) => {
    const p =
      payload != null && typeof payload === "object"
        ? (payload as { name?: unknown; description?: unknown; isFavorite?: unknown })
        : {};
    await ensureProjectsRoot();
    const root = getProjectsRoot();
    const name = String(p.name ?? "").trim();
    if (!name) return { ok: false as const, error: "empty-name" };

    const folderName = await uniqueFolderName(root, slugify(name));
    const projectRoot = join(root, folderName);
    await fs.mkdir(join(projectRoot, "apis"), { recursive: true });

    const now = new Date().toISOString();
    const manifest: ProjectManifest = {
      version: PROJECT_MANIFEST_VERSION,
      id: randomUUID(),
      name,
      description: String(p.description ?? "").trim(),
      createdAt: now,
      updatedAt: now,
      isFavorite: Boolean(p.isFavorite),
      folderName,
    };

    await fs.writeFile(join(projectRoot, "project.json"), JSON.stringify(manifest, null, 2), "utf-8");
    await fs.writeFile(join(projectRoot, "apis", "index.json"), JSON.stringify([], null, 2), "utf-8");

    return { ok: true as const, project: manifest };
  });

  ipcMain.handle("project-fs:updateFavorite", async (_e, payload: { folderName: string; isFavorite: boolean }) => {
    const root = getProjectsRoot();
    const projectRoot = join(root, payload.folderName);
    const cur = await readManifest(projectRoot);
    if (!cur) return { ok: false as const, error: "not-found" };

    const next: ProjectManifest = {
      ...cur,
      isFavorite: payload.isFavorite,
      folderName: payload.folderName,
    };
    await fs.writeFile(join(projectRoot, "project.json"), JSON.stringify(next, null, 2), "utf-8");
    return { ok: true as const };
  });

  ipcMain.handle("project-fs:export", async (_e, folderName: string) => {
    const root = getProjectsRoot();
    const src = join(root, folderName);
    const cur = await readManifest(src);
    if (!cur) return { ok: false as const, error: "not-found" };

    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "보낼 위치(상위 폴더) 선택",
      properties: ["openDirectory", "createDirectory"],
    });
    if (canceled || !filePaths[0]) return { ok: false as const, error: "cancelled" };

    const dest = join(filePaths[0], folderName);
    try {
      await fs.access(dest);
      return { ok: false as const, error: "destination-exists" };
    } catch {
      /* unique */
    }

    await fs.cp(src, dest, { recursive: true });
    return { ok: true as const, path: dest };
  });

  ipcMain.handle("project-fs:import", async () => {
    await ensureProjectsRoot();
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "가져올 프로젝트 폴더 (project.json 포함)",
      properties: ["openDirectory"],
    });
    if (canceled || !filePaths[0]) return { ok: false as const, error: "cancelled" };

    const src = filePaths[0];
    const incoming = await readManifest(src);
    if (!incoming) return { ok: false as const, error: "invalid-manifest" };

    const root = getProjectsRoot();
    const folderName = await uniqueFolderName(root, slugify(incoming.folderName || incoming.name));
    const dest = join(root, folderName);
    await fs.cp(src, dest, { recursive: true });

    const now = new Date().toISOString();
    const imported: ProjectManifest = {
      ...incoming,
      id: randomUUID(),
      folderName,
      updatedAt: now,
    };
    await fs.writeFile(join(dest, "project.json"), JSON.stringify(imported, null, 2), "utf-8");

    return { ok: true as const, project: imported };
  });

  ipcMain.handle("project-fs:migrateFromLegacy", async (_e, legacy: LegacyRow[]) => {
    if (!Array.isArray(legacy) || legacy.length === 0) return { ok: true as const, count: 0 };

    await ensureProjectsRoot();
    const root = getProjectsRoot();
    let count = 0;

    for (const row of legacy) {
      if (!row.name || typeof row.name !== "string") continue;
      const folderName = await uniqueFolderName(root, slugify(row.folderName || row.name));
      const projectRoot = join(root, folderName);
      await fs.mkdir(join(projectRoot, "apis"), { recursive: true });

      const now = new Date().toISOString();
      const manifest: ProjectManifest = {
        version: PROJECT_MANIFEST_VERSION,
        id: typeof row.id === "string" && row.id ? row.id : randomUUID(),
        name: row.name.trim(),
        description: typeof row.description === "string" ? row.description : "",
        createdAt: typeof row.createdAt === "string" ? row.createdAt : now,
        updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : now,
        isFavorite: Boolean(row.isFavorite),
        folderName,
      };

      await fs.writeFile(join(projectRoot, "project.json"), JSON.stringify(manifest, null, 2), "utf-8");
      await fs.writeFile(join(projectRoot, "apis", "index.json"), JSON.stringify([], null, 2), "utf-8");
      count++;
    }

    return { ok: true as const, count };
  });

  ipcMain.handle("project-fs:getRootPath", async () => getProjectsRoot());

  ipcMain.handle("project-fs:delete", async (_e, folderName: unknown) => {
    const name = typeof folderName === "string" ? folderName.trim() : "";
    if (!name || !isSafeProjectFolderName(name)) return { ok: false as const, error: "invalid-folder" };
    const root = getProjectsRoot();
    const projectRoot = join(root, name);
    try {
      await fs.rm(projectRoot, { recursive: true, force: true });
    } catch {
      return { ok: false as const, error: "io-error" };
    }
    return { ok: true as const };
  });
}
