import { useEffect, useRef } from 'react'

export function Background() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {/* Base gradient — deep navy */}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(145deg, #030914 0%, #050E1C 35%, #081222 65%, #060F1E 100%)' }}
      />

      {/* Blue orb — top left */}
      <div
        className="blob blob-blue"
        style={{ width: '55vw', height: '55vw', top: '-15%', left: '-10%', opacity: 0.17 }}
      />

      {/* Violet orb — center right */}
      <div
        className="blob blob-violet"
        style={{ width: '42vw', height: '42vw', top: '30%', right: '-8%', opacity: 0.13 }}
      />

      {/* Cyan orb — bottom left */}
      <div
        className="blob blob-cyan"
        style={{ width: '38vw', height: '38vw', bottom: '-10%', left: '20%', opacity: 0.10 }}
      />

      {/* Subtle dot grid */}
      <div
        className="absolute inset-0 dot-grid opacity-100"
        style={{ backgroundSize: '32px 32px' }}
      />

      {/* Top center radial vignette — makes the page feel centered */}
      <div
        className="absolute inset-x-0 top-0 h-[40vh]"
        style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(59,130,246,0.07) 0%, transparent 100%)' }}
      />

      {/* Bottom fade */}
      <div
        className="absolute inset-x-0 bottom-0 h-32"
        style={{ background: 'linear-gradient(to top, rgba(3,9,20,0.6), transparent)' }}
      />
    </div>
  )
}
