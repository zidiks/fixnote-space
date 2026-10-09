---
title: 'App de notas sin internet y sin cuenta: FixNote sin conexión'
description: 'Qué hace FixNote sin conexión y sin registrarte, qué desactiva el modo «Solo en este dispositivo» y cómo conectar el asistente a un modelo local con Ollama.'
date: 2026-09-27
translationKey: offline
faq:
  - q: '¿Puedo usar FixNote sin registrarme?'
    a: 'Sí. El plan Free funciona sin cuenta y sin límite de tiempo: notas, carpetas, búsqueda, dictado y texto de imágenes se quedan en tu dispositivo.'
  - q: '¿FixNote funciona sin internet?'
    a: 'Las apps para Windows y macOS funcionan del todo sin conexión. Necesitas internet una vez para descargar los modelos de búsqueda por significado, reconocimiento de voz y texto de imágenes.'
  - q: '¿Qué desactiva el modo «Solo en este dispositivo»?'
    a: 'La sincronización, el bot de Telegram, compartir notas, los enlaces a notas y FixNote AI. En este modo el asistente funciona solo con Ollama.'
  - q: '¿Puedo usar la IA de FixNote sin internet?'
    a: 'Sí, con Ollama en la app de escritorio. El modelo funciona en tu ordenador y tus preguntas al asistente no salen de él.'
---

¿Se pueden tomar notas en FixNote sin registrarte y sin mandar nada a la nube? Sí. La app funciona sin cuenta y sin conexión, y el modo «Solo en este dispositivo» mantiene tus notas fuera de nuestro servidor aunque hayas iniciado sesión. Aquí verás qué funciona, qué no y cómo conectar el asistente a un modelo en tu propio ordenador.

## FixNote sin cuenta

Instala la app y empieza a escribir; no hay que registrarse. En tu dispositivo tienes notas y carpetas, la nota del día y las tareas repetidas, listas de tareas y tablas, imágenes y archivos, búsqueda por palabras y por significado, dictado, texto de imágenes, e importación y exportación en Markdown. Eso es el plan Free, y no caduca.

La búsqueda por significado, el reconocimiento de voz y el texto de imágenes usan modelos que se descargan una vez, la primera vez que los usas. Después ya no necesitan internet. En Ajustes → Avanzado → «Modelos en este dispositivo» aparecen con su tamaño y botones para descargar o eliminar cada uno.

Las apps para Windows y macOS funcionan del todo sin conexión. La versión web también guarda tus notas en el navegador de tu dispositivo, pero necesitas conexión para abrirla.

## Si se corta la conexión

Si has iniciado sesión y te quedas sin conexión, no se detiene nada. Los cambios se acumulan en el dispositivo y, en Pro, la sincronización los envía cuando vuelve la red. Mientras tanto, el estado de sincronización dice «Sin conexión. Los cambios se sincronizarán al volver». Si alguien cambió las mismas líneas en otro dispositivo mientras tanto, FixNote se queda con la versión del servidor, guarda tu cambio como copia y te ofrece compararlas.

## El modo «Solo en este dispositivo»

Este modo está en la app de escritorio, en Ajustes → IA, debajo de la elección de modelo. Mientras está activo, tus notas no van a nuestro servidor:

- La sincronización no envía ni descarga nada, aunque hayas iniciado sesión.
- El bot de Telegram se desactiva, y no puedes compartir una nota ni crear un enlace a ella.
- FixNote AI y tu propia clave de API dejan de estar disponibles, así que el asistente funciona solo con Ollama.

Todo lo demás funciona como siempre, y la barra lateral muestra «Solo en este dispositivo» donde estaría el estado de sincronización. El servidor MCP para Claude, Cursor y Codex también sigue funcionando, porque lee la base de datos local; lo contamos en [Servidor MCP para tus notas](/es/blog/servidor-mcp-para-notas/).

## El asistente con Ollama

Ollama ejecuta modelos de lenguaje en tu propio ordenador. Instálalo, descarga un modelo con un comando como `ollama pull llama3.1` y elige Ollama en Ajustes → IA → «Modelo». FixNote encuentra solo los modelos instalados, y el botón «Comprobar» te dice si el elegido responde.

Ollama funciona en la app de escritorio. La calidad de las respuestas depende del modelo y de tu equipo: los modelos pequeños contestan más rápido, pero fallan más con preguntas largas. Las opciones del asistente están en la [página del asistente](/es/features/ask-your-notes/).

## A qué más se conecta la app

Aparte de nuestro servidor, la app se conecta a unas pocas direcciones de internet:

- La app de escritorio busca actualizaciones en fixnote.space y descarga los archivos de la actualización desde GitHub. Puedes desactivarlo con «Buscar actualizaciones automáticamente» en Ajustes → General; la versión de Microsoft Store se actualiza a través de la Store.
- Los modelos de búsqueda por significado y de reconocimiento de voz se descargan de Hugging Face, y los datos de idioma para el texto de imágenes, de jsDelivr.
- Cuando pegas un enlace, la app de escritorio descarga su tarjeta de vista previa directamente del sitio enlazado.

## Para quién es el modo local

El modo local encaja con notas de trabajo bajo un acuerdo de confidencialidad, con un ordenador que a menudo está sin conexión y con quien no quiere sus notas en la nube, ni siquiera cifradas. Si más adelante necesitas sincronizar, desactiva el modo e inicia sesión: tus notas se quedan donde están y empiezan a sincronizarse. La [página de uso sin conexión](/es/features/offline/) tiene los detalles.

Para probarlo todo de una vez, instala Ollama, activa «Solo en este dispositivo», apaga el wifi y hazle al asistente una pregunta sobre tus notas.
