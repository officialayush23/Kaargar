import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'

export default function LoadingScreen({ onDone }) {
  const containerRef = useRef(null)
  const textRef      = useRef(null)
  const onDoneRef    = useRef(onDone)

  // Keep ref in sync without re-running the effect
  useEffect(() => { onDoneRef.current = onDone }, [onDone])

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        onComplete: () => {
          gsap.to(containerRef.current, {
            opacity: 0,
            duration: 0.5,
            ease: 'power2.inOut',
            onComplete: () => onDoneRef.current?.(),
          })
        },
      })

      // Set initial state explicitly so it doesn't flash
      gsap.set(textRef.current, { opacity: 1, clipPath: 'inset(0 100% 0 0)' })

      // Left-to-right reveal
      tl.to(textRef.current, {
        clipPath: 'inset(0 0% 0 0)',
        duration: 1.4,
        ease: 'power3.inOut',
      })
      // Hold
      tl.to({}, { duration: 0.7 })
    }, containerRef)

    return () => ctx.revert()
  }, []) // empty deps — runs once, onDone accessed via ref

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
      }}
    >
      {/* Ambient glow */}
      <div style={{
        position: 'absolute',
        width: 300,
        height: 300,
        background: 'rgba(245,158,11,0.12)',
        filter: 'blur(80px)',
        borderRadius: '50%',
        pointerEvents: 'none',
      }} />

      {/* Logo text — always white, Playwrite NO font */}
      <h1
        ref={textRef}
        style={{
          fontFamily: '"Playwrite NO", cursive',
          fontSize: 'clamp(3rem, 10vw, 5rem)',
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: '#FFFFFF',
          position: 'relative',
          zIndex: 10,
          margin: 0,
          lineHeight: 1,
          // Start hidden — GSAP will animate clipPath
          clipPath: 'inset(0 100% 0 0)',
          opacity: 1,
        }}
      >
        Kaargar
      </h1>
    </div>
  )
}
