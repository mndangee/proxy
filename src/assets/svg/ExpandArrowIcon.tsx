export interface ExpandArrowIconProps {
  className?: string;
}

export default function ExpandArrowIcon({ className }: ExpandArrowIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="15"
      viewBox="0 0 24 15"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M10.4425 14.3153C11.267 15.2282 12.733 15.2282 13.5575 14.3153L23.4839 3.32525C24.6548 2.02887 23.7045 0 21.9264 0H2.07364C0.295514 0 -0.654807 2.02887 0.516098 3.32525L10.4425 14.3153Z"
        fill="currentColor"
      />
    </svg>
  );
}
