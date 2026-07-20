export function Background() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {/* Base — theme-aware */}
      <div className="absolute inset-0" style={{ background: 'var(--bg-base)' }} />

      {/* Subtle dot grid only — no hue blobs, no glow overlays */}
      <div
        className="absolute inset-0 dot-grid"
        style={{ backgroundSize: '28px 28px' }}
      />
    </div>
  )
}
