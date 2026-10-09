---
title: Tus notas en Claude, Cursor y Codex
metaTitle: 'Servidor MCP para tus notas: FixNote en Claude, Cursor y Codex'
description: Conecta tus notas de FixNote a Claude Desktop, Cursor, Codex y otros clientes MCP. Tú decides qué pueden leer y cambiar, y cada cambio queda registrado.
eyebrow: MCP
intro: ¿Quieres que Claude o Cursor sepan qué decidiste sobre un proyecto sin contárselo cada vez? El servidor MCP integrado en FixNote deja que estas apps busquen y lean tus notas y, si lo permites, que las cambien.
card:
  title: Servidor MCP
  text: Claude, Cursor y Codex buscan y leen tus notas dentro de los límites que fijes.
problem: Las decisiones, los borradores y las listas están en tus notas, pero trabajas en Claude o en un editor de código. Acabas copiando notas al chat a mano y vigilando que no se cuele nada privado.
stepsTitle: Cómo conectarlo
steps:
  - title: Abre los ajustes
    text: En la app de escritorio, ve a Ajustes → IA → «Apps conectadas (MCP)».
  - title: Añade la app
    text: Pulsa «Añadir a Claude Desktop», «Añadir a Cursor» o «Añadir a Codex» y reinicia esa app. Para cualquier otro cliente, usa «Copiar ajustes».
  - title: Fija los límites
    text: Elige un nivel de acceso y, en «Notas visibles», marca las carpetas y notas que la app puede ver.
privacy: El servidor MCP funciona en tu ordenador y lee la base de datos local de FixNote; nuestro servidor no interviene. Lo que la app conectada lee va a su propio modelo, por ejemplo a Anthropic en el caso de Claude, según las condiciones de ese servicio, así que muéstrale solo las carpetas que necesita.
faq:
  - q: ¿Necesito Pro para conectar mis notas a Claude?
    a: No, el servidor MCP forma parte del plan gratuito. No necesita cuenta ni internet y funciona también en el modo «Solo en este dispositivo».
  - q: ¿Funciona MCP en el navegador?
    a: No, solo en la app de escritorio de FixNote para Windows y macOS. En la versión web, los ajustes de MCP indican «Disponible en la app de escritorio.»
  - q: ¿Puede Claude borrar mis notas?
    a: Solo con acceso «Completo». Con «Lectura y escritura» una app puede crear y cambiar notas, pero no eliminarlas. Todo lo eliminado se puede recuperar desde la actividad de la IA.
  - q: ¿Sirve con Claude Code u otro cliente MCP?
    a: Sí. Pulsa «Copiar ajustes» y pégalos donde el cliente guarda su lista de servidores MCP.
---

## Cómo conectar FixNote a Claude, Cursor o Codex

En la app de escritorio, abre Ajustes → IA → «Apps conectadas (MCP)». Los botones «Añadir a Claude Desktop», «Añadir a Cursor» y «Añadir a Codex» escriben la configuración en el archivo de esa app por ti; después hay que reiniciarla. En Mac, primero mueve FixNote a Aplicaciones y ábrelo desde ahí, o FixNote te lo pedirá.

Hay cuatro niveles de acceso. «Desactivado» lo bloquea todo. «Solo lectura» es el predeterminado: la app busca y lee notas, ve las recientes y la nota del día, y abre imágenes y archivos. «Lectura y escritura» añade crear y editar notas y carpetas, mover notas y adjuntar archivos, pero no eliminar. «Completo» permite también eliminar.

En «Notas visibles» puedes dejar «Todas las notas» o elegir «Carpetas y notas elegidas». Entonces la app solo ve las carpetas marcadas, con sus subcarpetas, y las notas sueltas que añadiste; para ella, lo demás no existe. Las notas nuevas que crea van solo a las carpetas elegidas. Una imagen o un archivo solo le llega si ve la nota que lo contiene.

Cada cambio hecho por MCP queda en «Actividad de la IA», en Ajustes → IA, y se puede deshacer desde ahí.

## Cuándo resulta útil

En Cursor puedes pedir «busca en mis notas qué decidimos sobre la API y tenlo en cuenta». En Claude Desktop puedes armar una lista de tareas con las notas de trabajo de la semana o, con permiso de escritura, añadir el resumen de una conversación a la [nota del día](/es/features/daily-notes/). Son las mismas herramientas de notas que usa el [asistente](/es/features/ask-your-notes/) de FixNote, así que, dentro del acceso que le des, una app puede hacer lo mismo que él.

## Cuándo conviene otra herramienta

Si el conocimiento está en un espacio de equipo, te sirve más el servidor MCP de Notion: con él, las apps trabajan con las páginas de tu espacio de Notion. Mira la [comparación entre FixNote y Notion](/es/vs/notion/). El servidor MCP de FixNote trabaja con las notas de un ordenador y solo en la app de escritorio. Para empezar, elige «Solo lectura» y dale a la app una sola carpeta de notas de trabajo.
