---
title: Notas sin internet
metaTitle: 'Notas sin internet y sin cuenta: el modo sin conexión de FixNote'
description: FixNote funciona sin conexión y sin registro, y notas, búsqueda y dictado se quedan en tu dispositivo. El modo Solo en este dispositivo corta nuestro servidor.
eyebrow: Sin conexión
intro: ¿Se pueden tomar notas sin internet, sin cuenta y con una app que no hable nunca con nuestra nube? Sí. Las notas viven en tu dispositivo, y el modo Solo en este dispositivo apaga todo lo que llega al servidor de FixNote.
card:
  title: Sin conexión
  text: Notas, búsqueda y dictado funcionan en tu dispositivo sin red.
problem: Las apps de notas en la nube a menudo no abren en un avión o donde no hay cobertura, y muchas no funcionan sin cuenta. Las notas de trabajo bajo NDA a veces no deben tocar internet en absoluto.
stepsTitle: Cómo configurarlo
steps:
  - title: Instala la app
    text: Descarga FixNote para Windows o macOS y empieza a escribir. No hace falta cuenta.
  - title: Descarga los modelos antes
    text: En Ajustes → Avanzado → Modelos en este dispositivo, pulsa Descargar en la búsqueda por significado, el texto de imágenes y el reconocimiento de voz. Después ya no necesitan conexión.
  - title: Activa el modo
    text: En Ajustes → IA, marca Solo en este dispositivo. La sincronización, Telegram y FixNote AI se apagan.
  - title: Conecta Ollama
    text: Para que el asistente responda sin conexión, instala Ollama y elígelo en Ajustes → IA → Modelo.
privacy: En el modo Solo en este dispositivo la app no contacta con el servidor de FixNote, y las notas, los adjuntos y los ajustes se quedan en el ordenador. Los modelos del dispositivo se descargan una sola vez, y la app de escritorio sigue buscando actualizaciones.
faq:
  - q: ¿Necesito una cuenta para usar FixNote?
    a: No. Sin cuenta tienes notas y carpetas, búsqueda por palabras y por significado, dictado, texto de imágenes, la nota diaria, importación y exportación. Es el plan Free, sin límite de tiempo.
  - q: ¿Qué pasa con mis cambios si se corta la conexión?
    a: Se guardan en el dispositivo. Con Pro, el estado de sincronización dice «Sin conexión. Los cambios se sincronizarán al volver.», y se suben solos cuando vuelve la red.
  - q: ¿El asistente funciona sin internet?
    a: 'Sí, con Ollama: el modelo se ejecuta en tu ordenador. Ollama está disponible en la app de escritorio.'
  - q: ¿La app web funciona sin conexión?
    a: La app web guarda las notas en el navegador y sigue funcionando en una pestaña abierta si se corta la red. Sin conexión no puede volver a cargarse, así que para trabajar sin red instala la app de escritorio.
---

## Cómo activar Solo en este dispositivo

El modo está en la app de escritorio. Abre Ajustes → IA y marca Solo en este dispositivo, debajo de la elección de modelo. La app apaga la sincronización, el bot de Telegram, las notas compartidas y los enlaces, FixNote AI y tu propia clave de modelo, y el asistente pasa a usar Ollama. En la barra lateral, el estado de sincronización se cambia por «Solo en este dispositivo»; al pulsarlo se abren los ajustes de IA.

Para el asistente, instala Ollama y descarga un modelo, por ejemplo con `ollama pull llama3.1`. En Ajustes → IA → Modelo, elige Ollama: FixNote encuentra solo los modelos instalados, y el botón Comprobar te dice si el elegido responde.

Si tienes la sesión iniciada, sigue iniciada; simplemente no se envía ni se descarga nada. Desactiva el modo y tus cambios se suben en la siguiente sincronización.

## Cuándo resulta útil

En un avión o un tren puedes escribir, dictar y buscar por significado, porque la voz se reconoce en el dispositivo. Las notas bajo NDA y los datos de salud no salen del ordenador con Solo en este dispositivo activado. Los [resúmenes de llamadas](/es/features/call-summaries/) tampoco pasan por nuestro servidor: la llamada se transcribe en el dispositivo y, con Ollama, un modelo local escribe el resumen.

Las respuestas de un modelo local dependen de su tamaño y de tu ordenador: los modelos pequeños van más rápido, pero fallan más con preguntas largas. El modo también encaja en un ordenador que casi nunca está conectado. Si más adelante necesitas sincronizar, desactiva el modo e inicia sesión; tus notas siguen en su sitio.

## Cuándo conviene otra herramienta

Si necesitas tus notas sin conexión en el móvil, FixNote no es la mejor opción: en el móvil funciona como app web, que necesita conexión para cargarse. Obsidian y Joplin tienen apps para móvil que guardan las notas en el propio dispositivo. Mira la [comparación con Obsidian](/es/vs/obsidian/).
