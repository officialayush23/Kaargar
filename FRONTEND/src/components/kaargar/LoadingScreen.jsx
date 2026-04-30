import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'

export default function LoadingScreen({ onDone }) {
  const containerRef = useRef(null)
  const textRef = useRef(null)

  useEffect(() => {
    // Inject Playwrite Font dynamically for the loading screen
    const link = document.createElement('link')
    link.href = 'https://fonts.googleapis.com/css2?family=Playwrite+NO:wght@100..400&display=swap'
    link.rel = 'stylesheet'
    document.head.appendChild(link)

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        onComplete: () => {
          gsap.to(containerRef.current, {
            opacity: 0, duration: 0.6, ease: 'power2.inOut', onComplete: onDone
          })
        }
      })

      // Smooth Left-to-Right Reveal using clip-path
      tl.fromTo(textRef.current,
        { clipPath: 'inset(0 100% 0 0)', opacity: 1 },
        { clipPath: 'inset(0 0% 0 0)', duration: 1.5, ease: 'power3.inOut' }
      )
      
      // Hold for a moment to let the user see it
      tl.to({}, { duration: 0.8 })
    }, containerRef)

    return () => ctx.revert()
  }, [onDone])

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center select-none bg-black"
    >
      {/* Subtle Glow */}
      <div className="absolute w-[300px] h-[350px] bg-amber-500/10 blur-[80px] rounded-full pointer-events-none" />
      
      <h1
        ref={textRef}
        className="text-5xl md:text-7xl font-bold tracking-tight text-white relative z-10"
        style={{ 
          fontFamily: '"Playwrite NO", cursive', // Applied Playwrite Font
          opacity: 0 
        }}
      >
        Kaargar
      </h1>
    </div>
  )
}