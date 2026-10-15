/**
 * Propuesta académica para cuatro personas; no describe un calendario ejecutado.
 * Duraciones en días laborables desde el día 0. Sin datos reales de Waze.
 */
export const projectData = {
  title: 'Sistema inteligente de gestión de tráfico vehicular en CDMX',
  status: 'Prototipo de simulación y propuesta académica',
  methodology: {
    name: 'Scrum ligero + CRISP-DM',
    summary: 'Cuatro sprints de dos semanas para entregar incrementos verificables; CRISP-DM organiza el entendimiento del problema, los datos, el modelado y la evaluación. El controlador actual usa reglas adaptativas, sin un modelo entrenado.',
    cadence: 'Planificación al inicio del sprint, sincronización diaria de 10 minutos, revisión y retrospectiva al cierre. Tablero con límite de una tarea principal por persona.',
    rationale: 'Un equipo de cuatro puede mantener acuerdos simples y recibir retroalimentación frecuente. CRISP-DM aporta trazabilidad de los supuestos y evita confundir una simulación con evidencia de campo.',
    caveat: 'Es una adaptación educativa de Scrum; no se afirma cumplir todas las responsabilidades y eventos del marco oficial.'
  },
  scope: {
    included: ['Configurar demanda y tiempos de un cruce representativo en CDMX.', 'Comparar control fijo y adaptativo con entradas simuladas equivalentes.', 'Visualizar colas, espera, circulación y asignación de verdes.', 'Documentar requisitos, factibilidad, riesgos, PERT, Gantt y validación.'],
    excluded: ['Conexión con semáforos físicos o autorización para operarlos.', 'Acceso confirmado a Waze o información vial en tiempo real.', 'Modelo de ML o deep learning entrenado y validado con datos de campo.', 'Garantía de reducción del tráfico real de CDMX.']
  },
  roles: [
    { id: 'P1', name: 'Producto y análisis', focus: 'Alcance, factibilidad y aceptación', responsibilities: ['Priorizar el backlog y representar al usuario académico.', 'Mantener requisitos, riesgos y acuerdos de aceptación.', 'Coordinar la entrega y documentar decisiones.'] },
    { id: 'P2', name: 'Ingeniería web', focus: 'Arquitectura, interfaz e integración', responsibilities: ['Construir interfaz y servicios de acceso privado.', 'Integrar simulación, comparación y visualizaciones.', 'Mantener configuración reproducible y revisar seguridad.'] },
    { id: 'P3', name: 'Datos y simulación', focus: 'Demanda sintética y estrategia adaptativa', responsibilities: ['Documentar procedencia y supuestos de los datos.', 'Implementar generador, controladores y métricas.', 'Diseñar experimentos y una futura evaluación de ML.'] },
    { id: 'P4', name: 'Calidad y experiencia', focus: 'UX, pruebas y trazabilidad', responsibilities: ['Diseñar prototipo accesible y revisar flujos.', 'Verificar invariantes, escenarios extremos y reproducción.', 'Mantener evidencias de validación y reporte de defectos.'] }
  ],
  sprints: [
    { id: 'S1', title: 'Entender y diseñar', weeks: 'Semanas 1–2 · días 0–10', goal: 'Acordar alcance y tener una arquitectura y prototipo navegable.', deliverables: ['A, B, C, D y E terminadas.', 'Backlog, factibilidad inicial, diccionario de datos, arquitectura y wireframes.', 'F y G iniciadas; se completan en el siguiente sprint.'] },
    { id: 'S2', title: 'Simular y comparar', weeks: 'Semanas 3–4 · días 10–20', goal: 'Disponer de ambos controladores y de la interfaz de comparación.', deliverables: ['F, G, H e I terminadas.', 'Mismas llegadas y semilla para las dos estrategias.', 'Integración J iniciada y supuestos visibles.'] },
    { id: 'S3', title: 'Verificar y contrastar', weeks: 'Semanas 5–6 · días 20–30', goal: 'Obtener una versión candidata con evidencias de prueba.', deliverables: ['J y K terminadas.', 'Reporte de casos, límites, conservación de vehículos y comparación.', 'Aceptación L iniciada con escenarios acordados.'] },
    { id: 'S4', title: 'Aceptar y entregar', weeks: 'Semanas 7–8 · días 30–40', goal: 'Entregar un prototipo privado reproducible y su expediente.', deliverables: ['L, M y N terminadas en el día esperado 34.', 'Manual, acta de aceptación propuesta y pendientes explícitos.', 'Reserva de 5.1 días más 0.9 días de margen dentro de 40 días.'] }
  ],
  requirements: [
    { id: 'RF-01', title: 'Configurar demanda', type: 'Funcional', priority: 'Esencial', story: 'Como analista quiero ajustar demanda por eje para explorar congestión.', acceptance: ['Los controles muestran unidades y límites.', 'La misma configuración y semilla reproducen las llegadas.', 'Se identifica el origen simulado de los datos.'] },
    { id: 'RF-02', title: 'Configurar semáforos', type: 'Funcional', priority: 'Esencial', story: 'Como analista quiero cambiar ciclo y reparto de verde para contrastar planes.', acceptance: ['El sistema valida combinaciones de tiempos.', 'Las fases incompatibles no reciben verde simultáneo.', 'Se conservan los intervalos de seguridad definidos por el modelo.'] },
    { id: 'RF-03', title: 'Comparar estrategias', type: 'Funcional', priority: 'Esencial', story: 'Como evaluador quiero comparar plan fijo y adaptativo bajo la misma demanda.', acceptance: ['Ambos reciben las mismas llegadas y duración.', 'El control fijo mantiene el plan y el adaptativo explica sus ajustes.', 'Se admite que el adaptativo puede empatar o empeorar.'] },
    { id: 'RF-04', title: 'Inspeccionar circulación', type: 'Funcional', priority: 'Esencial', story: 'Como usuario quiero ver tiempos, colas y métricas para entender el resultado.', acceptance: ['Las métricas incluyen unidades y horizonte.', 'Las gráficas permiten distinguir las estrategias.', 'No se presentan resultados simulados como predicciones reales.'] },
    { id: 'RF-05', title: 'Consultar expediente', type: 'Funcional', priority: 'Esencial', story: 'Como integrante quiero consultar metodología, backlog y PERT para organizar el proyecto.', acceptance: ['Se muestran cuatro roles y cuatro sprints.', 'PERT incluye estimaciones, dependencias y ruta crítica calculada.', 'Las notas se citan por página y se separan de las decisiones del proyecto.'] },
    { id: 'RNF-01', title: 'Acceso privado', type: 'No funcional', priority: 'Esencial', story: 'Como propietario quiero limitar la consulta a usuarios autorizados.', acceptance: ['Una sesión sin credencial no accede al simulador ni a sus recursos.', 'Las credenciales no aparecen en el repositorio o documentación.', 'La revisión comprueba el acceso autenticado y el rechazo del acceso anónimo.'] },
    { id: 'RNF-02', title: 'Claridad y accesibilidad', type: 'No funcional', priority: 'Esencial', story: 'Como usuario quiero controles legibles y utilizables con teclado.', acceptance: ['Los controles tienen etiquetas, foco visible y estados comprensibles.', 'El significado no depende únicamente del color.', 'La vista se puede utilizar en pantalla móvil y escritorio.'] },
    { id: 'RNF-03', title: 'Verificabilidad', type: 'No funcional', priority: 'Esencial', story: 'Como revisor quiero conocer entradas y supuestos para reproducir los experimentos.', acceptance: ['Con idénticas entradas se obtienen resultados idénticos.', 'Llegadas equivalen a salidas más cola final.', 'Los tiempos y las colas permanecen dentro de límites válidos.'] }
  ],
  risks: [
    { id: 'R1', title: 'No disponer de datos reales autorizados', probability: 'Alta', impact: 'Alto', mitigation: 'Usar demanda sintética marcada; no condicionar el prototipo a Waze. Investigar acceso y licencia en una fase posterior.', owner: 'P3' },
    { id: 'R2', title: 'Confundir simulación con control vial real', probability: 'Media', impact: 'Muy alto', mitigation: 'Delimitar el alcance, mostrar supuestos y excluir conexiones a controladores físicos.', owner: 'P1' },
    { id: 'R3', title: 'Favorecer indebidamente al controlador adaptativo', probability: 'Media', impact: 'Alto', mitigation: 'Comparar llegadas idénticas, varios niveles de demanda y semillas; reportar empates y regresiones.', owner: 'P4' },
    { id: 'R4', title: 'Exposición involuntaria del sitio', probability: 'Media', impact: 'Alto', mitigation: 'Autenticación obligatoria antes de habilitar una URL; comprobar rechazo anónimo y no cambiar visibilidad sin aprobación.', owner: 'P2' },
    { id: 'R5', title: 'Retraso en integración o alcance excesivo', probability: 'Media', impact: 'Alto', mitigation: 'Priorizar simulación de un cruce, integrar en S2 y reservar 15% sobre la ruta crítica. ML queda como ampliación.', owner: 'P1' },
    { id: 'R6', title: 'Demanda que supera la capacidad del cruce', probability: 'Alta', impact: 'Medio', mitigation: 'Mostrar acumulación de cola y limitación de capacidad; no prometer eliminar congestión mediante tiempos.', owner: 'P3' },
    { id: 'R7', title: 'Falla de instalación o incompatibilidad', probability: 'Media', impact: 'Medio', mitigation: 'Fijar runtime y comandos, conservar verificaciones y validar arranque desde una instalación limpia.', owner: 'P2' },
    { id: 'R8', title: 'Baja comprensión o accesibilidad', probability: 'Media', impact: 'Medio', mitigation: 'Prueba guiada con tareas, etiquetas claras, teclado, contraste y explicación de unidades.', owner: 'P4' }
  ],
  pertTasks: [
    { id: 'A', title: 'Alcance y requisitos', owner: 'P1', optimistic: 1, likely: 2, pessimistic: 3, dependencies: [] },
    { id: 'B', title: 'Datos, métricas y supuestos', owner: 'P3', optimistic: 2, likely: 3, pessimistic: 4, dependencies: [] },
    { id: 'C', title: 'Factibilidad y riesgos', owner: 'P1', optimistic: 1, likely: 2, pessimistic: 3, dependencies: ['A'] },
    { id: 'D', title: 'Arquitectura y contrato del modelo', owner: 'P2', optimistic: 2, likely: 3, pessimistic: 4, dependencies: ['B', 'C'] },
    { id: 'E', title: 'Prototipo UX y accesibilidad', owner: 'P4', optimistic: 2, likely: 4, pessimistic: 6, dependencies: ['A'] },
    { id: 'F', title: 'Generador de demanda y escenarios', owner: 'P3', optimistic: 2, likely: 4, pessimistic: 6, dependencies: ['B', 'D'] },
    { id: 'G', title: 'Control fijo y motor base', owner: 'P2', optimistic: 2, likely: 4, pessimistic: 6, dependencies: ['D'] },
    { id: 'H', title: 'Control adaptativo y experimentos', owner: 'P3', optimistic: 3, likely: 6, pessimistic: 9, dependencies: ['F', 'G'] },
    { id: 'I', title: 'Interfaz y visualizaciones', owner: 'P2', optimistic: 4, likely: 7, pessimistic: 10, dependencies: ['E', 'G'] },
    { id: 'J', title: 'Integración y acceso privado', owner: 'P2', optimistic: 2, likely: 4, pessimistic: 6, dependencies: ['H', 'I'] },
    { id: 'K', title: 'Validación funcional y del modelo', owner: 'P4', optimistic: 3, likely: 6, pessimistic: 9, dependencies: ['J'] },
    { id: 'L', title: 'Aceptación y retroalimentación', owner: 'P1', optimistic: 2, likely: 3, pessimistic: 4, dependencies: ['K'] },
    { id: 'M', title: 'Ajustes y verificación final', owner: 'P2', optimistic: 1, likely: 2, pessimistic: 3, dependencies: ['L'] },
    { id: 'N', title: 'Manual, cierre y entrega', owner: 'P1', optimistic: 0.5, likely: 1, pessimistic: 1.5, dependencies: ['M'] }
  ],
  scheduleSummary: {
    unit: 'días laborables', baselineDays: 34, targetDays: 40, contingencyRate: 0.15,
    contingencyDays: 5.1, expectedWithContingency: 39.1, remainingMargin: 0.9,
    criticalPath: ['A', 'C', 'D', 'G', 'I', 'J', 'K', 'L', 'M', 'N'],
    criticalVariance: 3.4722222222222223, criticalStandardDeviation: 1.8633899812498247,
    note: 'Estimaciones de planificación, no datos históricos. CPM considera dependencias; se comprobó además que los responsables no se solapan en el calendario temprano. La reserva no implica garantía probabilística.'
  },
  notesReferences: [
    { pages: '1–2', topic: 'Ciclo de vida, documentación y calidad', application: 'Expediente de análisis, diseño, factibilidad, riesgos y evidencias de prueba.', caveat: 'La ISO/IEC 12207 sirve de referencia de procesos; no se declara certificación.' },
    { pages: '2–4', topic: 'Metodologías, Scrum y backlog', application: 'Scrum ligero para cuatro personas, tablero y revisiones; CRISP-DM complementa el trabajo de datos.', caveat: 'La nota de p. 2 sobre no usar ágiles por eficiencia es una afirmación contextual; la elección se justifica por incertidumbre y entregas. CRISP-DM es una propuesta añadida, no una atribución al PDF.' },
    { pages: '5–6', topic: 'Requisitos, verificación y aceptación', application: 'Historias con criterios observables, pruebas trazables y propuesta de acta de aceptación.' },
    { pages: '7–8', topic: 'Etapas, cronograma, dependencias y responsables', application: 'Inicio, planificación, desarrollo, seguimiento y cierre; cuatro responsables y calendario relativo.', caveat: 'No se reproduce la conversión de 20 semanas a 67 200 horas de p. 8; esfuerzo y duración se distinguen.' },
    { pages: '9–14', topic: 'Gantt, PERT, tiempos y contingencia', application: 'Estimaciones To/Tm/Tp, esperanza, varianza, recorrido temprano/tardío y ruta crítica.', caveat: 'La fórmula de holgura en p. 13 contiene una errata; se usa LF−EF o LS−ES. Las actividades se representan en nodos y no requieren tareas ficticias.' },
    { pages: '15–30', topic: 'Ejercicios de cálculo y representación', application: 'Tabla y rutas recalculadas para este proyecto; los ejemplos de otros sistemas no se usan como estimaciones propias.', caveat: 'El ejercicio 3 en p. 26 no coincide con la tabla p. 27; no se mezclan sus datos. Se elige reserva 15% explícita.' },
    { pages: '32–33', topic: 'Proyecto de gestión de tráfico', application: 'CDMX, semáforos y adaptación a circulación; demanda simulada donde no hay datos autorizados.', caveat: 'La mención de Waze o ML no acredita acceso, permisos ni un modelo entrenado.' },
    { pages: '34–35', topic: 'Factibilidad y riesgos técnicos', application: 'Análisis técnico, operativo, temporal, económico y legal con supuestos y mitigaciones.', caveat: 'La referencia a «42000» se trata como imprecisa; cualquier adopción de ISO/IEC 42001 y obligaciones legales requiere revisión formal.' }
  ]
};
