---
title: 'Asistente de IA para notas: cómo FixNote busca, responde y edita'
description: 'Qué hace el asistente de FixNote con tus notas: cómo busca y cita fuentes, qué puede cambiar, cuándo pide permiso y cómo deshacer sus cambios.'
date: 2026-10-08
translationKey: assistant-agent
faq:
  - q: ¿Puede la IA borrar una nota sin preguntar?
    a: No. En cualquier modo, borrar una nota o una carpeta espera tu confirmación. Lo que haya borrado el asistente se puede recuperar en la actividad de la IA.
  - q: ¿Cómo deshago los cambios del asistente?
    a: Pulsa «Deshacer todo» bajo la respuesta. Un cambio suelto se puede deshacer más tarde en Ajustes → IA → «Actividad de la IA», siempre que la nota no se haya editado después.
  - q: ¿Necesito una suscripción para usar el asistente?
    a: FixNote AI forma parte de Pro. En el plan gratuito puedes conectar tu propia clave de un proveedor compatible con OpenAI, u Ollama en la app de escritorio.
  - q: ¿El modelo ve todas mis notas?
    a: No. La búsqueda se hace en tu dispositivo, y el modelo recibe tu pregunta, los fragmentos encontrados y las notas que el asistente lea mientras responde.
---

¿Se puede dejar entrar a una IA en tus notas sin miedo a que estropee algo? El asistente de FixNote responde a preguntas sobre lo que escribiste y cambia notas cuando se lo pides: crea una nota, amplía una lista, mueve una entrada a una carpeta. Aquí verás cómo busca, qué puede cambiar, cuándo pide permiso y cómo dejarlo todo como estaba.

## Cómo responde el asistente a una pregunta

Abre el chat con Ctrl+J (⌘J en Mac) y pregunta con tus palabras. También puedes dictar la pregunta: la grabación se queda en tu dispositivo y se transcribe allí.

Primero, FixNote busca fragmentos en tu dispositivo, por palabras y por significado, y añade traducciones y sinónimos a la consulta. Por eso una pregunta en español encuentra una nota escrita en inglés. El artículo sobre [buscar notas en tres idiomas](/es/blog/buscar-notas-en-tres-idiomas/) lo explica con detalle. Si los fragmentos no bastan, el asistente vuelve a buscar con otras palabras o lee una nota entera. Cada paso se ve en el chat: primero «Buscando…» con las palabras que busca y luego «Leyendo…» con el título de la nota.

La respuesta lleva fuentes numeradas. Pulsa un número para abrir la nota de donde sale el dato. Bajo la respuesta, FixNote indica cuánto se apoya en tus notas: «Basado en tus notas», «Parcialmente basado» o «No está en tus notas».

## Dónde busca

Encima del campo de texto está el selector «Dónde busca el asistente»: todas las notas, una carpeta, una nota o una selección dentro de ella. La opción «Seguir lo que abro» cambia el contexto a lo que tienes en pantalla. Con cada pregunta el asistente recibe la lista de tus carpetas, así que «busca en la carpeta Trabajo» no necesita aclaraciones.

## Qué puede cambiar el asistente

El asistente crea notas, les añade texto, edita y reescribe, mueve notas entre carpetas, crea y renombra carpetas y añade cosas a la nota diaria. También puede borrar notas y carpetas; al borrar una carpeta, sus notas se quedan.

Si el asistente cambia una nota que tienes abierta, el texto se escribe solo en el editor en un único paso, y Ctrl+Z (⌘Z) lo deja como estaba. En una nota compartida, el cambio entra en el documento en directo y los demás miembros ven «FixNote AI» con el nombre de quien lo pidió.

## Cuándo pide permiso

Cuánta libertad le das se decide en Ajustes → IA → «Modos de IA»:

- En el modo «Preguntar siempre» cada cambio espera tu «Permitir», y «Permitir todo» quita las preguntas hasta el final de esa respuesta.
- En el modo «Aceptar ediciones» las ediciones en la nota y las peticiones del chat se aplican al momento, mientras que «Poner orden» espera tu confirmación.
- En el modo «Automático» todo se aplica al momento, también «Poner orden».

En cualquier modo, borrar espera confirmación. Si una respuesta suma más de cinco cambios, el asistente pregunta una vez si debe seguir.

## Cómo deshacer los cambios

Cada respuesta que cambió algo lleva debajo una línea «Cambios: N». Púlsala para ver la lista, o pulsa «Deshacer todo» para revertir la respuesta entera de una vez.

Además, cada cambio hecho por IA queda en «Actividad de la IA», en Ajustes → IA. Desde ahí puedes deshacerlo más tarde, siempre que la nota no se haya editado después. El mismo registro guarda los cambios de las apps conectadas por [MCP](/es/features/mcp/): Claude Desktop, Cursor y otras usan las mismas herramientas que el asistente.

## Cuánto recuerda

El chat recuerda la conversación hasta que empiezas una nueva, así que puedes seguir con «ahora mueve eso a la carpeta Casa». El indicador «Memoria del chat» muestra cuánto espacio está ocupado. Cuando se llena, los mensajes antiguos se resumen. «Borrar conversación» elimina solo el historial del chat y deja tus notas como estaban.

## Qué modelo responde

FixNote AI forma parte de Pro y funciona sin configurar nada. Tiene dos niveles en Ajustes → IA → «Razonamiento»: «Estándar» para la mayoría de preguntas y «Profundo» para tareas grandes con muchas notas. «Profundo» tarda más y gasta el límite de IA unas cuatro veces más rápido.

En lugar de FixNote AI puedes conectar tu propia clave de cualquier proveedor compatible con OpenAI, u Ollama en la app de escritorio; las dos opciones funcionan también en el plan gratuito. El modelo tiene que admitir llamadas a herramientas; si no, el asistente solo podrá responder con los fragmentos que encontró.

## Por dónde empezar

Pregunta algo cuya respuesta ya sepas, como «¿cuándo fui al dentista por última vez?», y revisa las fuentes bajo la respuesta. Después, en el modo «Preguntar siempre», pide un cambio pequeño, permítelo y deshazlo con «Deshacer todo» para ver cómo funciona. En la página del [asistente](/es/features/ask-your-notes/) tienes más sobre lo que puede hacer.
