export function BrandMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect width="48" height="48" rx="14" className="fill-pine" />
      <circle cx="24" cy="24" r="12" fill="none" stroke="#f4f0e6" strokeWidth="2.4" />
      <circle cx="24" cy="24" r="4" fill="#c56a32" />
    </svg>
  );
}

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${light ? 'text-foam' : 'text-ink'}`}>
      <BrandMark />
      <span className="font-display text-2xl tracking-tight">Orbe</span>
    </span>
  );
}
