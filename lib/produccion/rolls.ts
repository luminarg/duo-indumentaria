import type { RollLayout } from "./types";

export type PhysicalRoll = { index: number; firstPano: number; lastPano: number; lengthMm: number };

/**
 * Reparte los paños (tramos del PDF) en rollos de tela/papel de un largo dado.
 * Un paño nunca se parte entre dos rollos. Sin largo de rollo (0) va todo en uno.
 */
export function groupIntoRolls(layout: RollLayout, rollLengthMm: number): { rolls: PhysicalRoll[]; tooLong: number[] } {
  const rolls: PhysicalRoll[] = [];
  const tooLong: number[] = [];
  let cur: PhysicalRoll | null = null;
  layout.segments.forEach((s, i) => {
    const len = s.endMm - s.startMm;
    if (rollLengthMm > 0 && len > rollLengthMm) tooLong.push(i + 1);
    if (!cur || (rollLengthMm > 0 && cur.lengthMm + len > rollLengthMm + 1e-6)) {
      cur = { index: rolls.length + 1, firstPano: i + 1, lastPano: i + 1, lengthMm: 0 };
      rolls.push(cur);
    }
    cur.lastPano = i + 1;
    cur.lengthMm += len;
  });
  return { rolls, tooLong };
}
