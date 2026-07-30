import {
  Shirt,
  Lightbulb,
  Trophy,
  Package,
  Scissors,
  Palette,
  Users,
  Star,
  Heart,
  Truck,
  ShoppingBag,
  Ruler,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

// Set curado de íconos para las tarjetas de la home (Configuración >
// Tarjetas con ícono). Se guarda solo la key en la base — así el ícono
// siempre es uno seguro/conocido, sin permitir nombres arbitrarios.
export const FEATURE_ICONS: Record<string, LucideIcon> = {
  shirt: Shirt,
  lightbulb: Lightbulb,
  trophy: Trophy,
  package: Package,
  scissors: Scissors,
  palette: Palette,
  users: Users,
  star: Star,
  heart: Heart,
  truck: Truck,
  "shopping-bag": ShoppingBag,
  ruler: Ruler,
  sparkles: Sparkles,
};

export const FEATURE_ICON_OPTIONS: { value: string; label: string }[] = [
  { value: "shirt", label: "Camiseta" },
  { value: "lightbulb", label: "Idea / asesoramiento" },
  { value: "trophy", label: "Trofeo" },
  { value: "package", label: "Paquete" },
  { value: "scissors", label: "Tijera" },
  { value: "palette", label: "Paleta de colores" },
  { value: "users", label: "Equipo / grupo" },
  { value: "star", label: "Estrella" },
  { value: "heart", label: "Corazón" },
  { value: "truck", label: "Entrega / envío" },
  { value: "shopping-bag", label: "Bolsa de compra" },
  { value: "ruler", label: "Medidas / moldería" },
  { value: "sparkles", label: "Destacado" },
];

export function getFeatureIcon(key: string): LucideIcon {
  return FEATURE_ICONS[key] ?? Shirt;
}
