"use client";

import { useEffect, useEffectEvent, useState } from "react";

/** Reveals assistant replies progressively so data appears to stream into the chat. */
export function TypewriterText({
  text,
  onTick,
  onDone,
}: {
  text: string;
  onTick: () => void;
  onDone: () => void;
}) {
  const [count, setCount] = useState(0);
  const tick = useEffectEvent(onTick);
  const done = useEffectEvent(onDone);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const frame = requestAnimationFrame(() => {
        setCount(text.length);
        done();
      });
      return () => cancelAnimationFrame(frame);
    }
    // Finish long answers in roughly 1.5s, short ones at a natural pace.
    const step = Math.max(1, Math.ceil(text.length / 90));
    let shown = 0;
    let frame = 0;
    const advance = () => {
      shown = Math.min(text.length, shown + step);
      setCount(shown);
      tick();
      if (shown < text.length) frame = requestAnimationFrame(advance);
      else done();
    };
    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
  }, [text]);

  return (
    <>
      {text.slice(0, count)}
      {count < text.length && <span className="type-caret" aria-hidden />}
    </>
  );
}
