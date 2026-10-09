---
title: 'Transcripción y resumen de llamadas en tu ordenador con FixNote'
description: 'Graba una llamada de Zoom, Meet o Telegram y obtén una nota con resumen, decisiones y tareas. La transcripción se hace en tu ordenador y no se guarda audio.'
date: 2026-10-09
translationKey: call-notes
faq:
  - q: '¿FixNote guarda una grabación de la llamada?'
    a: 'No. El sonido solo está en memoria mientras se transcribe. La nota guarda el resumen y la transcripción en texto.'
  - q: '¿Puedo grabar una llamada desde el navegador?'
    a: 'No. «Resumen de llamada» solo está en la app de escritorio, en Windows y en macOS 14.2 o posterior. La app toma la voz de los demás del sonido del sistema, y eso solo puede hacerlo un programa instalado en el ordenador.'
  - q: '¿Puedo obtener el resumen de una llamada sin internet?'
    a: 'Sí, si eliges Ollama en Ajustes → IA. Entonces la transcripción y el resumen se hacen en tu ordenador.'
  - q: '¿Necesito un dispositivo de audio virtual para grabar a los demás?'
    a: 'No. En Windows FixNote lee el sonido del ordenador con WASAPI loopback y en Mac con un Core Audio tap del sistema, sin drivers ni apps adicionales.'
---

¿Cómo grabar una llamada para después abrir una nota breve con lo acordado, sin volver a escuchar la conversación entera? Aquí verás cómo lo hace FixNote: dónde se empieza a grabar, qué oye la app, qué queda en la nota y qué pasa con el sonido.

## Dónde se empieza a grabar una llamada

La función está en la app de escritorio, en Windows y en macOS 14.2 o posterior. Junto al botón «Nota de voz» hay una flecha; en su menú elige «Resumen de llamada». También puedes empezar y terminar desde el icono de la bandeja en Windows o de la barra de menús en Mac («Grabar una llamada» y «Terminar la llamada»), así que no necesitas tener la ventana de FixNote a la vista durante la llamada.

Al empezar, la app te recuerda que avises a los demás. Es una cuestión de cortesía y en algunos países lo exige la ley. En Mac, la primera vez el sistema pide permiso para grabar su sonido; concédelo.

Si no quieres guardar la llamada, pulsa «Descartar» y la grabación y su transcripción desaparecen. Si intentas salir de FixNote mientras se graba una llamada, la app te pregunta antes, porque al salir la llamada no se guardaría.

## Qué oye FixNote durante la llamada

La app escucha dos fuentes. Tu micrófono aparece en la transcripción como «Yo». El sonido del ordenador, es decir, las voces de los demás en Zoom, Google Meet, Telegram o cualquier otra app, aparece como «Otros». En Windows el sonido del ordenador llega por WASAPI loopback y en Mac por un Core Audio tap del sistema. No hay que instalar drivers ni dispositivos de audio virtuales.

Lo mejor es usar auriculares. Sin ellos, el micrófono capta los altavoces y las palabras de los demás quedan grabadas dos veces. FixNote descarta esos ecos por su cuenta, pero con auriculares ni siquiera aparecen. Si el sonido del ordenador se corta en mitad de la llamada, la app te avisa y el micrófono sigue grabando.

## La transcripción se hace durante la llamada

La voz se corta en las pausas y cada fragmento se transcribe en tu ordenador en ese momento, mientras la llamada sigue. Es el mismo modelo Whisper del dictado, y puedes cambiarlo en Ajustes → Avanzado. Cuando pulsas «Terminar» solo quedan los últimos fragmentos, así que la espera es corta. La página de [notas de voz](/es/features/voice-notes/) explica el reconocimiento de voz con más detalle.

FixNote nunca guarda un archivo de audio. El sonido se mantiene en memoria mientras se transcribe y después solo queda el texto.

## Qué queda en la nota

Cuando la transcripción está lista, un modelo de lenguaje resume la llamada a partir del texto, en el idioma en que se habló. La nota puede tener tres secciones:

- «Resumen» cuenta en unas pocas frases de qué trató la llamada y cómo terminó.
- «Decisiones» recoge lo que se acordó.
- «Tareas» recoge lo que alguien se comprometió a hacer, cada una como casilla. Cuando está claro quién se encarga, la tarea empieza por su nombre, por ejemplo «Yo: enviar el borrador el viernes».

Una sección solo aparece si la llamada tuvo algo para ella. El modelo tiene instrucciones de escribir solo lo que se dijo, sin consejos ni suposiciones, así que no verás títulos vacíos. Una llamada larga se resume por partes que luego se unen en un solo resumen.

Debajo está la transcripción completa, plegada en un bloque «Transcripción». Ábrela cuando necesites las palabras exactas.

## Qué modelo escribe el resumen y qué recibe

El sonido se queda en tu ordenador. El modelo solo recibe el texto de la transcripción. El modelo lo eliges en Ajustes → IA: FixNote AI (con Pro), tu propia clave de cualquier proveedor compatible con OpenAI u Ollama en el mismo ordenador. Con Ollama toda la conversación se queda contigo. Las diferencias están en [qué modelo de IA elegir](/es/blog/que-modelo-de-ia-elegir-para-el-asistente/).

Si no hay ningún modelo disponible, FixNote guarda solo la transcripción y explica por qué. La transcripción nunca se pierde.

## Cómo encontrar la llamada después

La nota se llama «Llamada · fecha · duración», y la búsqueda normal la encuentra por cualquier palabra de la transcripción. Puedes preguntar al asistente algo como «¿qué decidimos con Óscar sobre las fechas de la beta?» y te responde con un enlace a esa llamada. El resto de detalles está en la página de [resúmenes de llamadas](/es/features/call-summaries/).

Pruébalo en tu próxima llamada corta: ponte auriculares, elige «Resumen de llamada» en el menú junto a «Nota de voz» y, al terminar, marca lo hecho en la sección «Tareas».
