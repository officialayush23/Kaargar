import React, { useEffect, useRef } from "react";
import { createNoise3D } from "simplex-noise"; // ✅ still imported (unused but kept for structure consistency)

const AuroraBackground = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);

    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", resize);

    class Aurora {
      constructor() {
        this.reset();
      }
      reset() {
        this.x = Math.random() * w;
        this.y = Math.random() * h / 2;
        this.radius = 200 + Math.random() * 200;
        this.color = `hsla(${200 + Math.random() * 40}, 80%, 40%, 0.15)`;
        this.angle = Math.random() * Math.PI * 2;
        this.speed = 0.002 + Math.random() * 0.003;
      }
      draw() {
        this.angle += this.speed;
        const gradient = ctx.createRadialGradient(
          this.x + Math.cos(this.angle) * 200,
          this.y + Math.sin(this.angle) * 200,
          100,
          this.x,
          this.y,
          this.radius
        );
        gradient.addColorStop(0, this.color);
        gradient.addColorStop(1, "transparent");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
      }
    }

    const auroras = [];
    for (let i = 0; i < 6; i++) auroras.push(new Aurora());

    function animate() {
      ctx.clearRect(0, 0, w, h);

      // background gradient (same as before)
      const gradient = ctx.createLinearGradient(0, 0, 0, h);
      gradient.addColorStop(0, "rgba(7, 7, 35, 0.8)");
      gradient.addColorStop(1, "rgba(0, 0, 0, 1)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = "lighter";
      auroras.forEach((a) => a.draw());

      requestAnimationFrame(animate);
    }
    animate();

    return () => {
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: -1,
        background: "transparent",
      }}
    />
  );
};

export default AuroraBackground;
