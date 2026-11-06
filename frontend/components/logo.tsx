export function Logo({ compact = false }: { compact?: boolean }) {
  return <span className="logo-lockup" aria-label="Ownback">
    <svg className="logo-mark" viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path d="M32 8a24 24 0 1 0 24 24H32z" fill="currentColor" />
      <path d="M37 3a24 24 0 0 1 24 24H37z" fill="var(--accent)" />
    </svg>
    {!compact && <span>Ownback</span>}
  </span>;
}
