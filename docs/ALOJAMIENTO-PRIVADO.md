# Alojamiento privado

El sitio incluye autenticación y está preparado para despliegue privado. No se ha desplegado ni se ha creado una URL pública. Para entregar una URL privada accesible al equipo todavía hace falta elegir una infraestructura autorizada con TLS y control de acceso de red. La autenticación de la aplicación no sustituye ese control de infraestructura. No usar túneles públicos para compartir el servidor local.

La aplicación implementa una única cuenta configurada para esta demostración; no ofrece administración de usuarios, identidades individuales ni auditoría por integrante. Para el acceso real de las cuatro personas del equipo, colocar delante un proveedor de identidad con cuentas individuales (SSO) y una lista explícita de personas autorizadas, además de la sesión de la aplicación. No compartir contraseñas por chat.

## Entorno local de desarrollo

Requiere Node.js 24. No hay dependencias de producción que instalar. Cada tarea en la nube ya usa un entorno aislado: trabajar en el checkout existente; no crear worktrees salvo petición expresa.

Crear la credencial **fuera del repositorio**, sin introducirla en argumentos, historial ni chat. El siguiente bloque para Bash pide una contraseña de al menos 16 caracteres sin mostrarla:

```bash
read -r -s -p 'Contraseña privada (mín. 16 caracteres): ' traffic_password
printf '\n'
printf '%s' "$traffic_password" | node scripts/create-access.js --username equipo --output /workspace/.private-traffic/auth.json
unset traffic_password
APP_AUTH_FILE=/workspace/.private-traffic/auth.json node server.js
```

El generador guarda solamente usuario, sal y hash scrypt en un archivo nuevo con permisos `0600`. Nunca sobrescribe archivos existentes y rechaza una ubicación dentro del repositorio. La contraseña no se imprime. El archivo también es sensible porque permite ataques fuera de línea: conservarlo con acceso restringido. No incluirlo en Git ni en imágenes Docker.

El servidor escucha únicamente en `127.0.0.1:3000` de forma predeterminada. Su dirección local es `http://127.0.0.1:3000`; solo funciona desde la máquina del entorno y **no es la URL de alojamiento privado solicitada**. Para probarlo desde un navegador remoto, usar exclusivamente el acceso privado ya proporcionado por la infraestructura autorizada. No ampliar su visibilidad para conseguir una vista previa.

También se admite `APP_USERNAME` y `APP_PASSWORD` suministradas por un gestor de secretos, con contraseña de 16 a 1024 caracteres. Evitar definir secretos literalmente en la línea de comandos. `APP_AUTH_FILE` tiene prioridad si ambas opciones existen.

## Despliegue detrás de un proxy privado con TLS

1. Seleccionar la infraestructura y su dominio privado; limitar la entrada mediante VPN, red privada o política de acceso que solo permita al equipo y personas autorizadas. Confirmar estas restricciones antes de iniciar el servicio.
2. Configurar un certificado TLS válido. El dominio de ejemplo `traffic.internal.example` es un marcador; no representa una dirección existente. Sustituirlo por el dominio privado autorizado.
3. Suministrar `APP_ORIGIN=https://traffic.internal.example` exactamente, sin barra final ni ruta. Preservar en el proxy el encabezado `Host` original. El servidor rechaza un `Host` distinto y no confía en `X-Forwarded-For`, `X-Forwarded-Host` ni `X-Forwarded-Proto`.
4. Mantener el puerto del proceso accesible solo por el proxy. En el mismo servidor, el enlace por defecto `127.0.0.1` basta. En contenedores, enlazar el puerto publicado al loopback del host y usar `HOST=0.0.0.0` dentro del contenedor. Cualquier enlace externo sin un origen HTTPS explícito se rechaza al iniciar.
5. Montar el archivo de credenciales como secreto de solo lectura, legible por el usuario no privilegiado del contenedor (UID 1000). Usar el mecanismo del gestor de secretos del proveedor. No copiarlo a la imagen ni añadirlo al repositorio.

Ejemplo de imagen y contenedor, cuando ya exista proxy privado y el archivo de secreto tenga propietario/permisos compatibles:

```bash
docker build -t nodo-cdmx:private .
docker run --rm --name nodo-cdmx --read-only --cap-drop=ALL --security-opt no-new-privileges \
  -p 127.0.0.1:3000:3000 \
  --mount type=bind,src=/ruta/privada/auth.json,dst=/run/secrets/traffic_auth,readonly \
  -e APP_ORIGIN=https://traffic.internal.example \
  nodo-cdmx:private
```

Esta es una plantilla de operación: no se ha ejecutado como despliegue. Restringir también los registros del proxy y evitar registrar encabezados `Cookie`, formularios o contraseñas. El servidor no registra credenciales ni solicitudes. No agregar servicios externos de analítica.

## Propiedades de acceso y validación

- Todas las páginas, los datos y los archivos de `public/` exigen sesión; solo `/login`, `/login.css` y la comprobación mínima `/healthz` están disponibles sin sesión.
- Inicio y cierre de sesión usan POST con comprobación exacta de `Origin`. Las cookies son `HttpOnly`, `SameSite=Strict` y de ocho horas; al configurar HTTPS también usan `Secure` y el prefijo `__Host-`. Cerrar sesión invalida el identificador en el servidor.
- Diez intentos de acceso por dirección en 15 minutos activan el límite. Hay además un límite global de 200 intentos por 15 minutos; detrás de un proxy los usuarios comparten su límite por dirección porque no se aceptan direcciones reenviadas sin confianza explícita.
- Sesiones y límites residen en memoria: reiniciar cierra todas las sesiones. Ejecutar una única réplica; varias réplicas requieren almacenar y coordinar sesiones/límites antes de habilitarlas.
- Se aplica CSP, `no-store`, `noindex`, bloqueo de inclusión en marcos, protección contra recorridos de rutas, restricción a archivos estáticos y rechazo de enlaces simbólicos fuera de `public/`.
- No se controla infraestructura vial real ni se consulta Waze. La validación compara estrategias con datos simulados y supuestos visibles.

```bash
npm test
```

Las pruebas HTTP reales cubren rutas y archivos sin sesión, inicio incorrecto/correcto, cookies, cierre e invalidación, caducidad, origen, encabezados de proxy falsos, límite de intentos, rutas codificadas, enlaces simbólicos y cuerpos excesivos. Una vez desplegado en infraestructura autorizada, comprobar desde fuera de la red permitida que la entrada esté bloqueada y, desde dentro, que la URL HTTPS solicite autenticación antes de mostrar cualquier dato. Esa última comprobación de red queda pendiente hasta disponer del alojamiento privado.
