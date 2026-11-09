# Alianza Tareas

App de la **Coordinación de Proyectos de Alianza Grupo Inmobiliario**, con dos áreas: **Oficina** y **Tareas**.
Usa los colores institucionales de Alianza: azul #1A3867, dorado #95762F y blanco.

## Tareas
- Escribe una tarea en la barra. Si mencionas una fecha o una hora ("viernes a las 10 am", "15 de nov", "mañana"), la app la toma sola. También puedes elegir proyecto, fecha, hora, aviso y prioridad.
- **Las tareas solo generan avisos.** Ningún agente trabaja sobre ellas a menos que pulses **«Enviar al equipo»** en la tarea y le expliques a Valeria qué necesitas.
- Se ven en lista (vencidas, hoy, próximos 7 días, más adelante, sin fecha) o en tablero.
- Cada tarea se puede agregar a Google Calendar, y todas se pueden exportar en un archivo .ics.

## Oficina
La oficina tiene cinco agentes. Ninguno trabaja por su cuenta: solo actúan cuando les envías algo.

| Agente | Qué hace |
|---|---|
| **Valeria · Coordinadora** | Recibe lo que envías al equipo (texto y adjuntos) y se lo pasa a quien corresponde. |
| **Mateo · Piezas informativas** | Diseña la pieza con la identidad de Alianza y los logos originales del proyecto. Acepta un texto o una imagen de referencia. |
| **Tomás · Textos** | Revisa redacción, coherencia, cohesión y ortografía, y entrega solo el texto ajustado. |
| **Daniela · Derechos de petición** | Responde una petición o revisa el borrador de un delegado. Siempre pregunta antes de redactar. |
| **Sofía · Tu bandeja** | Resume los correos no leídos y encuentra el asunto de un correo a partir de lo que recuerdes. Solo lectura. |

Lo que entrega un agente queda en **«Para ti»** hasta que lo apruebas, y se guarda en **Entregables**.

La ventana de cada agente funciona como en Gmail: se puede **minimizar**, **agrandar** o cambiar de ancho arrastrando su borde. Cuando un agente empieza a trabajar, su ventana se abre en grande.

### Daniela: cómo trabaja
1. **Cargar.** Pegas o adjuntas la petición (PDF, Word o texto) y los soportes (presupuestos en Excel, actas, circulares). Además le das el contexto y lo que se quiere dar a conocer.
2. **Datos personales.** Antes de que Daniela lea cualquier documento, se ocultan:
   - correos, teléfonos, documentos de identidad y direcciones;
   - los nombres que se detectan (después de "Señor/Señora", en líneas en mayúsculas y en las firmas);
   - los nombres que escribas en "Datos a ocultar".
   
   Puedes revisar en una vista previa lo que ella recibe.
3. **Preguntas.** Daniela resume la petición, lista lo que solicita, señala la información que falta y te hace sus preguntas.
4. **Borrador.** Lo escribe con la estructura de las respuestas modelo:
   - fecha, destinatario, REF, saludo y apertura empática;
   - un punto numerado por cada solicitud;
   - anexos, cierre institucional y firma.
   
   El tono es asertivo, respetuoso, cordial, empático, profesional y firme, nunca hostil ni defensivo. Nunca inventa cifras, hechos ni normas: lo que falta queda como **[PENDIENTE]**.
5. **Responder con voz y adjuntar más.** En las preguntas puedes responder cada una con voz o dictar todo en un solo mensaje; Daniela identifica qué respuesta va con cada pregunta. También puedes agregar documentos e imágenes adicionales y pedirle que analice de nuevo.
   - En la versión publicada en claude.ai, la página no tiene permiso para usar el micrófono: usa el dictado del teclado (🎤 en el celular, Win + H en Windows, Fn dos veces en Mac).
   - En la versión instalada, en Chrome o Edge, el botón 🎤 dicta directamente.
   - Las imágenes y los PDF escaneados se envían tal cual: tapa los datos personales antes de subirlos.
6. **Respuestas modelo.** En el Perfil de Daniela puedes subir hasta 3 respuestas que te gusten. Solo usa su estructura, y se guardan sin datos personales.

## Versión publicada (claude.ai)
- Claude funciona con tu cuenta, sin clave de API.
- Gmail se lee con el conector de claude.ai, solo con herramientas de lectura.
- Las tareas, los entregables y el registro se sincronizan entre tus dispositivos.
- `python3 build-artifact.py` genera `dist/alianza-tareas.html`, que es lo que se publica.

## Versión instalada
Abre `index.html` desde un servidor (por ejemplo, `python3 -m http.server`). En Ajustes agregas las claves de Claude y, opcionalmente, la de OpenAI.
