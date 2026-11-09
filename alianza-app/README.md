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

## 2. Diseño

- **Colores:** fondo blanco, azul institucional para la estructura y dorado solo como acento.
- **Navegación:** 5 pestañas fijas abajo, como en una app de celular: Hoy · Tablero · Correo · Oficina · Ajustes.
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
| Sofía | Archivista: carpetas, pendientes y logos del correo | Gmail · solo lectura |
| Andrés | Agenda: recordatorios, Google Calendar y archivo .ics | Calendario |

Cómo avanza una misión:
1. Cuando asignas una misión, el agente camina al **Centro de misiones** y la misión aparece en el Tablero como *En curso*.
2. Al terminar, la tarea pasa a *En revisión* y queda esperando tu aprobación.
3. Al pulsar **✓ Aprobar**, la tarea pasa a *Hecho*.

Abajo de la oficina, el registro muestra cada misión con su hora. Tomás puede pasarle su texto a Mateo con el botón **"Pasar a Mateo"**.

### Logos
En **Correo**, abre la carpeta de un proyecto y pulsa **"Buscar logos en esta carpeta"**. Luego eliges cuál usar. También puedes subirlo desde el equipo. Los logos se ponen sobre un recuadro blanco, sin cambiar su proporción ni sus colores.

## 3. Seguridad y permisos
- **Gmail:** la app solo pide el permiso `gmail.readonly`. Con ese permiso Google **no deja** enviar, responder, borrar, archivar, etiquetar ni marcar como leído. Tu buzón no cambia.
- Las claves de Claude y OpenAI, las tareas y los logos se guardan **solo en tu navegador** (localStorage). No hay servidor.
- Úsala en un equipo personal. Para usarla con todo el equipo conviene montar un pequeño servidor que guarde las claves (ver "Próximos pasos").

## 4. Puesta en marcha
1. Publica la carpeta `alianza-app/` en un servicio de hosting estático, por ejemplo GitHub Pages o Netlify. También puedes probarla en tu equipo con `python3 -m http.server` dentro de la carpeta y abrir `http://localhost:8000`.
2. **Ajustes → Claude:** pega tu clave de Anthropic (console.anthropic.com).
3. **Ajustes → ChatGPT:** pega tu clave de OpenAI (platform.openai.com).
4. **Ajustes → Gmail:** crea un *OAuth Client ID* de tipo "Aplicación web" en Google Cloud Console:
   - Activa la Gmail API.
   - En *Orígenes autorizados de JavaScript*, agrega la URL donde publicaste la app.
   - Pega el Client ID en la app.
5. En **Hoy**, pulsa **"Activar recordatorios"**.

## 5. Próximos pasos sugeridos
- Mostrar automáticamente como tareas los correos con las etiquetas *PENDIENTES VALIDAR* y *PENDIENTES COMITE*, siempre en solo lectura.
- Un servidor ligero para guardar las claves y sincronizar las tareas entre el celular y el computador.
- Leer los logos de Google Drive además de los del correo.
