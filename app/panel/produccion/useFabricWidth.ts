"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_SETTINGS } from "@/lib/produccion/nesting";

const KEY = "duo.produccion.anchoTelaMm";
const EVENT = "duo-ancho-tela";

function read(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    if (v >= 300 && v <= 5000) return v;
  } catch {}
  return DEFAULT_SETTINGS.rollWidthMm;
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

/**
 * Ancho útil de la tela (mm). Cambia según la tela; se recuerda en este
 * navegador para la próxima vez.
 */
export function useFabricWidth(): [number, (mm: number) => void] {
  const mm = useSyncExternalStore(subscribe, read, () => DEFAULT_SETTINGS.rollWidthMm);
  const set = (v: number) => {
    if (!(v >= 300)) return;
    try {
      localStorage.setItem(KEY, String(v));
    } catch {}
    window.dispatchEvent(new Event(EVENT));
  };
  return [mm, set];
}
