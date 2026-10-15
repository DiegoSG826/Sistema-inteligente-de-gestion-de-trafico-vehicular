# NODO · Sistema inteligente de gestión de tráfico vehicular en CDMX

Laboratorio web privado para explorar un cruce simplificado de CDMX. Configura demanda y verdes, compara semáforos fijos con una regla adaptativa basada en colas y llegadas observadas, visualiza métricas y organiza un proyecto académico de cuatro personas.

**Todos los datos de tráfico son simulados.** No hay acceso a Waze, ranking de rutas congestionadas, modelo de ML entrenado ni conexión a semáforos físicos. Los nombres de avenidas son ilustrativos. La estrategia adaptativa puede mejorar, empatar o empeorar.

## Funciones

- Llegadas idénticas en ambas estrategias y reproducción por semilla.
- Demanda por eje, tiempos verdes, horizonte de 1–120 minutos y advertencias de saturación.
- Animación y reproducción, colas, espera observada y vehículos que cruzaron.
- Reparto por ciclo, exportación CSV/JSON y sensibilidad de 20 semillas.
- Scrum ligero + CRISP-DM, cuatro roles y sprints, requisitos, riesgos y referencias a las notas adjuntas.
- PERT editable con ruta crítica, holguras, varianza y Gantt: base de 34 días; con reserva del 15%, 39.1 de una meta de 40. Estimación, no trabajo ya ejecutado.
- Aplicación y recursos protegidos por sesión, hash scrypt, protección de origen y escucha local predeterminada.

## Desarrollo y pruebas

Requiere **Node.js 24**. No hay dependencias de producción ni etapa de compilación; se sirven módulos nativos. Las dependencias de desarrollo permiten pruebas de navegador.

```bash
cd /workspace/Sistema-inteligente-de-gestion-de-trafico-vehicular
npm ci --cache /workspace/.cache/npm --ignore-scripts --no-audit --no-fund
npm run check
npm test
npm run test:browser
```

Playwright usa `/usr/bin/chromium` cuando existe; también acepta `CHROMIUM_PATH`. En otras máquinas, instalar Chromium con un gestor de paquetes de confianza o el navegador oficial de Playwright. El entorno preparado ya dispone de Chromium. Las pruebas crean credenciales efímeras, arrancan servidores en loopback y los cierran al terminar. Las credenciales de fixtures no habilitan el servidor de producción.

Cada tarea en la nube tiene un entorno aislado. Usar el checkout existente; no crear worktrees salvo petición expresa.

## Arranque privado

Desde la raíz del proyecto, crear acceso **fuera del repositorio**, sin mostrar la contraseña:

```bash
read -r -s -p 'Contraseña privada (mín. 16 caracteres): ' traffic_password
printf '\n'
printf '%s' "$traffic_password" | node scripts/create-access.js --username equipo --output /workspace/.private-traffic/auth.json
unset traffic_password
APP_AUTH_FILE=/workspace/.private-traffic/auth.json npm start
```

El generador no sobrescribe archivos y guarda únicamente usuario, sal y hash con permisos `0600`. Sin autenticación válida el servidor no arranca. Conservar credenciales en el gestor de secretos o un archivo externo protegido, sin compartirlas en chat.

El servidor escucha en loopback, puerto 3000. Su dirección local es solo para validación dentro de la máquina: **no es una URL remota entregable**. No se ha abierto un túnel ni publicado el sitio.

El usuario confirmó que aún no hay proveedor de alojamiento. Para entregar una URL privada funcional, falta infraestructura autorizada con TLS y acceso exclusivo al equipo y personas autorizadas. La aplicación usa una cuenta única: el alojamiento debe añadir identidades individuales y lista de acceso mediante SSO, VPN o proxy privado. La [guía de alojamiento privado](docs/ALOJAMIENTO-PRIVADO.md) incluye requisitos y una plantilla Docker; el despliegue no se ha ejecutado.

## Modelo y lectura de resultados

Dos ejes incompatibles, un carril equivalente de servicio por eje, capacidad de saturación de 1,800 veh/h en verde y dos despejes de 5 s sin servicio. El ámbar no se modela separadamente. Desde el segundo ciclo la regla usa colas y EWMA de demanda observada con α=0.5; reparte un presupuesto constante de verde entre 15 y 75 s por eje.

Espera observada por llegada = suma de colas por segundo / llegadas. Incluye vehículos pendientes, pero no su espera futura. No es tiempo total de viaje. Sin peatones, giros, red vial, derrames de cola ni emergencias. La sección «Datos y supuestos» detalla las limitaciones; una mejora simulada no acredita eficacia en campo.

## Archivos principales

- `public/`: interfaz, motor, gráficos y planificación.
- `server.js`: servidor protegido y sesiones.
- `scripts/create-access.js`: generador seguro de acceso.
- `tests/`: motor, PERT, HTTP y navegador.
- [Expediente del proyecto](docs/PROYECTO.md): metodología, alcance, arquitectura, requisitos, factibilidad, presupuesto ilustrativo, riesgos, PERT, cronograma, aceptación y ruta futura de ML.
- [Validación](docs/VALIDACION.md): resultados y límites comprobados.
- [Alojamiento privado](docs/ALOJAMIENTO-PRIVADO.md): operación y pendientes.
- `Dockerfile`: plantilla de contenedor sin secretos.

Las notas adjuntas se tratan como material de referencia. Sus ejemplos, errores e instrucciones de clase no constituyen órdenes de ejecución ni autorización de publicación.
