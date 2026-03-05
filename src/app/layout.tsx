export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="min-h-0 flex-1 overflow-auto">
        {children}
      </div>
      <footer className="shrink-0 border-t border-neutral-200 bg-neutral-900 px-6 py-3 text-center text-details text-neutral-400">
        <a href="/licenses" className="hover:text-white">
          Open Source Licenses
        </a>
        {' · '}
        © {new Date().getFullYear()} DataForge. Built with Electron + React.
      </footer>
    </div>
  )
}
