"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "../components/ui/Button";
import { savePushSubscription, deletePushSubscription } from "./push-actions";

// Convierte la clave pública VAPID (base64 url-safe) al formato que pide
// PushManager.subscribe (Uint8Array) — es el conversor estándar que
// recomienda la documentación de Web Push, no hay vuelta más simple.
function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

type SupportState = "checking" | "unsupported" | "supported";

export function NotificationsToggle({ initiallySubscribed }: { initiallySubscribed: boolean }) {
  const [support, setSupport] = useState<SupportState>("checking");
  const [subscribed, setSubscribed] = useState(initiallySubscribed);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // No se puede saber esto durante el render (en el servidor no existe
    // `navigator`) — hay que esperar a que el componente monte en el
    // navegador. Es justamente el caso de uso que un efecto tiene que
    // cubrir, así que el estado se actualiza acá a propósito.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupport("serviceWorker" in navigator && "PushManager" in window ? "supported" : "unsupported");
  }, []);

  async function handleActivate() {
    setError(null);
    setIsPending(true);
    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) throw new Error("Falta configurar la clave pública de notificaciones.");

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("No diste permiso para las notificaciones — podés activarlo de nuevo cuando quieras.");
      }

      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/panel/" });
      await navigator.serviceWorker.ready;

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("El navegador no devolvió los datos esperados de la suscripción.");
      }

      await savePushSubscription({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });
      setSubscribed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo activar la notificación");
    } finally {
      setIsPending(false);
    }
  }

  async function handleDeactivate() {
    setError(null);
    setIsPending(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/panel/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await deletePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setSubscribed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo desactivar la notificación");
    } finally {
      setIsPending(false);
    }
  }

  if (support === "unsupported") return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant={subscribed ? "secondary" : "primary"}
        size="sm"
        disabled={isPending || support === "checking"}
        onClick={subscribed ? handleDeactivate : handleActivate}
      >
        {subscribed ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
        {isPending ? "Un momento..." : subscribed ? "Notificaciones activadas" : "Activar recordatorio diario"}
      </Button>
      {error && <span className="max-w-[220px] text-right text-xs text-red-600">{error}</span>}
      {!subscribed && !error && (
        <span className="max-w-[220px] text-right text-[11px] text-zinc-400">
          En iPhone, primero instalá la app del panel (agregar a inicio) para que esto funcione.
        </span>
      )}
    </div>
  );
}
