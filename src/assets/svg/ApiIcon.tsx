export default function ApiIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80" fill="none">
      <rect width="80" height="80" rx="40" fill="#CCDDFF" />
      <path
        d="M40 43L37 40L40 37L43 40L40 43ZM36.8125 34.1875L33.0625 30.4375L40 23.5L46.9375 30.4375L43.1875 34.1875L40 31L36.8125 34.1875ZM30.4375 46.9375L23.5 40L30.4375 33.0625L34.1875 36.8125L31 40L34.1875 43.1875L30.4375 46.9375ZM49.5625 46.9375L45.8125 43.1875L49 40L45.8125 36.8125L49.5625 33.0625L56.5 40L49.5625 46.9375ZM40 56.5L33.0625 49.5625L36.8125 45.8125L40 49L43.1875 45.8125L46.9375 49.5625L40 56.5Z"
        fill="#0057FF"
      />
    </svg>
  );
}
