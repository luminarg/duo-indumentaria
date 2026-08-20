// Service worker del panel — solo se encarga de mostrar las notificaciones
// push y de llevar al usuario a Tareas cuando toca una. No cachea nada (no
// es un service worker "offline-first"), así que no hay que preocuparse por
// invalidar caché en cada deploy.

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Duo Indumentaria", body: event.data.text() };
  }

  const title = payload.title || "Duo Indumentaria";
  const options = {
    body: payload.body || "",
    ...(payload.icon ? { icon: payload.icon, badge: payload.icon } : {}),
    data: { url: payload.url || "/panel/tareas" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/panel/tareas";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
