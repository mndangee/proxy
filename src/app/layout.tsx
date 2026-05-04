import GlobalCreateProjectModal from "@/components/providers/GlobalCreateProjectModal";
import ScrollbarActivityRoot from "@/components/providers/ScrollbarActivityRoot";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 min-w-[1600px] flex-1 flex-col overflow-hidden bg-gray-50">
      <div className="mx-auto flex min-h-0 w-full min-w-[1600px] flex-1 flex-col">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
        <footer className="typo-caption-1 text-label-assistant shrink-0 bg-gray-800 px-6 py-3 text-center">
          <a href="/licenses" className="hover:text-label-common">
            Open Source Licenses
          </a>
          {" · "}© {new Date().getFullYear()} DataForge. Built with Electron + React.
        </footer>
      </div>
      <div id="modal" />
      <GlobalCreateProjectModal />
      <ScrollbarActivityRoot />
    </div>
  );
}
