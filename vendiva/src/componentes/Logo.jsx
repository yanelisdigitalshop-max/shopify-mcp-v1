export function Marca({ className = 'h-10 w-10' }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="18" fill="#c2410c" />
      <path d="M18 21l14 24 14-24" fill="none" stroke="#fff7ed" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="48" cy="17" r="5" fill="#fbbf24" />
    </svg>
  );
}

export function Logo({ grande = false }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Marca className={grande ? 'h-12 w-12' : 'h-9 w-9'} />
      <span className={`font-extrabold tracking-tight text-stone-900 ${grande ? 'text-3xl' : 'text-2xl'}`}>Vendiva</span>
    </span>
  );
}
