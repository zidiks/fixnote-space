---
title: 'Buscar notas en varios idiomas: cómo las encuentra FixNote'
description: 'Cómo encontrar una nota si no recuerdas en qué idioma la escribiste: búsqueda por palabras con transliteración, por significado en tu equipo y el asistente.'
date: 2026-09-22
updated: 2026-10-09
translationKey: search
faq:
  - q: ¿La búsqueda encuentra una palabra en alfabeto latino si la escribo en cirílico?
    a: Sí. FixNote busca cada palabra también en el otro alfabeto, así que «телеграм» encuentra «Telegram» y «zametki» encuentra «заметки».
  - q: ¿Una pregunta en español puede encontrar una nota en inglés?
    a: Sí, de eso se encarga la búsqueda por significado. Su modelo es multilingüe y encuentra fragmentos de sentido parecido en cualquiera de los idiomas que conoce.
  - q: ¿Mis notas se envían a un servidor cuando busco?
    a: No. El índice de texto completo y el modelo de búsqueda por significado funcionan en tu dispositivo. Solo salen una pregunta al asistente y los fragmentos encontrados para ella, y solo si usas el asistente.
  - q: ¿Cuánto ocupa el modelo de búsqueda por significado?
    a: Unos 120 MB. Se descarga una vez y luego funciona sin conexión.
---

Apuntaste «llamada con Oleg» y ahora buscas «call»; la nota dice «giveaway» y tú preguntas por «sorteos». ¿Cómo encuentras una nota si un mes después no recuerdas en qué idioma ni con qué palabra la escribiste? Aquí verás cómo busca FixNote por palabras, cómo funciona la búsqueda por significado y qué añade el asistente.

## Por qué la búsqueda normal no encuentra la nota

La búsqueda normal de una app de notas compara letras. Si escribiste una idea en inglés y la buscas en español, no hay coincidencia. Las formas de las palabras también fallan: una nota sobre «canciones» puede no salir al buscar «canción». En notas que mezclan español, inglés y ruso estos fallos se acumulan y parece que la nota ha desaparecido.

FixNote tiene dos búsquedas, y las dos funcionan en tu dispositivo, sin conexión.

## Búsqueda por palabras: principio de palabra y transliteración

La búsqueda se abre con Ctrl+K (⌘K en Mac). El atajo funciona también con la distribución de teclado rusa, porque FixNote se fija en la tecla física. Por debajo hay un índice de texto completo de SQLite guardado en la base de datos local.

Cada palabra de la consulta se busca como principio de palabra, así que «plan» encuentra «planes», «planear» y «planificación». Cada palabra se busca también en el otro alfabeto: «телеграм» encuentra «Telegram» y «zametki» encuentra «заметки». Si la consulta tiene varias palabras, la nota tiene que contenerlas todas.

Bajo el título de cada resultado, FixNote muestra un fragmento con las palabras encontradas resaltadas, para que veas enseguida por qué salió esa nota.

Las palabras de las imágenes también cuentan. FixNote lee el texto de capturas y fotos en tu dispositivo, y una nota con una imagen se encuentra por las palabras escritas en ella. Es gratis; más en [texto en imágenes](/es/features/text-in-images/).

## Búsqueda por significado

La segunda búsqueda encuentra notas que no comparten ninguna palabra con la consulta. Cada nota se divide en fragmentos y, para cada uno, un modelo multilingüe pequeño (multilingual-e5-small) calcula un vector, una descripción numérica de su significado. La consulta también se convierte en vector, y FixNote busca los fragmentos de sentido más parecido.

El modelo se entrenó con muchos idiomas, así que una pregunta en español puede encontrar una nota escrita en inglés o en ruso. Ocupa unos 120 MB y se descarga una vez: en el ordenador, la primera vez que abres el asistente; en el móvil, cuando pulsas el botón. Puedes descargarlo o quitarlo en Ajustes → Avanzado → «Modelos en este dispositivo». El modelo funciona en tu dispositivo, y el texto de tus notas no se envía a ningún sitio para buscar.

En la ventana de Ctrl+K, los resultados por significado aparecen en «Parecidas en significado», junto a las coincidencias por palabras.

## Cómo busca el asistente

Cuando le haces una pregunta al [asistente](/es/features/ask-your-notes/), FixNote pide primero al modelo palabras clave extra: traducciones y sinónimos. Así una pregunta sobre «sorteos» encuentra una nota sobre «giveaway». Esas palabras se añaden solo a la búsqueda por palabras. La búsqueda por significado usa siempre tu pregunta tal como la escribiste.

Para el asistente, FixNote recorta además terminaciones frecuentes, de modo que «canciones» encuentra también «canción». Después une los resultados de las dos búsquedas por posición: un fragmento encontrado por palabras y por significado sube más arriba. Las notas editadas hace poco reciben un pequeño empujón que se apaga en un mes más o menos, porque «¿qué decidí sobre el viaje?» suele referirse a este año.

El asistente recibe los mejores fragmentos y responde a partir de ellos, numerando las fuentes: `[1]`, `[2]`. Pulsa un número para abrir la nota de donde sale el dato. Si los fragmentos no bastan, el asistente puede buscar otra vez con otras palabras o leer una nota entera. Si la respuesta no está en tus notas, la etiqueta bajo ella dice «No está en tus notas».

## Pruébalo con tus notas

Abre la búsqueda con Ctrl+K y escribe solo el principio de una palabra que sepas que está en una nota. Después hazle al asistente una pregunta en un idioma sobre una nota que escribiste en otro y mira qué fuentes cita. [Descarga FixNote](/es/download/) o abre la app web en app.fixnote.space. Si quieres hábitos que hagan tus notas más fáciles de encontrar, lee [cómo tomar notas que luego encuentres](/es/blog/como-tomar-notas-que-encuentres/).
