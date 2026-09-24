# Mejores amigos, con criterio

Panel web para agregar una lista de usuarios a tus **Mejores amigos** (Close Friends) de Instagram
de a poco, con límite diario y pausas al azar para cuidar la cuenta.

Esta guía explica, paso a paso, cómo tener tu propia copia funcionando en Vercel y cómo usarla.
No hace falta saber programar.

---

## 1. Qué necesitas

- Una cuenta de **GitHub** (gratis): https://github.com/signup
- Una cuenta de **Vercel** (gratis, plan Hobby): https://vercel.com/signup. Lo más simple es
  registrarte con **"Continue with GitHub"**, así las dos cuentas quedan conectadas.
- Tu cuenta de Instagram.
- Una computadora con Chrome, Edge, Firefox o Safari.

---

## 2. Copiar el repositorio a tu GitHub

Vercel despliega desde un repositorio de **tu** cuenta de GitHub. Elige una de estas opciones.

### Opción A: Fork (la más fácil)
1. Abre la página de este repositorio en GitHub.
2. Arriba a la derecha, toca **Fork** → **Create fork**.
3. Listo: ahora tienes una copia en `github.com/TU-USUARIO/mj`.

### Opción B: Descargar el ZIP y subirlo a un repositorio nuevo
Úsala si no puedes hacer fork (por ejemplo, si el repositorio es privado y te pasaron el ZIP).

1. En la página del repositorio, toca **Code** → **Download ZIP** y descomprímelo.
2. En GitHub, toca **+** (arriba a la derecha) → **New repository**.
   - Ponle un nombre (por ejemplo `mejores-amigos`).
   - Márcalo como **Private** (recomendado).
   - **No** marques "Add a README". Toca **Create repository**.
3. En la página del repositorio vacío, toca **uploading an existing file**.
4. Arrastra **el contenido** de la carpeta descomprimida (no la carpeta en sí): `api`, `lib`,
   `public`, `package.json`, `package-lock.json`, `server.js`, `vercel.json`, `README.md`.
   Si no ves `.gitignore` no pasa nada.
5. Toca **Commit changes**.

Comprueba que en la raíz del repositorio se vean `package.json` y `vercel.json`. Si quedaron dentro
de una subcarpeta, Vercel no va a encontrar la configuración.

### Opción C: Con git (si ya lo usas)
    git clone https://github.com/chadhellkerley-code/mj.git mejores-amigos
    cd mejores-amigos
    git remote set-url origin https://github.com/TU-USUARIO/mejores-amigos.git
    git push -u origin HEAD

(Primero crea el repositorio vacío `mejores-amigos` en tu GitHub, como en la opción B.)

---

## 3. Preparar las dos claves

La app necesita dos valores secretos. Guárdalos en un lugar seguro (por ejemplo, tu gestor de
contraseñas).

| Variable         | Para qué sirve | Cómo elegirla |
|------------------|----------------|---------------|
| `APP_PASSWORD`   | Contraseña para entrar al panel. Sin ella, cualquiera con la URL podría usarlo. | Una contraseña larga que vas a escribir tú, por ejemplo `mis-amigos-2026-cafe-azul`. |
| `SESSION_SECRET` | Clave con la que se cifran las sesiones de Instagram. Nunca la vas a escribir a mano. | Un texto largo al azar (ver abajo). |

Para generar `SESSION_SECRET`, usa cualquiera de estas opciones:

- En Mac o Linux, en la Terminal: `openssl rand -hex 32`
- Con Node.js instalado: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Sin nada instalado: un generador de contraseñas con 64 caracteres, solo letras y números.

---

## 4. Desplegar en Vercel

1. Entra a https://vercel.com/new.
2. En **Import Git Repository**, busca tu repositorio y toca **Import**.
   - Si no aparece, toca **Adjust GitHub App Permissions** y dale acceso a ese repositorio.
3. En la pantalla de configuración:
   - **Project Name**: el que quieras. Define la URL, por ejemplo `mejores-amigos` →
     `mejores-amigos.vercel.app` (si está libre).
   - **Framework Preset**: déjalo en **Other**.
   - **Root Directory**: déjalo como está (`./`).
   - **Build and Output Settings**: no toques nada. El archivo `vercel.json` ya lo configura.
4. Abre **Environment Variables** y agrega las dos del paso 3:
   - Key `APP_PASSWORD`, Value: tu contraseña del panel → **Add**
   - Key `SESSION_SECRET`, Value: el texto al azar → **Add**
5. Toca **Deploy** y espera alrededor de un minuto.
6. Toca **Continue to Dashboard**. En **Domains** está tu URL (termina en `.vercel.app`).

### Comprobar que quedó bien
Abre tu URL:

- **Te pide "Contraseña del panel"** → todo bien. Sigue con la sección 5.
- **Aparece "Falta configurar APP_PASSWORD" o "SESSION_SECRET"** → ve a
  **Settings → Environment Variables**, agrega la que falta y luego
  **Deployments → ⋯ (en el último) → Redeploy**. Las variables solo se aplican a despliegues nuevos.
- **Te pide iniciar sesión en Vercel** → está activa la protección de Vercel. Para entrar desde
  cualquier dispositivo, desactívala en **Settings → Deployment Protection → Vercel Authentication**.
  La contraseña del panel sigue protegiendo la app.

### Actualizar más adelante
Vercel queda conectado al repositorio: cada cambio que subas a la rama principal se despliega solo.
Si hiciste fork, en GitHub toca **Sync fork** para traer las novedades de este repositorio.

---

## 5. Cómo usarlo

1. Abre tu URL y escribe la **contraseña del panel**.
2. **Conecta tu cuenta de Instagram** con usuario y contraseña.
   - Si pide un código, escribe el que llega por SMS o el de tu app de autenticación.
   - Si Instagram pide confirmar ("Fui yo") en la app, apruébalo y vuelve a intentar.
   - Si no te deja entrar, usa **"Usa tu sesión de instagram.com"** (ver abajo).
3. **Pega la lista de usuarios**: uno por línea, o separados por comas o espacios. Acepta
   `@usuario` y enlaces de perfil (`https://instagram.com/usuario`). Los repetidos se ignoran.
   Toca **Agregar a la cola**.
4. Elige el **Ritmo** (Prudente o Rápido) y el **Límite por día**.
5. Toca **Empezar**. Deja la pestaña abierta: vas a ver cada búsqueda, cada lote y la cuenta
   regresiva hasta el siguiente.
6. Puedes tocar **Pausar** cuando quieras y luego **Seguir**. Al llegar al límite del día se
   detiene solo; otro día, toca **Seguir** y continúa desde donde quedó.

Botones de la cola:
- **Reintentar los con error**: vuelve a poner como pendientes los que fallaron.
- **Quitar los terminados**: limpia de la lista los agregados, los que ya estaban y los que no existen.
- **Vaciar cola**: borra todo.

### Entrar con `sessionid`
Es la forma más confiable de entrar, porque no hace ningún inicio de sesión desde el servidor.

1. En la computadora, abre instagram.com con tu cuenta iniciada.
2. Abre las herramientas de desarrollador (F12, o Cmd+Opción+I en Mac) y ve a
   **Application → Cookies → https://www.instagram.com**.
3. Copia el valor de la cookie **`sessionid`** y pégalo en el panel → **Entrar con sessionid**.

Es la llave de tu sesión: no la compartas. Si cierras sesión en instagram.com deja de servir y
hay que copiarla de nuevo.

---

## 6. Límites y cómo cuida tu cuenta

Siempre, en los dos ritmos:
- No pasa del **límite por día** que elijas (80 por defecto, **máximo 250**).
- Salta a quienes ya están en tu lista, sin gastar acciones.
- Se detiene al instante ante un aviso de bloqueo o límite de Instagram, y tras 3 errores seguidos.

|                       | Prudente (por defecto) | Rápido            |
|-----------------------|------------------------|-------------------|
| Personas por lote     | 5–10                   | 15–25             |
| Pausa entre lotes     | 45 s – 2 min           | 30 s – 1 min 15 s |
| Descanso largo        | 10–20 min cada 40      | 5–10 min cada 100 |
| Pausa entre búsquedas | 3–8 s                  | 2–5 s             |
| 250 en un día         | ~2 h 15 min            | ~45 min           |

### Cómo ir subiendo
Instagram no publica un número seguro; lo que más lo alerta es un salto brusco.

| Días        | Límite por día | Ritmo             |
|-------------|----------------|-------------------|
| 1–3         | 50             | Prudente          |
| 4–7         | 100            | Prudente          |
| 8–14        | 150            | Prudente          |
| Desde el 15 | 250            | Prudente o Rápido |

Si aparece "acción bloqueada" o te pide verificar, para uno o dos días y vuelve con un límite más bajo.

---

## 7. Limitaciones actuales

- **La pestaña tiene que quedar abierta.** El trabajo lo conduce tu navegador. Si cierras la
  pestaña o la computadora se suspende, se detiene (la cola queda guardada y sigues después).
  Mejor usarlo desde una computadora: en el celular, el navegador frena las pestañas en segundo plano.
- **La cola vive en ese navegador.** Se guarda en el almacenamiento local: si cambias de
  navegador o de dispositivo, o borras los datos del sitio, empiezas con la cola vacía. El
  contador del día también es por navegador.
- **Máximo 250 por día**, por diseño.
- **Solo agrega.** No quita personas de Mejores amigos ni descarga tus seguidores.
- **Una cuenta a la vez por navegador.**
- **El inicio de sesión con contraseña puede fallar.** Instagram cambia su inicio de sesión
  seguido y la librería que usa esta app (`instagram-private-api`) ya no se mantiene. Si falla,
  usa `sessionid`.
- **Desde Vercel, Instagram ve IPs de centros de datos.** Es más probable que pida verificación o
  bloquee acciones que desde tu casa. Si te pasa seguido, úsalo en tu computadora (sección 9).
- **Las sesiones duran hasta 30 días.** Después hay que volver a entrar.
- **Va contra los Términos de uso de Instagram.** Usa la API privada, que no es oficial: puede
  haber bloqueos temporales, verificaciones o restricciones. Usa solo cuentas que te pertenezcan.

---

## 8. Problemas comunes

| Mensaje | Qué hacer |
|---------|-----------|
| "Contraseña del panel incorrecta" | Revisa `APP_PASSWORD` en Vercel. Si la cambiaste, haz Redeploy. |
| "Falta configurar APP_PASSWORD / SESSION_SECRET" | Agrega la variable en Vercel y haz Redeploy. |
| "Your version of Instagram is out of date" | Entra con `sessionid`, o actualiza `APP_PROFILE` en `lib/app.js`. |
| "Instagram pidió verificar que eres tú" | Aprueba en la app ("Fui yo") y reintenta, o entra con `sessionid`. |
| "Instagram no aceptó ese sessionid" | Copia uno nuevo desde instagram.com (el anterior se cerró). |
| "Instagram bloqueó la acción temporalmente" / "limitó las solicitudes" | Espera uno o dos días y baja el límite. |
| "Tu sesión expiró" | Vuelve a iniciar sesión. |
| Muchos "No existe" | Revisa que los nombres estén bien escritos (sin espacios dentro). |

---

## 9. Usarlo en tu computadora (opcional)

Útil si Instagram te bloquea seguido desde Vercel, porque así los pedidos salen desde tu conexión.

1. Instala **Node.js 18 o superior**: https://nodejs.org (versión LTS).
2. Descarga el repositorio (sección 2) y abre una terminal en esa carpeta.
3. Ejecuta:

       npm install
       npm start

4. Abre http://localhost:3000.

En local `APP_PASSWORD` y `SESSION_SECRET` son opcionales. Si no defines `SESSION_SECRET`, las
sesiones se pierden cada vez que reinicias el servidor.

---

## Para desarrolladores

- **Sin estado en el servidor.** `lib/app.js` es una API Express que usa `instagram-private-api` y no
  guarda nada. La sesión de Instagram vuelve al navegador cifrada con AES-256-GCM (clave:
  `SESSION_SECRET`) y el navegador la manda en cada pedido.
- **El navegador conduce la cola** en pasos cortos (buscar un usuario, agregar un lote), así ninguna
  función de Vercel corre más de unos segundos. Los ritmos están en la constante `PACES` de
  `public/index.html`.
- **Versión de la app.** La librería trae una versión de 2022 que Instagram rechaza. `APP_PROFILE` en
  `lib/app.js` define la versión que se presenta; si vuelve a salir "out of date", hay que actualizarla.

| Archivo             | Qué es |
|---------------------|--------|
| `public/index.html` | Panel completo (interfaz y motor de la cola) |
| `lib/app.js`        | API |
| `api/index.js`      | Entrada de Vercel |
| `server.js`         | Servidor local |
| `vercel.json`       | Configuración de Vercel (sin build, sirve `public/`, `/api/*` → `api/index.js`) |

Rutas (todas piden el encabezado `x-app-password`, salvo `/api/config`; las de Instagram, el
`token` cifrado en el cuerpo):

| Ruta                      | Qué hace |
|---------------------------|----------|
| `GET /api/config`         | Dice si el panel pide contraseña |
| `POST /api/unlock`        | Comprueba la contraseña del panel |
| `POST /api/login`         | Inicia sesión con usuario y contraseña (puede pedir 2FA) |
| `POST /api/2fa`           | Completa el inicio de sesión con el código |
| `POST /api/login-session` | Inicia sesión con la cookie `sessionid` |
| `POST /api/me`            | Devuelve el usuario de la sesión |
| `POST /api/resolve`       | Busca un usuario por nombre y devuelve su id |
| `POST /api/besties/page`  | Una página de tu lista actual de Mejores amigos |
| `POST /api/besties/add`   | Agrega hasta 25 ids a Mejores amigos |
