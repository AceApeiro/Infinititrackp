import React, { useEffect, useRef } from 'react';

interface Props {
  color?: string; // e.g. '#FBDF07' (yellow) or '#00FF00' (green)
  opacity?: number;
}

export default function MatrixRain({ color = '#FBDF07', opacity = 0.08 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let width = (canvas.width = canvas.offsetWidth || window.innerWidth);
    let height = (canvas.height = canvas.offsetHeight || window.innerHeight);

    // Grid columns
    const fontSize = 14;
    let columns = Math.floor(width / fontSize) + 1;
    let drops = Array(columns).fill(1).map(() => Math.floor(Math.random() * -100)); // stagger starts

    // Character set (standard binary & alphanumeric)
    const chars = "010101ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$#@*";

    const draw = () => {
      // Fade previous frames
      ctx.fillStyle = `rgba(0, 0, 0, 0.06)`;
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = color;
      ctx.font = `bold ${fontSize}px monospace`;

      for (let i = 0; i < drops.length; i++) {
        // Only draw if within bounds
        if (drops[i] >= 0) {
          const char = chars[Math.floor(Math.random() * chars.length)];
          const x = i * fontSize;
          const y = drops[i] * fontSize;

          // Vary alpha for depth
          ctx.globalAlpha = Math.random() * 0.4 + 0.3;
          ctx.fillText(char, x, y);
        }

        // Advance drop
        drops[i]++;

        // Reset drop to the top with standard random delay
        if (drops[i] * fontSize > height && Math.random() > 0.975) {
          drops[i] = 0;
        }
      }

      ctx.globalAlpha = 1.0; // reset
      animationId = requestAnimationFrame(draw);
    };

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth || window.innerWidth;
      height = canvas.height = canvas.offsetHeight || window.innerHeight;
      columns = Math.floor(width / fontSize) + 1;
      drops = Array(columns).fill(1).map(() => Math.floor(Math.random() * -100));
    };

    // Use ResizeObserver for perfect canvas/stage sizing relative to parent
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    } else {
      window.addEventListener('resize', handleResize);
    }

    draw();

    return () => {
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [color]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none select-none z-0"
      style={{ opacity }}
    />
  );
}
