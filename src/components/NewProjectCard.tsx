export default function NewProjectCard() {
  return (
    <button
      type="button"
      className="flex flex-col items-center justify-center rounded-4 border-2 border-dashed border-neutral-200 bg-white p-8 text-body text-neutral-600 transition-colors hover:border-brand-300 hover:bg-neutral-50"
    >
      <span className="mb-3 flex h-14 w-14 items-center justify-center">
        <svg className="h-8 w-8 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </span>
      <span className="font-semibold text-neutral-800">Start a new project</span>
      <span className="text-body mt-1 text-neutral-500">Deploy fresh endpoints in seconds</span>
    </button>
  )
}
