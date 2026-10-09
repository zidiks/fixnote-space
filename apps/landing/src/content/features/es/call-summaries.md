---
title: Resumen de llamadas
metaTitle: 'Graba una llamada y obtén el resumen en tu ordenador: FixNote'
description: FixNote graba llamadas en Windows y Mac, las transcribe en tu ordenador y escribe un resumen con decisiones y tareas. No guarda ningún archivo de audio.
eyebrow: Llamadas
intro: ¿Cómo salir de una llamada de Zoom o Telegram con un resumen breve y no con una grabación que nunca volverás a escuchar? FixNote te escucha a ti y a los demás, transcribe en tu ordenador y guarda una nota con decisiones y tareas.
card:
  title: Resumen de llamadas
  text: La transcripción de la llamada y un resumen con tareas en una sola nota.
problem: Durante la llamada no hay tiempo para apuntar nada, y después los acuerdos se olvidan pronto. Nadie quiere volver a escuchar una hora de audio para encontrar una frase.
stepsTitle: Cómo funciona
steps:
  - title: Empieza a grabar
    text: Pulsa la flecha junto a «Nota de voz» y elige «Resumen de llamada». También puedes empezar desde el icono de la bandeja en Windows o de la barra de menús en Mac.
  - title: Habla con normalidad
    text: FixNote graba tu micrófono («Yo») y lo que suena en el ordenador («Otros»). La voz se transcribe en tu ordenador durante la llamada, por fragmentos entre pausas.
  - title: Pulsa «Terminar»
    text: Se transcribe el último fragmento y un modelo de lenguaje escribe las secciones «Resumen», «Decisiones» y «Tareas». Debajo queda la transcripción completa, plegada.
privacy: El sonido se reconoce en tu ordenador y no se guarda; tras la transcripción solo queda el texto. Para el resumen, el modelo que elijas recibe el texto de la transcripción. Con Ollama en el mismo ordenador, la conversación no sale de él.
faq:
  - q: ¿Puedo grabar una llamada en el navegador?
    a: No. El resumen de llamadas solo está en la app de escritorio, en Windows y en macOS 14.2 o posterior. La versión web no tiene esta opción.
  - q: ¿Necesito Pro para los resúmenes?
    a: No. La transcripción siempre se hace en tu dispositivo, y el resumen lo puede escribir un modelo con tu propia clave o con Ollama. Con Pro lo escribe FixNote AI sin configurar nada.
  - q: ¿Qué pasa si el modelo no está disponible?
    a: FixNote guarda la nota solo con la transcripción y te avisa de por qué falta el resumen.
  - q: ¿Entra un bot en la llamada o hay que instalar controladores?
    a: Ninguna de las dos cosas. FixNote toma el sonido del ordenador con las herramientas del sistema, WASAPI en Windows y Core Audio en Mac. A la llamada no se conecta nada.
  - q: ¿Hay un límite de duración?
    a: La grabación se detiene sola a las cuatro horas y la nota se guarda como siempre. Una transcripción larga se resume por partes que luego se combinan.
---

## Cómo grabar una llamada

Abre FixNote en el ordenador antes de que empiece la llamada. Junto al botón «Nota de voz» hay una flecha, «Otras formas de grabar»; en su menú elige «Resumen de llamada». No hace falta tener la ventana abierta: el icono de la bandeja en Windows y el de la barra de menús en Mac tienen «Grabar una llamada» y «Terminar la llamada».

Al empezar, FixNote te recuerda que avises a los demás. Usa auriculares si puedes. Sin ellos, el micrófono oye los altavoces y las palabras de los demás pueden quedar dos veces en la transcripción. FixNote descarta esos ecos por su cuenta, pero con auriculares casi no aparecen.

El modelo para los resúmenes se elige en Ajustes → IA: FixNote AI, tu propia clave u Ollama. La voz la reconoce el mismo modelo Whisper que las [notas de voz](/es/features/voice-notes/), y puedes cambiarlo en Ajustes → Avanzado. El resumen se escribe en el idioma en que fue la llamada.

## Cuándo es útil

Después de la reunión semanal del equipo, las tareas ya son casillas, y si en la llamada se dijo quién se encarga de qué, el nombre también aparece en la línea. Tras una llamada con un cliente o un proveedor, la sección «Decisiones» guarda lo acordado sobre plazos y precio, y la frase exacta está en la transcripción. Si no se decidió nada, la nota simplemente no tiene sección «Decisiones».

La nota se llama «Llamada · fecha · duración», y la [búsqueda](/es/features/search/) la encuentra por cualquier palabra de la transcripción. Un mes después puedes preguntar al asistente qué se decidió sobre la fecha de la beta, y te responde con un enlace a esa llamada.

## Cuándo conviene otra herramienta

FixNote solo graba llamadas en el ordenador. Para una reunión en persona con solo un iPhone a mano, es más práctico grabar en Notas de Apple: en los dispositivos compatibles obtiene transcripción y resumen con Apple Intelligence ([FixNote frente a Apple Notes](/es/vs/apple-notes/)). Un equipo que ya trabaja en Notion con el plan Business quizá prefiera AI Meeting Notes, que deja el resumen directamente en el espacio compartido. Y si necesitas conservar el audio, usa una grabadora aparte, porque FixNote no guarda el sonido.
