# Alianza Tareas

App de seguimiento de la **Coordinación de Proyectos de Alianza Grupo Inmobiliario**, con los colores institucionales: azul #1A3867, dorado #95762F y blanco.

La app tiene cuatro pestañas: **Tareas · Comité · Proyectos · Correo**. Los agentes de IA están en pausa: su código se conserva, pero no aparecen en la app.

## Tareas
- Es la pantalla de inicio. Arriba eliges qué vas a registrar:
  - **✓ Tarea:** una tarea general, con fecha, hora, aviso, categoría y prioridad. La app toma sola la fecha y la hora que escribas ("viernes a las 10 am").
  - **🏗️ Comité constructora:** un tema para el comité con la constructora de un proyecto. Hay que elegir el proyecto.
  - **🤝 Comité Alianza:** un tema para el comité interno de Alianza, general o de un proyecto.
- Una franja muestra cuántos temas de comité están abiertos y lleva a la pestaña Comité.
- Si una fecha queda mal escrita (por ejemplo, con el año 32026), la tarea se marca en rojo para corregirla, en lugar de dañar la lista. Además, los campos de fecha solo aceptan años entre 2020 y 2099.

## Comité
- **Semáforo:** Pendiente, En curso, Sin respuesta o Resuelto. Los temas que llevan 14 días sin avances se marcan.
- **Historial de avances con fecha.** Cada avance se puede escribir, dictar con el teclado, llevar adjuntos o tomarse de un correo de Gmail. También queda registrado el botón «Presentado hoy en comité».
- Cada tema indica a qué comité va (constructora o Alianza), y se puede cambiar en su detalle.
- **Gmail:** los correos con la etiqueta **PENDIENTES COMITE** entran solos como temas, sin duplicarse.
- **Exportar** a Excel, PDF o texto.

## Proyectos
Al abrir un proyecto ves:
- una franja con el semáforo de sus 4 actividades (presupuesto, asambleas, entregas y pólizas, derechos de petición);
- tres columnas, cada una con su campo para agregar: **Mis tareas de seguimiento**, **Comité con constructora** y **Comité Alianza**;
- el botón «Ver correos del proyecto».

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
