---
title: "FixNote o Obsidian: cuál elegir para tus notas"
metaTitle: "Alternativa a Obsidian con asistente de IA integrado: FixNote"
description: "Obsidian o FixNote: IA sin plugins, sincronización cifrada de extremo a extremo, versión web y precio. En qué gana cada app y cómo traer tu bóveda a FixNote."
intro: "Obsidian guarda las notas como archivos Markdown y crece con los plugins de su comunidad. FixNote también escribe en Markdown, pero su asistente, el dictado y la sincronización funcionan nada más instalarlo, sin configurar nada. Aquí tienes las diferencias, también donde Obsidian es mejor opción."
steps:
  - title: "Decide cuánto quieres configurar"
    text: "Si disfrutas montando tu herramienta con plugins, temas y scripts, Obsidian te da más margen. Si quieres que todo funcione desde el primer momento, FixNote encaja mejor."
  - title: "Mira dónde escribes"
    text: "Obsidian tiene apps para Linux, iPhone y Android, pero no versión web. FixNote funciona en Windows, macOS y el navegador, también en el móvil."
  - title: "Suma sincronización e IA"
    text: "Obsidian Sync cuesta $4 al mes con pago anual o $5 al mes, y la IA llega con plugins de la comunidad. FixNote Pro por $7 incluye sincronización y FixNote AI, y tu propia clave de modelo funciona en el plan gratis."
  - title: "Abre tu bóveda en FixNote"
    text: "La importación de FixNote lee la carpeta entera de la bóveda y mantiene su estructura. Suele bastar una semana para saber si echas de menos tus plugins."
why:
  - "El asistente viene integrado: busca por significado, responde con enlaces a tus notas y las edita, mostrando cada cambio como una edición."
  - "Tu propia clave de modelo u Ollama se conectan desde Ajustes, sin plugins de terceros, y funcionan en el plan gratis."
  - "El dictado y los resúmenes de llamadas se transcriben en tu ordenador, y el bot de Telegram convierte los mensajes reenviados en notas."
  - "FixNote se abre en el navegador de cualquier ordenador o móvil, y Obsidian no tiene versión web."
  - "El servidor MCP integrado muestra a Claude y Cursor solo las carpetas que elijas, y cada cambio que hacen queda en un registro."
still:
  - "Obsidian tiene un catálogo grande de plugins y temas, y FixNote no se puede ampliar con plugins."
  - "Obsidian funciona en Linux y tiene apps nativas para iPhone y Android; FixNote no tiene app para Linux ni para móviles."
  - "Si dependes de los enlaces entre notas, los backlinks y la vista de grafo, FixNote no los tiene."
verdict: "Obsidian conviene a quien quiere montar su propio sistema con plugins y tener los archivos a mano. FixNote conviene a quien quiere asistente, dictado y sincronización cifrada de extremo a extremo sin configurar nada. Las dos guardan las notas en Markdown, así que no te quedas atrapado en ninguna."
faq:
  - q: "¿Puedo importar mis notas de Obsidian?"
    a: "Sí. En Ajustes → Datos → «Importar notas», pulsa «Elegir carpeta» y elige tu bóveda. Las carpetas se mantienen, las imágenes pasan a ser adjuntos y las etiquetas del front matter se añaden al texto de la nota."
  - q: "¿Obsidian tiene IA integrada?"
    a: "No. La IA en Obsidian llega con plugins de la comunidad. FixNote tiene un asistente integrado que funciona con FixNote AI, tu propia clave u Ollama."
  - q: "¿Obsidian Sync cifra de extremo a extremo?"
    a: "Sí, Obsidian Sync usa cifrado de extremo a extremo AES-256. Protege lo que va a los servidores de Obsidian; en tu disco las notas siguen siendo archivos Markdown normales."
  - q: "¿Hay versión web de Obsidian?"
    a: "No. Obsidian tiene apps para Windows, macOS, Linux, iPhone y Android, y para el navegador solo la extensión Web Clipper. FixNote también funciona en el navegador."
  - q: "¿Se conservan los enlaces [[entre notas]] al cambiar?"
    a: "Se conserva su texto, pero en FixNote no se puede seguir el enlace, porque no tiene enlaces entre notas ni backlinks. Las imágenes insertadas con ![[...]] sí se importan."
---

## IA sin plugins

Obsidian no trae IA integrada. La añaden los plugins de la comunidad, que son muchos y cada uno con su enfoque, pero elegirlos, configurarlos y mantenerlos al día te toca a ti.

El [asistente](/es/features/ask-your-notes/) de FixNote funciona desde el principio. Busca por palabras y por significado en español, inglés y ruso, responde con enlaces a tus notas, escribe notas nuevas y las mueve entre carpetas. Borrar, o cambiar muchas notas a la vez, siempre pide confirmación, y cualquier cambio se puede deshacer desde el registro en Ajustes → IA. Tú eliges el modelo: FixNote AI con Pro, tu propia clave u Ollama en tu ordenador.

El [servidor MCP](/es/features/mcp/) también viene integrado y es gratis. Claude Desktop, Claude Code o Cursor ven solo las carpetas que permitas. Obsidian no tiene servidor MCP oficial, solo los de terceros.

## Sincronización y cifrado

Obsidian Sync cifra las notas de extremo a extremo con AES-256 y cuesta $4 al mes con pago anual o $5 al mes. Es un buen servicio, y pagas solo por la sincronización.

En FixNote el cifrado de extremo a extremo está siempre activo: cada nota se cifra en tu dispositivo con claves que salen de una frase de 12 palabras. La sincronización va incluida en Pro por $7 al mes, junto con FixNote AI, las [notas compartidas](/es/features/shared-notes/) y el bot de Telegram. La página de [cifrado](/es/features/encryption/) detalla qué ve el servidor.

## Plataformas

Obsidian funciona en Windows, macOS, Linux, iPhone y Android, y no tiene versión web. FixNote funciona en Windows, macOS y el navegador. En el móvil se abre como app web; no hay apps nativas para iPhone ni Android. Si escribes en Linux o quieres una app de la App Store, Obsidian te encaja mejor.

También cambia cómo se guardan las notas. Una bóveda de Obsidian es una carpeta normal que puedes sincronizar con cualquier nube. FixNote guarda las notas en su propia base de datos en el dispositivo y las exporta a Markdown con «Exportar notas» en Ajustes → Datos.

## Cómo traer tu bóveda de Obsidian

1. En FixNote, abre Ajustes → Datos → «Importar notas» y pulsa «Elegir carpeta».
2. Elige la carpeta de tu bóveda. FixNote te muestra cuántas notas, carpetas e imágenes encontró.
3. Pulsa «Importar». La estructura de carpetas se mantiene, y las imágenes de `![[...]]` y de los enlaces normales pasan a ser adjuntos.

Las etiquetas del front matter se añaden al texto como líneas con `#` para que la búsqueda las encuentre. Los enlaces como `[[nota]]` se quedan como texto. Los archivos que no son notas se omiten y se cuentan. La importación no toca tu bóveda, así que puedes usar las dos apps a la vez durante un tiempo. Más en la página de [importar y exportar](/es/features/import-export/).
