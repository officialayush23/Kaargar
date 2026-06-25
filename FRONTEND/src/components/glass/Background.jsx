export function Background() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {/* Base — pure black */}
      <div className="absolute inset-0" style={{ background: '#000000' }} />

      {/* Subtle dot grid only — no hue blobs, no glow overlays */}
      <div
        className="absolute inset-0 dot-grid"
        style={{ backgroundSize: '28px 28px' }}
      />
    </div>
  )
}
