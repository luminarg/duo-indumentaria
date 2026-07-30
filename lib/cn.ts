import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Combina clases condicionales (clsx) y resuelve conflictos de Tailwind
// (twMerge) — el helper estándar para componentes de UI reutilizables.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
