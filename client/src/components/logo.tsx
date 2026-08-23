/**
 * Ridgeline logo — geometric zigzag ridge-line mark forming an abstract "R"
 * silhouette. Monochrome via currentColor, works at 24px and 200px, no gradients.
 */
export function RidgelineMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-label="Ridgeline"
      role="img"
    >
      <path
        d="M4 24 L9 12 L13 18 L17 6 L21 16 L24 10 L28 24"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M4 24 L9 12 L13 18 L17 6 L21 16 L24 10 L28 24 Z"
        fill="currentColor"
        fillOpacity="0.12"
        stroke="none"
      />
    </svg>
  );
}

export function RidgelineLogo({ className }: { className?: string }) {
  return (
    <div className={className ?? "flex items-center gap-2"}>
      <RidgelineMark className="h-6 w-6 text-primary shrink-0" />
      <span className="font-semibold text-sm tracking-tight leading-none">
        Ridgeline
      </span>
    </div>
  );
}
