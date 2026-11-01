/* RandomStudio — avisos en el móvil (v3.34). Lo sirve GitHub Pages junto a index.html.
   Recibe los avisos push (historia esperando revisión, Short listo, algo que falló) y al tocarlos abre el Studio. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { titulo: "RandomStudio", cuerpo: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.titulo || "RandomStudio", {
    body: d.cuerpo || "", icon: "icono-192.png", badge: "icono-192.png", tag: d.etiqueta || undefined, data: { url: d.url || "./" },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    for (const c of cs) if ("focus" in c) return c.focus();
    return self.clients.openWindow(url);
  }));
});
