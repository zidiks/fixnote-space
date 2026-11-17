---
title: 'Servidor MCP para tus notas: Claude, ChatGPT, Cursor y Codex'
metaTitle: 'Servidor MCP para notas: Claude, ChatGPT, Cursor y Codex | Fixnote'
description: Conecta tus notas de Fixnote a Claude, ChatGPT, Cursor, Codex y otros clientes MCP. Tú decides qué pueden leer y cambiar, y cada cambio queda registrado.
eyebrow: MCP
intro: ¿Quieres que Claude, ChatGPT o Cursor sepan qué decidiste sobre un proyecto sin contárselo cada vez? El servidor MCP integrado en Fixnote deja que estas apps busquen y lean tus notas y, si lo permites, que las cambien.
card:
  title: Servidor MCP
  text: Claude, ChatGPT, Cursor y Codex buscan y leen tus notas dentro de los límites que fijes.
problem: Las decisiones, los borradores y las listas están en tus notas, pero trabajas en Claude o en un editor de código. Acabas copiando notas al chat a mano y vigilando que no se cuele nada privado.
stepsTitle: Cómo conectarlo
steps:
  - title: Abre los ajustes
    text: En la app de escritorio, ve a Ajustes → IA → «Apps conectadas (MCP)».
  - title: Añade la app
    text: Pulsa «Añadir a Claude Desktop», «Añadir a Cursor» o «Añadir a Codex» y reinicia esa app. Para cualquier otro cliente, usa «Copiar ajustes».
  - title: Fija los límites
    text: Elige un nivel de acceso y, en «Notas visibles», marca las carpetas y notas que la app puede ver.
privacy: El servidor MCP para Claude Desktop, Cursor y Codex funciona en tu ordenador y lee la base de datos local de Fixnote; nuestro servidor no interviene. claude.ai y ChatGPT llegan a tus notas a través de nuestro servidor mcp.fixnote.space, que pasa cada petición a tu propio dispositivo y no guarda nada. Las notas tienen cifrado de extremo a extremo y solo tu dispositivo puede leerlas. Lo que la app conectada lee va a su propio modelo, por ejemplo a Anthropic en el caso de Claude, según las condiciones de ese servicio, así que muéstrale solo las carpetas que necesita.
faq:
  - q: ¿Necesito Pro para conectar mis notas a Claude?
    a: Para Claude Desktop, Cursor y Codex en tu ordenador, no. El servidor MCP local forma parte del plan gratuito, no necesita cuenta ni internet y funciona también en el modo «Solo en este dispositivo». claude.ai, ChatGPT y otras apps de IA en la web se conectan con el acceso remoto, que forma parte de Pro.
  - q: ¿Funciona MCP en el navegador?
    a: El servidor MCP local solo está en la app de escritorio para Windows y macOS. El acceso remoto para claude.ai y ChatGPT funciona también desde la versión web; deja app.fixnote.space abierta con el acceso remoto activado.
  - q: ¿Puede Claude borrar mis notas?
    a: Solo con acceso «Completo». Con «Lectura y escritura» una app puede crear y cambiar notas, pero no eliminarlas. Todo lo eliminado se puede recuperar desde la actividad de la IA.
  - q: ¿Sirve con Claude Code u otro cliente MCP?
    a: Sí. Pulsa «Copiar ajustes» y pégalos donde el cliente guarda su lista de servidores MCP.
---

## Cómo conectar Fixnote a Claude, Cursor o Codex

En la app de escritorio, abre Ajustes → IA → «Apps conectadas (MCP)». Los botones «Añadir a Claude Desktop», «Añadir a Cursor» y «Añadir a Codex» escriben la configuración en el archivo de esa app por ti; después hay que reiniciarla. En Mac, primero mueve Fixnote a Aplicaciones y ábrelo desde ahí, o Fixnote te lo pedirá.

Hay cuatro niveles de acceso. «Desactivado» lo bloquea todo. «Solo lectura» es el predeterminado: la app busca y lee notas, ve las recientes y la nota del día, y abre imágenes y archivos. «Lectura y escritura» añade crear y editar notas y carpetas, mover notas y adjuntar archivos, pero no eliminar. «Completo» permite también eliminar.

En «Notas visibles» puedes dejar «Todas las notas» o elegir «Carpetas y notas elegidas». Entonces la app solo ve las carpetas marcadas, con sus subcarpetas, y las notas sueltas que añadiste; para ella, lo demás no existe. Las notas nuevas que crea van solo a las carpetas elegidas. Una imagen o un archivo solo le llega si ve la nota que lo contiene.

Cada cambio hecho por MCP queda en «Actividad de la IA», en Ajustes → IA, y se puede deshacer desde ahí.

## Cómo conectar Fixnote a claude.ai o ChatGPT

claude.ai, ChatGPT y otras apps de IA en la web se conectan a Fixnote por internet, desde cualquier dispositivo. La dirección del servidor es `https://mcp.fixnote.space/mcp`.

1. En Fixnote (la app de escritorio o app.fixnote.space), abre Ajustes → Integraciones → «Acceso remoto (ChatGPT, Claude…)» y actívalo. El acceso remoto forma parte de Pro.
2. En claude.ai, abre Settings → Connectors → «Add custom connector» y pega la dirección. En ChatGPT, añade en sus ajustes un conector personalizado (app) con la misma dirección.
3. Entra con tu cuenta de Fixnote y permite la conexión. Antes de permitirla, Fixnote muestra qué podrá hacer la app y qué no.

Tus notas tienen cifrado de extremo a extremo, así que nuestro servidor no puede leerlas. Cada petición va a uno de tus dispositivos donde Fixnote está abierto con el acceso remoto activado; ese dispositivo lee las notas y responde. Mientras no haya ninguno abierto, la app de IA recibe un aviso en lugar de notas.

Una app conectada así puede buscar y leer notas y, si «Apps conectadas (MCP)» permite escribir, crear y cambiar notas y crear carpetas. Nunca elimina ni renombra nada. «Notas visibles» también se le aplica, cada cambio aparece en la actividad de la IA y se puede deshacer, y en el acceso remoto ves las apps conectadas y puedes revocar cualquiera.

## Cuándo resulta útil

En Cursor puedes pedir «busca en mis notas qué decidimos sobre la API y tenlo en cuenta». En Claude Desktop puedes armar una lista de tareas con las notas de trabajo de la semana o, con permiso de escritura, añadir el resumen de una conversación a la [nota del día](/es/features/daily-notes/). Son las mismas herramientas de notas que usa el [asistente](/es/features/ask-your-notes/) de Fixnote, así que, dentro del acceso que le des, una app puede hacer lo mismo que él.

## Cuándo conviene otra herramienta

Si el conocimiento está en un espacio de equipo, te sirve más el servidor MCP de Notion: con él, las apps trabajan con las páginas de tu espacio de Notion. Mira la [comparación entre Fixnote y Notion](/es/vs/notion/). El servidor MCP local de Fixnote trabaja con las notas de un ordenador; para claude.ai y ChatGPT usa el acceso remoto. Para empezar, elige «Solo lectura» y dale a la app una sola carpeta de notas de trabajo.
