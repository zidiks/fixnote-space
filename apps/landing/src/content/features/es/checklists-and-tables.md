---
title: Listas de tareas y tablas
metaTitle: 'Listas de tareas y tablas en tus notas: checklists en FixNote'
description: Listas de tareas con subtareas y tablas dentro de una nota de FixNote. La tarjeta muestra cuántas tareas están hechas y todo se guarda como Markdown normal.
eyebrow: Listas
intro: ¿Dónde guardas la lista de la compra, el plan de una reforma o una comparación de precios sin abrir una aplicación distinta para cada cosa? Una nota de FixNote admite una lista de tareas con subtareas y una tabla, y todo sigue siendo Markdown normal.
card:
  title: Tareas y tablas
  text: Tareas con casillas y tablas dentro del texto de la nota.
problem: Las tareas viven en una aplicación, las notas en otra y las tablas en una tercera. La tarea «comprar azulejos» no sabe nada de las medidas que apuntaste en la nota de la reforma, y acabas saltando entre ventanas.
stepsTitle: Cómo funciona
steps:
  - title: Empieza una lista de tareas
    text: Escribe [ ] y un espacio al principio de una línea, pulsa Ctrl+Shift+9 (⌘⇧9 en Mac) o elige Lista de tareas en el menú de clic derecho.
  - title: Anida las tareas
    text: Enter añade la siguiente, Tab la mete un nivel hacia dentro y Shift+Tab la saca. Un clic marca la casilla.
  - title: Pega una tabla
    text: Copia una tabla en Markdown de la respuesta de un chatbot, de un README o de otro editor y pégala en la nota, y se convierte en tabla. Tab pasa de celda en celda y en la última añade una fila.
privacy: Las tareas y las tablas forman parte del texto de la nota en tu dispositivo, y no necesitas cuenta para usarlas. Con Pro se sincronizan con la nota, cifradas en el dispositivo.
faq:
  - q: ¿Cómo hago una lista de tareas en una nota?
    a: Escribe [ ] y un espacio al principio de una línea o pulsa Ctrl+Shift+9 (⌘⇧9 en Mac). Lista de tareas, en el menú de clic derecho, convierte en tareas las líneas seleccionadas.
  - q: ¿Cómo creo una tabla?
    a: Todavía no hay un botón para insertar tablas. La tabla aparece al pegar una tabla en Markdown o al importar notas que las tengan. También puedes pedirle al asistente que ponga una tabla en una nota nueva.
  - q: ¿Puedo ver cuántas tareas están hechas?
    a: Sí. Cada tarjeta de nota en la lista muestra las tareas hechas sobre el total, por ejemplo 3/5.
  - q: ¿Mis listas y tablas se abren en Obsidian y otros editores?
    a: Sí. Las tareas se guardan como `- [ ]` y `- [x]`, y las tablas como `| a | b |`. Exportar notas, en Ajustes → Datos, guarda un .zip con archivos Markdown.
---

## Cómo usar listas de tareas y tablas

Una nota vacía te lo recuerda: `- [ ]` para tareas. Una lista de tareas empieza con [ ] y un espacio al principio de la línea, y Ctrl+Shift+9 o Lista de tareas en el menú de clic derecho convierten en tareas las líneas que ya escribiste. Enter añade la siguiente tarea y Tab la anida. Así es fácil partir un trabajo grande en pasos: «Preparar el viaje» con «Documentos» y «Botiquín» debajo.

Las tablas salen de Markdown. Pega un texto como `| Qué | Precio |` con una línea `|---|---|` debajo y FixNote lo muestra como tabla. Las tablas de notas importadas desde Obsidian o Notion se abren igual. Tab pasa a la siguiente celda y, al final de la tabla, añade una fila nueva. Para quitar una tabla, selecciona todas sus celdas y pulsa Retroceso.

Si dictaste una lista de pendientes de corrido, pulsa Ctrl+Shift+E sin nada seleccionado y elige «Ordenar la nota». Todo lo que suene a tarea se convierte en una casilla. Para un fragmento seleccionado, Reformatear hace algo parecido. Cada [edición con IA](/es/features/ai-edits/) la ves antes de aplicarla y decides si la aceptas. Hace falta un modelo: FixNote AI, tu propia clave u Ollama.

## Cuándo resulta útil

En la lista de la compra o de la maleta vas marcando lo que ya tienes. En la nota de una reforma caben la lista de trabajos y una tabla con las medidas de cada habitación y el precio de los materiales. Una comparación de tarifas sacada de un chatbot entra como tabla, y debajo escribes tus conclusiones.

Las listas de tareas rinden más en la [nota del día](/es/features/daily-notes/). Las tareas sin terminar pasan al día siguiente con un clic y las recurrentes aparecen solas en los días que tocan. El contador de la tarjeta te dice cuánto falta sin abrir la nota.

## Cuándo conviene otra herramienta

Las tablas de FixNote son sencillas: no tienen fórmulas, ordenación ni celdas combinadas, y no se puede añadir una columna a una tabla con un botón. Para cálculos, usa Excel o Google Sheets. Para bases de datos con propiedades, filtros y vistas, Notion es más cómodo; mira la [comparación con Notion](/es/vs/notion/). Si tus tareas necesitan fechas límite con recordatorios y responsables, te conviene un gestor de tareas como Todoist.
