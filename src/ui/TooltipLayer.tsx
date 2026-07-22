import { useEffect, useRef, useState } from "react";

/**
 * A single custom tooltip for the whole app. Any element carrying a non-empty
 * `data-tip` attribute shows it on hover — rendered as a styled, larger-font bubble
 * (native `title` tooltips can't be restyled). Supports multi-line text (\n).
 */
export function TooltipLayer() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const timer = useRef<number | null>(null);
  const posRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const clear = () => {
      if (timer.current) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    };

    const onOver = (e: PointerEvent) => {
      const el = (e.target as HTMLElement)?.closest?.("[data-tip]") as HTMLElement | null;
      const text = el?.getAttribute("data-tip")?.trim();
      if (!el || !text) return;
      clear();
      timer.current = window.setTimeout(() => {
        setTip({ text, x: posRef.current.x, y: posRef.current.y });
      }, 300);
    };
    const onOut = (e: PointerEvent) => {
      const from = (e.target as HTMLElement)?.closest?.("[data-tip]");
      const to = (e.relatedTarget as HTMLElement | null)?.closest?.("[data-tip]");
      if (from && from !== to) {
        clear();
        setTip(null);
      }
    };
    const onMove = (e: PointerEvent) => {
      posRef.current = { x: e.clientX, y: e.clientY };
    };
    const onDown = () => {
      clear();
      setTip(null);
    };

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      clear();
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, []);

  if (!tip) return null;
  // Clamp so the bubble stays on-screen; offset below-right of the cursor.
  const maxX = window.innerWidth - 300;
  const left = Math.min(tip.x + 14, Math.max(8, maxX));
  const top = Math.min(tip.y + 18, window.innerHeight - 60);
  return (
    <div className="app-tooltip" style={{ left, top }}>
      {tip.text}
    </div>
  );
}
