/**
 * Mad River Cleaning Co. logo — the client's real brand mark (mountains,
 * pines, and winding river inside a navy circle), supplied as a raster
 * image at /logo.png. Rendered as a small circular badge next to the
 * wordmark in the sidebar, or standalone via MadRiverMark.
 */
export function MadRiverMark({ className }: { className?: string }) {
  return (
    <img
      src="/logo.png"
      alt="Mad River Cleaning Co."
      className={className ?? "h-6 w-6 shrink-0 rounded-full object-cover"}
    />
  );
}

export function MadRiverLogo({ className }: { className?: string }) {
  return (
    <div className={className ?? "flex items-center gap-2"}>
      <MadRiverMark className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-white/10" />
      <span className="font-semibold text-sm tracking-tight leading-none">
        Mad River Cleaning Co.
      </span>
    </div>
  );
}
