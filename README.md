# Mejores amigos, con criterio

Panel para: iniciar sesión en TU cuenta de Instagram, pegar una lista de usuarios
y agregarlos a Mejores amigos (Close Friends) de a poco, con límites para cuidar la cuenta.

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
- El navegador conduce la cola en pasos cortos, con estos límites (constante `PACE` en `public/index.html`):
  - límite por día elegible (80 por defecto, máximo 250); al llegar se detiene y sigue otro día;
  - lotes de 5 a 10 personas, con 45 s a 2 min de pausa al azar entre lotes;
  - un descanso de 10 a 20 min cada 40 agregados;
  - búsqueda de cada usuario con 3 a 8 s de pausa;
  - salta a quienes ya están en tu lista, y se detiene al primer aviso de bloqueo o límite.
  **Deja la pestaña abierta** mientras corre.
- La cola y el contador del día se guardan en el navegador (localStorage).
- Si Instagram rechaza el inicio de sesión con usuario y contraseña, se puede entrar pegando la
  cookie `sessionid` de instagram.com (el panel explica cómo). No la compartas: es la llave de tu sesión.
- La versión de app que se presenta a Instagram está en `APP_PROFILE` (`lib/app.js`). Si vuelve a salir
  "Your version of Instagram is out of date", hay que actualizarla.
- `api/index.js`: entrada de Vercel. `server.js`: servidor local.

## Advertencias
- La API privada no es oficial y va contra los Términos de uso de Instagram: puede haber
  bloqueos temporales, verificaciones o restricciones de la cuenta.
- Desde Vercel, Instagram ve IPs de centros de datos: es más probable que pida verificación
  ("Fui yo" en la app) o bloquee acciones que desde tu casa.
- Usa solo cuentas que te pertenezcan.
- Si algún método deja de funcionar, Instagram cambió su API: actualiza con `npm update instagram-private-api`.
