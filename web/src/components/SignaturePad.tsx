"use client";

import { Eraser } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Draw a signature with a finger, a stylus or a mouse.
 *
 * Pointer events rather than separate mouse and touch handlers, so a manager
 * on a tablet in the packhouse and one on a laptop get the same behaviour.
 * The canvas is sized to its own box at device pixel ratio — a signature
 * drawn on a retina screen and stored at CSS pixels comes out as a smear.
 */
export function SignaturePad({
  onChange,
  height = 150,
  disabled = false,
}: {
  /** The drawn mark as a PNG data URL, or null once cleared. */
  onChange: (dataUrl: string | null) => void;
  height?: number;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  /** Match the backing store to the box, so strokes are crisp and not offset. */
  const fit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
  }, []);

  useEffect(() => {
    fit();
    // Resizing clears the backing store, so anything drawn is gone — say so
    // rather than leaving a stale data URL attached to an empty canvas.
    const onResize = () => {
      fit();
      dirty.current = false;
      setHasInk(false);
      onChange(null);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [fit, onChange]);

  function pointAt(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pointAt(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    // A dot: a signature can legitimately be a single tap.
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
    drawing.current = true;
    dirty.current = true;
    setHasInk(true);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || disabled) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pointAt(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (canvas && dirty.current) onChange(canvas.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    dirty.current = false;
    setHasInk(false);
    onChange(null);
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-line bg-white">
        <canvas
          ref={canvasRef}
          style={{ height, touchAction: "none" }}
          className="block w-full cursor-crosshair"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
        />
        {!hasInk && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-ink-faint">
            Sign here
          </p>
        )}
        {/* The rule the mark sits on, as it would on paper. */}
        <div className="pointer-events-none absolute inset-x-6 bottom-5 border-b border-line" />
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <p className="text-xs text-ink-faint">
          Draw with your finger, stylus or mouse.
        </p>
        <button
          type="button"
          onClick={clear}
          disabled={!hasInk}
          className="flex items-center gap-1 text-xs font-semibold text-ink-faint hover:text-ink disabled:opacity-40"
        >
          <Eraser size={12} /> Clear
        </button>
      </div>
    </div>
  );
}
