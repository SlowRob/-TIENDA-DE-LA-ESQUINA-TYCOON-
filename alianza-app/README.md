# Alianza Tareas

App de seguimiento de la **Coordinación de Proyectos de Alianza Grupo Inmobiliario**, con los colores institucionales: azul #1A3867, dorado #95762F y blanco.

La app tiene cuatro pestañas: **Tareas · Comité · Proyectos · Correo**. Los agentes de IA están en pausa: su código se conserva, pero no aparecen en la app.

## Tareas
- Aquí van tus tareas generales; es la pantalla de inicio.
- La barra toma sola la fecha y la hora que escribas ("viernes a las 10 am").
- Cada tarea lleva una **categoría**: Presupuesto y contabilidad, Asambleas y consejo, Entregas y pólizas, Derechos de petición u Otros. La app la propone según el texto, y puedes cambiarla.
- Solo generan avisos. Se ven en lista o en tablero, y se pueden agregar a Google Calendar.

## Comité
- **A qué comité va cada tema:** si es General, al **Comité Alianza**; si es de un proyecto, al **Comité de ese proyecto**. Los comités no tienen fecha fija.
- **Semáforo:** Pendiente, En curso, Sin respuesta o Resuelto. Los temas que llevan 14 días sin avances se marcan.
- **Historial de avances con fecha.** Cada avance se puede escribir, dictar con el teclado, llevar adjuntos o tomarse de un correo de Gmail. También queda registrado el botón «Presentado hoy en comité».
- **Gmail:** los correos con la etiqueta **PENDIENTES COMITE** entran solos como temas, sin duplicarse. Se revisan al abrir Comité (como máximo una vez por hora), al actualizar el resumen del correo o con el botón «Traer de Gmail».
- **Exportar** la lista filtrada a **Excel**, **PDF** (con el encabezado de Alianza) o **texto** listo para pegar en un correo o en WhatsApp.

## Proyectos
- Cada proyecto tiene una ficha con 4 secciones (presupuesto, asambleas, entregas y pólizas, derechos de petición) más Otros.
- Cada sección tiene semáforo:
  - verde: al día;
  - amarillo: pendiente;
  - rojo: vencido o sin respuesta.
- En cada sección ves sus tareas y temas de comité, y puedes agregar tareas.
- «Ver correos del proyecto» busca en su carpeta de Gmail, y cualquier correo se puede convertir en tema de comité.

## Correo (Sofía)
- Resumen de los no leídos: derechos de petición con su vencimiento, citaciones y pendientes.
- Buscador para encontrar el asunto de un correo a partir de lo que recuerdes. Siempre en solo lectura.

## Versión publicada (claude.ai)
- Claude funciona con tu cuenta, sin clave de API.
- Gmail se lee con el conector de claude.ai, solo con herramientas de lectura.
- Las tareas, los entregables y el registro se sincronizan entre tus dispositivos.
- `python3 build-artifact.py` genera `dist/alianza-tareas.html`, que es lo que se publica.

## Versión instalada
Abre `index.html` desde un servidor (por ejemplo, `python3 -m http.server`). En Ajustes agregas las claves de Claude y, opcionalmente, la de OpenAI.
