export default function LoadingSpinner() {
  return (
    <svg
      className="h-16 w-16 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 3a9 9 0 1 1-6.36 2.64"
        stroke="#22c55e"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M5 3v4h4"
        stroke="#22c55e"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
