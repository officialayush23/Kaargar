export function Background() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {/* Base — pure black */}
      <div className="absolute inset-0" style={{ background: '#000000' }} />

      {/* Amber orb — top center, the dominant accent */}
      <div
        className="blob blob-amber"
        style={{ width: '50vw', height: '50vw', top: '-15%', left: '25%', opacity: 0.10 }}
      />

      {/* Blue orb — top left */}
      <div
        className="blob blob-blue"
        style={{ width: '42vw', height: '42vw', top: '20%', left: '-10%', opacity: 0.08 }}
      />

      {/* Violet orb — bottom right */}
      <div
        className="blob blob-violet"
        style={{ width: '38vw', height: '38vw', bottom: '-10%', right: '-5%', opacity: 0.08 }}
      />

      {/* Subtle dot grid */}
      <div
        className="absolute inset-0 dot-grid opacity-100"
        style={{ backgroundSize: '28px 28px' }}
      />

      {/* Top-center vignette */}
      <div
        className="absolute inset-x-0 top-0 h-[35vh]"
        style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(245,158,11,0.35) 0%, transparent 100%)' }}
      />

      {/* Bottom fade */}
      <div
        className="absolute inset-x-0 bottom-0 h-24"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)' }}
      />
    </div>
  )
}
