---
title: Compartir una nota con un enlace
metaTitle: 'Compartir una nota por enlace sin que el servidor la lea: FixNote'
description: Crea un enlace de solo lectura y envía una nota a quien quieras. La clave va en la parte del enlace tras #, así el servidor guarda una copia que no puede leer.
eyebrow: Enlaces
intro: ¿Cómo mandas una receta o la lista para un viaje a alguien que no usa FixNote? Crea un enlace de solo lectura. Se abre en cualquier navegador, y el servidor solo guarda una copia cifrada de la nota.
card:
  title: Enlaces de solo lectura
  text: Envía una nota con un enlace que el servidor no puede leer.
problem: El texto pegado en un chat pierde las imágenes y el formato, y cada cambio obliga a enviarlo otra vez. Las páginas públicas de otras apps también muestran tu texto a los servidores de esa app.
stepsTitle: Cómo funciona
steps:
  - title: Crea el enlace
    text: Abre una nota, pulsa Compartir y elige Crear enlace.
  - title: Envíalo
    text: Pulsa Copiar y manda el enlace a quien quieras. Quien lo abra no necesita cuenta ni app.
  - title: Actualízalo tras editar
    text: El enlace muestra una copia del momento en que lo creaste. Cuando la nota cambie, pulsa Actualizar y el mismo enlace abrirá la copia nueva.
  - title: Desactívalo
    text: Dejar de compartir borra la copia del servidor, y el enlace deja de funcionar.
privacy: La copia se cifra en tu dispositivo con una clave que solo está en la parte del enlace tras #. Los navegadores nunca envían esa parte al servidor, así que guardamos texto cifrado sin su clave. La página del enlace no abre tu cuenta ni la del lector.
faq:
  - q: ¿El lector necesita una cuenta de FixNote?
    a: No, el enlace se abre en cualquier navegador. Para crearlo, el dueño de la nota necesita Pro.
  - q: ¿El enlace cambia si edito la nota?
    a: Por sí solo no; muestra la copia del momento en que se creó. La ventana de Compartir dirá «La nota cambió desde entonces.» con un botón Actualizar, y la dirección del enlace no cambia.
  - q: ¿Y si una app de mensajería corta el enlace?
    a: Si se pierde la parte tras #, la página dice «Este enlace está incompleto». La clave no se puede recuperar de un enlace cortado, así que cópialo otra vez.
  - q: ¿Se incluyen las imágenes?
    a: Sí, junto con el texto, hasta 3 MB de imágenes en total. La página cuenta y avisa de las que no cupieron.
  - q: ¿Dónde veo todos mis enlaces?
    a: En Ajustes → Cuenta y sincronización → Enlaces compartidos. Desde ahí puedes desactivar cualquiera.
---

## Cómo crear un enlace y desactivarlo

Los enlaces forman parte de Pro y necesitas haber iniciado sesión. Abre la nota, pulsa Compartir arriba y, en Enlace de solo lectura, elige Crear enlace. Un enlace tiene esta forma: `app.fixnote.space/?s=<id>#<clave>`, y debajo verás la hora de la copia. La copia lleva el texto y hasta 3 MB de imágenes.

Si luego editas la nota, la misma ventana dirá «La nota cambió desde entonces.». Pulsa Actualizar, y quien tenga el enlace antiguo verá la versión nueva. Para desactivarlo, pulsa Dejar de compartir: el servidor borra la copia y el enlace muestra «Este enlace ya no funciona». Todos tus enlaces activos están en Ajustes → Cuenta y sincronización → Enlaces compartidos.

## Cuándo resulta útil

Un enlace va bien para mandar una receta a la familia, la lista de equipaje de un viaje en grupo, los apuntes de clase a los compañeros o las instrucciones para la canguro sobre dónde están las llaves y qué hay de cena. Lo mandas una vez y lo actualizas cuando cambie la nota. Quien lo abra verá la nota con sus imágenes y la fecha de publicación, y si también usa FixNote, la página no toca su cuenta ni sus notas.

Trata el enlace como la llave de casa: cualquiera que lo tenga puede leer la copia. La página de [cifrado](/es/features/encryption/) explica cómo funcionan las claves en FixNote.

## Cuándo conviene otra herramienta

Un enlace muestra una sola nota y solo para leer. Si la otra persona debe editar contigo, invítala a una [nota compartida](/es/features/shared-notes/); necesitará una cuenta de FixNote.

Si quieres un sitio público de muchas páginas, con tu propio dominio y buscador, encajan mejor Obsidian Publish o las páginas públicas de Notion. Mira la [comparación con Obsidian](/es/vs/obsidian/).
