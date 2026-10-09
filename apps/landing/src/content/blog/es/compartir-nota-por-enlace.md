---
title: "Cómo compartir una nota por enlace sin que el servidor la lea: FixNote"
description: "Enlaces de solo lectura en FixNote: cómo crearlos y actualizarlos, por qué la clave va después del # y el servidor no ve el texto, y cómo dejar de compartir."
date: 2026-09-29
translationKey: share-links
faq:
  - q: "¿Quien recibe el enlace necesita una cuenta de FixNote?"
    a: "No. El enlace se abre en cualquier navegador, sin cuenta y sin instalar nada. Para crear enlaces hace falta FixNote Pro."
  - q: "¿Puede el servidor de FixNote leer una nota compartida por enlace?"
    a: "No. La copia está cifrada con una clave que va en la parte del enlace después del #, y el navegador nunca envía esa parte al servidor. El servidor solo guarda texto cifrado."
  - q: "Si edito la nota, ¿el enlace muestra el texto nuevo?"
    a: "El enlace muestra una copia del momento en que lo creaste. Después de editar, pulsa Actualizar en la ventana Compartir y el mismo enlace mostrará el texto nuevo."
  - q: "¿Cómo dejo de compartir una nota?"
    a: "Pulsa Dejar de compartir en la ventana Compartir. El servidor borra la copia y el enlace deja de funcionar. Todos tus enlaces están en Ajustes → Cuenta y sincronización → Enlaces compartidos."
---

¿Cómo le mandas una nota a alguien que no usa tu app de notas sin dejar el texto a la vista en el servidor de nadie? FixNote tiene enlaces de solo lectura para eso. Aquí verás cómo crear y actualizar uno, dónde vive la clave del texto y cómo desactivar el enlace.

## Cómo crear un enlace a una nota

Abre la nota, pulsa Compartir y, en Enlace de solo lectura, elige Crear enlace. FixNote cifra una copia de la nota, la guarda en el servidor y copia el enlace al portapapeles al momento. Pégalo en cualquier chat o correo.

Los enlaces forman parte de Pro, así que necesitas haber iniciado sesión. Quien lo recibe no necesita nada: la página se abre en cualquier navegador, en el ordenador o en el móvil.

## Qué ve quien abre el enlace

La página muestra el texto de la nota con sus imágenes y la fecha en que se compartió. No abre tu cuenta ni la del lector, y no toca sus notas aunque use FixNote. Abajo hay una línea que dice que la nota se compartió desde FixNote con cifrado de extremo a extremo.

Las imágenes se incluyen mientras entre todas no pasen de tres megabytes. Si alguna no cabe, la página dice cuántas quedaron fuera.

## Cómo actualizar el enlace después de editar

El enlace muestra una copia de la nota tal como estaba cuando lo creaste. Si luego cambias el texto, la ventana Compartir dice «La nota cambió desde entonces». Pulsa Actualizar y el mismo enlace mostrará la copia nueva. No hace falta volver a enviarlo.

## Por qué el servidor no puede leer la nota

Un enlace tiene este aspecto: `app.fixnote.space/?s=<id>#<clave>`. La parte después de `#` se llama fragmento. Los navegadores nunca envían el fragmento al servidor en ninguna petición; así funciona la web. La copia está cifrada con la clave del fragmento, de modo que lo que guarda el servidor es texto cifrado que no podemos abrir. El descifrado ocurre en el navegador de quien lee.

De aquí salen dos consecuencias. Cualquiera con el enlace completo puede leer la copia, así que trátalo como la llave de una puerta. Y si se pierde la parte después de `#`, por ejemplo porque una app de mensajería cortó el enlace, la página dirá «Este enlace está incompleto». La clave no se puede recuperar, así que copia el enlace de nuevo. Cómo se cifran el resto de tus notas lo explica el artículo sobre el [cifrado de extremo a extremo en FixNote](/es/blog/notas-cifrado-de-extremo-a-extremo/).

## Cómo dejar de compartir

En la misma ventana Compartir, pulsa Dejar de compartir. El servidor borra la copia, y el enlace pasa a mostrar «Este enlace ya no funciona». Si más adelante vuelves a crear un enlace para esa nota, tendrá otra dirección; el anterior sigue cerrado.

Todos tus enlaces están en Ajustes → Cuenta y sincronización → Enlaces compartidos. Desde ahí puedes copiar o desactivar cualquiera, también los de notas que ya borraste.

## ¿Enlace o nota compartida?

Un enlace sirve cuando alguien sin FixNote solo necesita ver el texto: una receta, una lista para el viaje, el plan de una reunión. El lector no puede cambiar nada. Si queréis editar juntos, invita a esa persona por correo a una [nota compartida](/es/features/shared-notes/): tiene edición en directo y dos roles, Puede editar y Puede ver, aunque todos necesitan una cuenta de FixNote. Todo sobre los enlaces está en la [página de enlaces para compartir](/es/features/share-links/).

Elige la nota que más a menudo pegas como texto en los chats, crea un enlace para ella y, la próxima vez que la edites, pulsa Actualizar.
