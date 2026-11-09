# Alianza Tareas

App de gestión de pendientes para la **Coordinación de Proyectos de Alianza Grupo Inmobiliario**.
Toma como referencia las funciones de Trello que compartiste (tableros, bandeja de entrada, planificador y recordatorios). La interfaz es más sencilla y está pensada para el día a día de la coordinación.

## 1. Análisis

| Necesidad | Lo que hace Trello | Lo que hace esta app |
|---|---|---|
| Ver qué está pendiente | Bandeja de entrada y tableros | Vista **Hoy**: vencidas, hoy, próximos 7 días y tareas sin fecha |
| Ordenar el trabajo | Tableros kanban | **Tablero** con 4 columnas (Por hacer · En curso · En revisión · Hecho) y filtro por proyecto |
| Convertir correos en tareas | Reenviar correos a Trello | Pestaña **Correo**: lee Gmail y crea la tarea con un clic. **Solo lectura** |
| Recordatorios | Notificaciones push | Notificaciones del navegador según el aviso que elijas en cada tarea |
| Calendario | Integración con Google/Outlook | Botón "Calendario" por tarea (Google Calendar) y exportación **.ics** de todos los pendientes, con alarma |
| IA | Resúmenes (plan de pago) | **Oficina virtual** con agentes especializados: Claude para redactar y ChatGPT para piezas gráficas |

Lo que salió al revisar tu correo (sin hacerle ningún cambio):
- Cada proyecto tiene su propia carpeta: Madero, Singular, Vita, Cúspide, Castilla Living, Verde Pino y otras. Esas carpetas son la lista de proyectos de la app.
- Ya existen etiquetas de seguimiento: *PENDIENTES VALIDAR*, *PENDIENTES COMITE*, *IC TEMAS PENDIENTES* y *PEN. ACTA DE ENTREGA*.
- El prompt "PROMT CREACIÓN DE COMUNICADOS - AGI" define el tono, el formato para WhatsApp, la paleta (**azul #1A3867**, **dorado #95762F**, **blanco**), la regla de **no modificar los logos** y el bloque de **trazabilidad**. El agente redactor sigue esas reglas tal cual.
- La app trae precargados 8 pendientes reales de la bandeja de entrada (sin datos personales). Por ejemplo: el empalme de Proyectos Capital del 11 de noviembre, la visita a Santana del 18 de noviembre y la circular de Castilla Living.

## 2. Flujo de trabajo

1. **Barra principal** (arriba en Hoy, Tablero, Oficina y Repositorio). Ahí dejas cualquier pendiente: una nota, una lista o un correo pegado completo.
2. **Valeria (coordinadora) lo reparte.**
   - Con Claude, separa los pendientes, detecta el proyecto y la fecha, elige el agente y escribe los pasos de **cómo proceder**.
   - Sin clave de Claude, usa reglas por palabras clave.
3. **Cada agente tiene su bandeja.** Si marcas "Que el agente empiece de inmediato", el agente toma el pendiente y trabaja solo. Si no, lo procesas tú desde su ficha en la Oficina.
4. **Revisión.** Lo que entrega un agente queda *En revisión* en el Tablero y como borrador en el **Repositorio**, hasta que lo apruebas.
5. **Recordatorios.**
   - Cada pendiente con fecha tiene su aviso.
   - Al abrir la app recibes el resumen del día.
   - Los pendientes sin fecha que llevan más de 3 días quietos te generan un aviso.
   - En **Hoy**, la tarjeta "Valeria te recomienda" muestra qué hacer primero y cómo.

### Derechos de petición (Daniela, asesora jurídica)
- **Detecta** los derechos de petición, tutelas y PQR que dejas en la barra.
- **Calcula el plazo legal** en días hábiles (Ley 1755 de 2015: 10, 15 o 30 días), descontando fines de semana y festivos de Colombia de 2026 y 2027.
- **Fija una fecha interna** 2 días hábiles antes del vencimiento legal y programa el recordatorio.
- **Redacta el borrador de respuesta**: clasificación, puntos solicitados, respuesta punto por punto y soportes que hay que reunir.
- **Revisa el borrador que envió un delegado**: veredicto, si responde cada punto, observaciones y una versión corregida.
- Todo es un **borrador para revisión humana**. Nada se envía.

### Repositorio
- **Entregables**: cada texto, borrador o pieza gráfica que produce un agente se guarda solo, en estado *Borrador* o *Aprobado*.
  - Se puede filtrar por tipo, agente, proyecto o texto.
  - Cada entregable se puede abrir, copiar o descargar (.txt o .png).
- **Actividades realizadas**: el historial de tareas terminadas, con su fecha.
- Se guarda en el navegador (IndexedDB). Desde *Ajustes → Exportar respaldo completo* bajas todo en un archivo JSON, con tareas, proyectos y entregables.

## 3. Diseño

- **Colores:** fondo blanco, azul institucional para la estructura y dorado solo como acento.
- **Navegación:** 5 pestañas fijas abajo, como en una app de celular: Hoy · Tablero · Oficina · Repositorio · Correo (Ajustes en el engranaje de arriba).
- Botón dorado **"+ Nueva tarea"** siempre visible.
- Se puede instalar en el celular (PWA): en Safari, *Compartir → Agregar a inicio*.

### Oficina virtual: un agente para cada trabajo
La pestaña **Oficina** muestra el equipo en una vista isométrica, inspirada en el video de referencia y adaptada a los colores de Alianza. Tiene cinco áreas: Dirección de Proyectos, Redacción, Estudio de diseño, Archivo y correo, y Sala de agenda.

Cada agente tiene su escritorio, una etiqueta con su nombre y un punto de color que indica su estado:
- Verde: disponible.
- Dorado: trabajando.
- Azul: esperando tu aprobación.

Al tocar un agente se abre su ficha con tres pestañas: **Actividad**, **Chat** (donde le asignas la misión) y **Perfil** (responsabilidades, herramientas y autonomía).

| Agente | Rol | Motor |
|---|---|---|
| Valeria | Coordinadora de proyectos: prioridades y plan del día | Claude |
| Tomás | Redactor de comunicados para WhatsApp con trazabilidad (prompt AGI) | Claude |
| Lucía | Redactora de respuestas a correos (solo borradores) | Claude |
| Mateo | Diseñador de piezas 1080×1350 con los logos originales sin alterar | ChatGPT |
| Daniela | Asesora jurídica: derechos de petición, tutelas y PQR (borrador o revisión) | Claude |
| Sofía | Archivista: carpetas, pendientes y logos del correo | Gmail · solo lectura |
| Andrés | Agenda: recordatorios, Google Calendar y archivo .ics | Calendario |

Cómo avanza una misión:
1. Cuando asignas una misión, el agente camina al **Centro de misiones** y la misión aparece en el Tablero como *En curso*.
2. Al terminar, la tarea pasa a *En revisión* y queda esperando tu aprobación.
3. Al pulsar **✓ Aprobar**, la tarea pasa a *Hecho*.

Abajo de la oficina, el registro muestra cada misión con su hora. Tomás puede pasarle su texto a Mateo con el botón **"Pasar a Mateo"**.

### Logos
En **Correo**, abre la carpeta de un proyecto y pulsa **"Buscar logos en esta carpeta"**. Luego eliges cuál usar. También puedes subirlo desde el equipo. Los logos se ponen sobre un recuadro blanco, sin cambiar su proporción ni sus colores.

## 4. Seguridad y permisos
- **Gmail:** la app solo pide el permiso `gmail.readonly`. Con ese permiso Google **no deja** enviar, responder, borrar, archivar, etiquetar ni marcar como leído. Tu buzón no cambia.
- Las claves de Claude y OpenAI, las tareas y los logos se guardan **solo en tu navegador** (localStorage). No hay servidor.
- Úsala en un equipo personal. Para usarla con todo el equipo conviene montar un pequeño servidor que guarde las claves (ver "Próximos pasos").

## 5. Puesta en marcha
1. Publica la carpeta `alianza-app/` en un servicio de hosting estático, por ejemplo GitHub Pages o Netlify. También puedes probarla en tu equipo con `python3 -m http.server` dentro de la carpeta y abrir `http://localhost:8000`.
2. **Ajustes → Claude:** pega tu clave de Anthropic (console.anthropic.com).
3. **Ajustes → ChatGPT:** pega tu clave de OpenAI (platform.openai.com).
4. **Ajustes → Gmail:** crea un *OAuth Client ID* de tipo "Aplicación web" en Google Cloud Console:
   - Activa la Gmail API.
   - En *Orígenes autorizados de JavaScript*, agrega la URL donde publicaste la app.
   - Pega el Client ID en la app.
5. En **Hoy**, pulsa **"Activar recordatorios"**.

## 6. Próximos pasos sugeridos
- Mostrar automáticamente como tareas los correos con las etiquetas *PENDIENTES VALIDAR* y *PENDIENTES COMITE*, siempre en solo lectura.
- Un servidor ligero, o Google Drive, para guardar las claves, sincronizar tareas y repositorio entre el celular y el computador, y compartirlos con los delegados.
- Leer los logos de Google Drive además de los del correo.
