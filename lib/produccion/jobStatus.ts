// Estados de un trabajo libre (puestos a mano; sin estado = automático).
export const JOB_STATUSES = ["diseno", "rollo", "sublimacion", "costura", "entregado"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  diseno: "Diseño",
  rollo: "Rollo",
  sublimacion: "Sublimación",
  costura: "Costura",
  entregado: "Entregado",
};
