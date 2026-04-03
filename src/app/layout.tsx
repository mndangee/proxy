import GlobalCreateProjectModal from "@/components/providers/GlobalCreateProjectModal";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen min-w-[1600px] overflow-x-hidden bg-gray-50">
      <div className="m-auto mt-0 mb-0 flex min-h-screen min-w-[1600px] w-full flex-col">
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
        <footer className="typo-caption-1 text-label-assistant shrink-0 bg-gray-800 px-6 py-3 text-center">
          <a href="/licenses" className="hover:text-label-common">
            Open Source Licenses
          </a>
          {" · "}© {new Date().getFullYear()} DataForge. Built with Electron + React.
        </footer>
      </div>
      <div id="modal" />
      <GlobalCreateProjectModal />
    </div>
  );
}
