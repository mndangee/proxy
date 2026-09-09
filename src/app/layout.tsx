import GlobalCreateProjectModal from "@/components/providers/GlobalCreateProjectModal";
import ScrollbarActivityRoot from "@/components/providers/ScrollbarActivityRoot";
import RecentRequestsDrawer from "@/components/shared/RecentRequestsDrawer";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 min-w-[1600px] flex-1 flex-col overflow-hidden bg-gray-50">
      <div className="mx-auto flex min-h-0 w-full min-w-[1600px] flex-1 flex-col">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
        <footer className="typo-caption-1 text-label-assistant flex h-11 shrink-0 items-center justify-center bg-gray-800 px-6 text-center">
          <a href="/downloads" className="hover:text-label-common">
            다운로드 · 공유
          </a>
          {" · "}
          <a href="/licenses" className="hover:text-label-common">
            Open Source Licenses
          </a>
          {" · "}© {new Date().getFullYear()} DataForge. Built with Electron + React.
        </footer>
      </div>
      <div id="modal" />
      <GlobalCreateProjectModal />
      <ScrollbarActivityRoot />
      <RecentRequestsDrawer />
    </div>
  );
}
