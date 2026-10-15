# Evidencia de validación de NODO

Verificación de la instancia actual en el entorno de desarrollo; no representa un despliegue externo, aceptación por el equipo, certificación de seguridad ni validación con datos reales.

## Instalación reproducible

Node.js 24.19.0, npm 11.9.0 y Chromium del sistema. `npm ci --cache /workspace/.cache/npm --ignore-scripts --no-audit --no-fund` completó desde el lockfile. La ejecución no necesita GPU, API vial, base de datos ni compilación. Las firmas de integridad de npm y TLS permanecieron activas.

## Comprobaciones ejecutadas

| Comando / alcance | Resultado actual |
| --- | --- |
| `npm run check` | 13 archivos JavaScript sin errores de sintaxis; recursos iniciales presentes |
| `npm test` | 24 pruebas aprobadas, 0 fallidas y 0 omitidas |
| Motor, dentro de `npm test` | 9 pruebas: determinismo, muestras compartidas, conservación por eje/segundo, límites, seguridad de fases, cero demanda, congestión, regresión adaptativa y horizonte |
| PERT, dentro de `npm test` | 5 pruebas: cálculo temprano/tardío, holguras, ramas, múltiples rutas críticas, varianza, precisión y rechazo de grafos/estimaciones inválidas |
| Servidor, dentro de `npm test` | 10 pruebas HTTP reales: autenticación, expiración/cierre, cookies, origen y Host, proxy falsificado, límites, rutas, symlinks, tamaño de solicitudes y archivo de acceso |
| `npm run test:browser` | 5 pruebas Chromium aprobadas; 0 fallidas y 0 omitidas |
| `npm start`, con archivo de acceso temporal fuera del checkout | Arranque real del CLI, health check, acceso autenticado y cinco capturas; cero errores de navegador. Servicio detenido y archivo temporal eliminado al finalizar |

Las pruebas de navegador comprueban acceso y rechazo anónimo, métricas contra el motor, cambio de demanda, reproducción, controles inválidos, demanda cero, descargas con contenido real, sensibilidad de veinte semillas, PERT editable, errores/reinicio, navegación por teclado y vista móvil de 390 × 844. La vista de escritorio también se inspeccionó mediante captura. No se observó desbordamiento horizontal global en móvil. Las tablas y la red PERT disponen de desplazamiento propio.

Se corrigió durante la validación una incompatibilidad real: `Referrer-Policy: no-referrer` provocaba `Origin: null` en el formulario de Chromium. La política final `same-origin` conserva el origen para el acceso legítimo. Se mantuvo el rechazo de orígenes externos, ausentes y `null`; no se debilitó la comprobación CSRF. Se eliminaron estilos inline del Gantt para respetar la CSP.

## Experimentos reproducibles

Configuración inicial: demanda NS 1,100 veh/h y OP 650 veh/h, verdes 45/35 s, despejes de 5 s por fase, saturación 1,800 veh/h por eje, horizonte 900 s, semilla 42.

| Métrica simulada | Fijo | Adaptativo |
| --- | ---: | ---: |
| Llegadas | 436 | 436 |
| Vehículos que cruzaron | 376 | 382 |
| Pendientes | 60 | 54 |
| Espera observada por llegada | 70.31 s | 68.33 s |
| Cola media | 34.06 veh | 33.10 veh |
| Flujo de salida equivalente | 1,504 veh/h | 1,528 veh/h |

La mejora agregada no implica mejora en cada eje: al cierre quedan 58/2 vehículos NS/OP con plan fijo y 33/21 con adaptativo. La tabla de resultados expone ambos pendientes. El modelo conserva vehículos y hace visible el costo del reparto.

Con las semillas 42–61 y los demás valores iniciales: menor espera adaptativa en 20 escenarios, ninguno mayor ni empatado; diferencia media adaptativo menos fijo de −12.93 s por llegada. Es una muestra de este modelo, sin intervalo de confianza ni generalización a la ciudad.

**Contraejemplo:** con demandas 700/700 veh/h, verdes 40/40 s, duración 900 s y semilla 42, la espera es 32.36 s fija y 37.03 s adaptativa. La adaptación puede reaccionar al ruido de las muestras y empeorar. Esta regresión se comprueba en la suite del motor.

Horizonte máximo de interfaz: 7,200 s, demandas 2,400/2,400 veh/h y semilla 42. El motor produjo 7,201 estados por estrategia, 9,653 llegadas y conservación de vehículos; la corrida observada tardó aproximadamente 27 ms en Node en esta máquina. El tiempo es una observación, no un compromiso de rendimiento en otros dispositivos ni una medición de red urbana.

PERT base calculado: 34 días laborables. Ruta A → C → D → G → I → J → K → L → M → N. Varianza 3.472222 días²; desviación aproximada 1.863390 días. Reserva 15%: 39.1 días frente a meta 40. No hay solapes de responsables en el calendario temprano base. Editar estimaciones puede crear solapes, que la interfaz advierte; CPM no nivela recursos automáticamente.

## Límites y pendientes

- La espera por llegada está truncada por el horizonte; no mide tiempo completo de viaje ni espera futura de vehículos pendientes.
- No se probaron datos de Waze, aforos reales, peatones, ámbar de campo, coordinación de cruces ni control físico: quedan fuera del prototipo.
- La cuenta de aplicación es única. La operación del equipo necesita acceso individual mediante infraestructura privada; no se presenta un sistema de altas, permisos o auditoría individual como implementado.
- El proveedor no está definido. No hay URL externa privada, túnel, publicación, cambio de visibilidad ni comprobación de red desde el exterior.
- El Dockerfile es una plantilla revisable; no se ejecutó `docker build` ni se desplegó un contenedor. Se validó el servidor nativo de Node.
- La revisión móvil/teclado y los controles de seguridad probados no equivalen a una auditoría completa de accesibilidad, penetración o seguridad vial.
- Las pruebas y capturas son evidencia técnica. La validación con usuarios y el acta de aceptación siguen siendo actividades del equipo.

Las instrucciones de instalación y arranque se guardan en un borrador de configuración, sin ejecutar un despliegue, activar cambios remotos ni publicar el entorno. La restauración en una tarea nueva no se ha comprobado.
