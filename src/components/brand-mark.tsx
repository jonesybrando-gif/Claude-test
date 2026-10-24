/** The Marketing Nexus mark: three connected points around a rising bar chart. */
export function BrandMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 1024 1024" className={className} aria-hidden focusable="false">
      <rect width="1024" height="1024" rx="225" fill="#E8792B" />
      <path d="M300 690 L512 330 L724 690 Z" fill="none" stroke="#F6B27F" strokeWidth="34" strokeLinejoin="round" />
      <circle cx="300" cy="690" r="78" fill="#fff" />
      <circle cx="512" cy="330" r="78" fill="#fff" />
      <circle cx="724" cy="690" r="78" fill="#fff" />
      <rect x="446" y="585" width="32" height="55" rx="10" fill="#fff" />
      <rect x="496" y="535" width="32" height="105" rx="10" fill="#fff" />
      <rect x="546" y="485" width="32" height="155" rx="10" fill="#fff" />
    </svg>
  );
}
