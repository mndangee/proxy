interface SearchIconProps {
  className?: string;
  width?: number;
  height?: number;
}

export default function SearchIcon({ className = "", width = 20, height = 20 }: SearchIconProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M9 15A6 6 0 1 0 9 3a6 6 0 0 0 0 12zM18 18l-4.35-4.35"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
