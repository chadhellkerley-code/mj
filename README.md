# Mejores amigos, con criterio

Panel para agregar una lista de usuarios a tus **Mejores amigos** (Close Friends) de Instagram
de a poco, con límite diario y pausas al azar para cuidar la cuenta.

Publicado en: https://mj-eight-lac.vercel.app/ (también funciona en tu computadora).

## Uso
1. Entra con la **contraseña del panel** (`APP_PASSWORD`).
2. Inicia sesión en Instagram con usuario y contraseña. Si Instagram lo rechaza, usa
   **"Usa tu sesión de instagram.com"** (ver más abajo).
3. Pega los usuarios: uno por línea, o separados por comas o espacios. Acepta `@usuario` y
   enlaces de perfil (`https://instagram.com/usuario`). Los repetidos se ignoran.
4. Toca **Agregar a la cola**, elige **Ritmo** y **Límite por día**, y toca **Empezar**.
5. **Deja la pestaña abierta** mientras corre. Puedes pausar y seguir cuando quieras;
   la cola queda guardada en ese navegador.

Al llegar al límite del día se detiene. Otro día, toca **Seguir** y continúa desde donde quedó.

### Entrar con `sessionid`
Evita el inicio de sesión desde el servidor (y sus verificaciones):

1. En la computadora, abre instagram.com con tu cuenta iniciada.
2. Abre las herramientas de desarrollador (F12, o Cmd+Opción+I en Mac) →
   **Application → Cookies → https://www.instagram.com**.
3. Copia el valor de la cookie **`sessionid`** y pégalo en el panel.

Es la llave de tu sesión: no la compartas. Si cierras sesión en instagram.com deja de servir
y hay que copiarla de nuevo.

## Límites
En los dos ritmos:

- No pasa del **límite por día** (80 por defecto, máximo 250).
- Salta a quienes ya están en tu lista, sin gastar acciones.
- Se detiene al instante ante un aviso de bloqueo o límite de Instagram, y tras 3 errores seguidos.

|                       | Prudente (por defecto) | Rápido            |
|-----------------------|------------------------|-------------------|
| Personas por lote     | 5–10                   | 15–25             |
| Pausa entre lotes     | 45 s – 2 min           | 30 s – 1 min 15 s |
| Descanso largo        | 10–20 min cada 40      | 5–10 min cada 100 |
| Pausa entre búsquedas | 3–8 s                  | 2–5 s             |
| 250 en un día         | ~2 h 15 min            | ~45 min           |

Los valores están en la constante `PACES` de `public/index.html`.

### Recomendación para subir el ritmo
Instagram no publica un número seguro; lo que más lo alerta es un salto brusco.

| Días         | Límite por día | Ritmo    |
|--------------|----------------|----------|
| 1–3          | 50             | Prudente |
| 4–7          | 100            | Prudente |
| 8–14         | 150            | Prudente |
| Desde el 15  | 250            | Prudente o Rápido |

Si aparece "acción bloqueada" o te pide verificar, para uno o dos días y vuelve con un límite más bajo.

## Despliegue en Vercel
El proyecto está conectado al repositorio: cada push a la rama principal se despliega solo.

Variables de entorno obligatorias (Project → Settings → Environment Variables):

- `APP_PASSWORD`: contraseña para entrar al panel. Sin ella, cualquiera con la URL podría usarlo.
- `SESSION_SECRET`: texto largo al azar (por ejemplo `openssl rand -hex 32`). Cifra las sesiones.
  Si lo cambias, hay que volver a iniciar sesión en Instagram.

Las variables solo aplican a despliegues nuevos: después de cambiarlas, haz **Redeploy**.
No hay que configurar nada más: `vercel.json` sirve `public/` y manda `/api/*` a `api/index.js`.

## En tu computadora
Requiere Node.js 18+.

    npm install
    npm start

Abre http://localhost:3000. En local `APP_PASSWORD` y `SESSION_SECRET` son opcionales.

## Cómo funciona
- **Sin estado en el servidor.** `lib/app.js` es una API Express que usa `instagram-private-api`
  y no guarda nada. La sesión de Instagram vuelve al navegador cifrada con AES-256-GCM
  (clave: `SESSION_SECRET`) y el navegador la manda en cada pedido. La contraseña de Instagram
  solo se usa para iniciar sesión.
- **El navegador conduce la cola** en pasos cortos (buscar un usuario, agregar un lote), así
  ninguna función de Vercel corre más de unos segundos.
- **Todo lo local** (cola, contador del día, ritmo y límite) se guarda por cuenta en `localStorage`.
- **Versión de la app.** La librería trae una versión de 2022 que Instagram rechaza. `APP_PROFILE`
  en `lib/app.js` define la versión que se presenta. Si vuelve a salir
  "Your version of Instagram is out of date", hay que actualizarla.

### Archivos
| Archivo             | Qué es |
|---------------------|--------|
| `public/index.html` | Panel completo (interfaz y motor de la cola) |
| `lib/app.js`        | API |
| `api/index.js`      | Entrada de Vercel |
| `server.js`         | Servidor local |
| `vercel.json`       | Configuración de Vercel |

### API
Todas las rutas piden el encabezado `x-app-password` (salvo `/api/config`) y, las que usan
Instagram, el `token` cifrado en el cuerpo.

| Ruta                     | Qué hace |
|--------------------------|----------|
| `GET /api/config`        | Dice si el panel pide contraseña |
| `POST /api/unlock`       | Comprueba la contraseña del panel |
| `POST /api/login`        | Inicia sesión con usuario y contraseña (puede pedir 2FA) |
| `POST /api/2fa`          | Completa el inicio de sesión con el código |
| `POST /api/login-session`| Inicia sesión con la cookie `sessionid` |
| `POST /api/me`           | Devuelve el usuario de la sesión |
| `POST /api/resolve`      | Busca un usuario por nombre y devuelve su id |
| `POST /api/besties/page` | Una página de tu lista actual de Mejores amigos |
| `POST /api/besties/add`  | Agrega hasta 25 ids a Mejores amigos |

## Problemas comunes
| Mensaje | Qué hacer |
|---------|-----------|
| "Your version of Instagram is out of date" | Actualizar `APP_PROFILE` en `lib/app.js`, o entrar con `sessionid` |
| "Instagram pidió verificar que eres tú" | Aprobar en la app ("Fui yo") y reintentar, o entrar con `sessionid` |
| "Instagram bloqueó la acción temporalmente" | Esperar uno o dos días y bajar el límite |
| "Tu sesión expiró" | Volver a iniciar sesión (las sesiones duran hasta 30 días) |
| "Falta configurar APP_PASSWORD / SESSION_SECRET" | Agregar la variable en Vercel y hacer Redeploy |

## Advertencias
- La API privada no es oficial y va contra los Términos de uso de Instagram: puede haber
  bloqueos temporales, verificaciones o restricciones de la cuenta.
- Desde Vercel, Instagram ve IPs de centros de datos: es más probable que pida verificación
  o bloquee acciones que desde tu casa.
- Usa solo cuentas que te pertenezcan.
