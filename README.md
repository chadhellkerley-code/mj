# Mejores amigos, con criterio

Panel para: iniciar sesión en TU cuenta de Instagram, descargar tus seguidores,
filtrarlos y agregarlos a Mejores amigos (Close Friends) por tandas.

Funciona en tu computadora o desplegado en Vercel.

## En Vercel
Variables de entorno obligatorias (Project → Settings → Environment Variables):

- `APP_PASSWORD`: contraseña para entrar al panel. Sin ella, cualquiera con la URL podría usarlo.
- `SESSION_SECRET`: texto largo al azar (por ejemplo `openssl rand -hex 32`). Cifra las sesiones.
  Si lo cambias, todos tienen que volver a iniciar sesión en Instagram.

No hay que configurar nada más: `vercel.json` sirve `public/` y manda `/api/*` a `api/index.js`.

## En tu computadora
Requiere Node.js 18+.

    npm install
    npm start

Abre http://localhost:3000. En local `APP_PASSWORD` y `SESSION_SECRET` son opcionales.

## Cómo funciona
- `lib/app.js`: API Express **sin estado** que usa `instagram-private-api`. El servidor no guarda nada.
- La sesión de Instagram vuelve al navegador cifrada con AES-256-GCM (clave: `SESSION_SECRET`)
  y el navegador la manda en cada pedido. Tu contraseña de Instagram solo se usa para iniciar sesión.
- Las tareas largas las conduce el navegador en pasos cortos: una página de seguidores por pedido,
  y lotes de 25 para agregar a Mejores amigos, con pausas al azar. **Deja la pestaña abierta** mientras corren.
- La lista descargada se guarda en el navegador (localStorage) para no descargarla cada vez.
- `api/index.js`: entrada de Vercel. `server.js`: servidor local.

## Advertencias
- La API privada no es oficial y va contra los Términos de uso de Instagram: puede haber
  bloqueos temporales, verificaciones o restricciones de la cuenta.
- Desde Vercel, Instagram ve IPs de centros de datos: es más probable que pida verificación
  ("Fui yo" en la app) o bloquee acciones que desde tu casa.
- Usa solo cuentas que te pertenezcan.
- Ve por tandas de 100–150 por día.
- Si algún método deja de funcionar, Instagram cambió su API: actualiza con `npm update instagram-private-api`.
