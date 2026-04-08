export default function EmptyJsonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" fill="none">
      <rect x="1" y="1" width="254" height="254" rx="127" fill="#F8FAFC" />
      <rect x="1" y="1" width="254" height="254" rx="127" stroke="#E5E7EB" strokeWidth="2" strokeDasharray="6 4" />
      <path
        d="M165.333 122.667H90.6667M165.333 122.667C171.22 122.667 176 127.446 176 133.333V165.333C176 171.22 171.22 176 165.333 176H90.6667C84.7796 176 80 171.22 80 165.333V133.333C80 127.446 84.7796 122.667 90.6667 122.667M165.333 122.667V112C165.333 106.113 160.554 101.333 154.667 101.333M90.6667 122.667V112C90.6667 106.113 95.4462 101.333 101.333 101.333M101.333 101.333V90.6667C101.333 84.7756 106.109 80 112 80H144C149.887 80 154.667 84.7796 154.667 90.6667V101.333M101.333 101.333H154.667"
        stroke="#E5E7EB"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M128 122.667V144M128 144L117.33 133.333M128 144L138.667 133.333" stroke="#E5E7EB" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
