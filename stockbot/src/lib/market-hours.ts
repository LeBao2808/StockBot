"use client";

import { useEffect, useEffectEvent, useState } from "react";

/** Vietnam stock market session in Vietnam time (UTC+7): Mon–Fri, 09:00–15:00. Holidays are not modelled. */
export function isVnTradingTime(date = new Date()) {
  const vn = new Date(date.getTime() + 7 * 3600_000);
  const day = vn.getUTCDay();
  const minutes = vn.getUTCHours() * 60 + vn.getUTCMinutes();
  return day >= 1 && day <= 5 && minutes >= 9 * 60 && minutes < 15 * 60;
}

/** Calls `callback` every `ms` while the market is open and the tab is visible. */
export function useTradingInterval(callback: () => void, ms = 10_000) {
  const tick = useEffectEvent(callback);
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden && isVnTradingTime()) tick();
    }, ms);
    return () => clearInterval(id);
  }, [ms]);
}

/** Market open/closed, re-checked every minute; null until mounted (avoids SSR mismatch). */
export function useMarketOpen() {
  const [open, setOpen] = useState<boolean | null>(null);
  useEffect(() => {
    const update = () => setOpen(isVnTradingTime());
    const first = setTimeout(update, 0);
    const id = setInterval(update, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  return open;
}
