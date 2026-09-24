# Mejores amigos, con criterio

Panel local para: iniciar sesión en TU cuenta de Instagram, descargar tus seguidores,
filtrarlos y agregarlos a Mejores amigos (Close Friends) por tandas.

## Uso
Requiere Node.js 18+.

    npm install
    npm start

Abre http://localhost:3000

## Cómo funciona
- `server.js`: servidor Express que corre solo en 127.0.0.1 y usa `instagram-private-api`.
- `public/index.html`: interfaz (login, 2FA, descarga, filtros, selección, agregar).
- La sesión se guarda en `.session.json` (no la subas a Git; ya está en .gitignore).
  Cerrar sesión desde el panel la borra.

## Advertencias
- La API privada no es oficial y va contra los Términos de uso de Instagram: puede haber
  bloqueos temporales, verificaciones o restricciones de la cuenta.
- Usa solo cuentas que te pertenezcan.
- Ve por tandas de 100–150 por día. El servidor ya agrega de a 25 con pausas aleatorias.
- Si Instagram pide verificación, apruébala en la app ("Fui yo") y reintenta.
- Si algún método deja de funcionar, Instagram cambió su API: actualiza con `npm update instagram-private-api`.
