import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'

export default function LoadingScreen({ onDone }) {
  const containerRef = useRef(null)
  const textRef      = useRef(null)
  const dotRef       = useRef(null)
  const onDoneRef    = useRef(onDone)

  useEffect(() => { onDoneRef.current = onDone }, [onDone])

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        delay: 0.15, // brief pause so custom font is loaded
        onComplete: () => {
          gsap.to(containerRef.current, {
            opacity: 0,
            duration: 0.45,
            ease: 'power2.inOut',
            onComplete: () => onDoneRef.current?.(),
          })
        },
      })

      // Text: gentle fade + float up
      tl.fromTo(
        textRef.current,
        { opacity: 0, y: 18 },
        { opacity: 1, y: 0, duration: 1.0, ease: 'power3.out' }
      )
      // Dot indicator fades in slightly after
      tl.fromTo(
        dotRef.current,
        { opacity: 0, scale: 0.6 },
        { opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(1.7)' },
        '-=0.5'
      )
      // Hold
      tl.to({}, { duration: 0.9 })
    }, containerRef)

    return () => ctx.revert()
  }, [])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000000',
        userSelect: 'none',
        gap: 20,
      }}
    >
      {/* Logo text — Playwrite NO cursive font */}
      <h1
        ref={textRef}
        style={{
          fontFamily: '"Playwrite NO", cursive',
          fontSize: 'clamp(3rem, 10vw, 5rem)',
          fontWeight: 400,
          color: '#FFFFFF',
          position: 'relative',
          zIndex: 10,
          margin: 0,
          lineHeight: 1.4,
          // Extra padding so descenders (g, y tails) are never clipped
          padding: '0.05em 0.15em 0.35em',
          opacity: 0, // GSAP takes over
        }}
      >
        Kaargar
      </h1>

      {/* Subtle amber dot indicator */}
      <div
        ref={dotRef}
        style={{
          display: 'flex',
          gap: 6,
          opacity: 0,
        }}
      >
        {[0, 1, 2].map(i => (
          <div
            key={i}
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: i === 1 ? '#F59E0B' : 'rgba(255,255,255,0.25)',
            }}
          />
        ))}
      </div>
    </div>
  )
}
