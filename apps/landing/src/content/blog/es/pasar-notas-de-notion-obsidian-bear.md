---
title: "Pasar notas de Notion, Obsidian, Bear y Notas de Apple a FixNote"
description: "Importar a FixNote paso a paso: qué exportar de Notion, Obsidian, Bear y Notas de Apple, qué se traspasa, qué se queda fuera y cómo exportar a Markdown."
date: 2026-10-01
translationKey: import
faq:
  - q: "¿Puedo importar mis páginas de Notion a FixNote?"
    a: "Sí. Exporta las páginas de Notion en formato Markdown & CSV y elige el .zip en Ajustes → Datos → Importar notas. Las páginas se convierten en notas, las subpáginas en carpetas y las imágenes en adjuntos. Las bases de datos de Notion (los CSV) se quedan fuera."
  - q: "¿Se conservan las carpetas y las imágenes de Obsidian?"
    a: "Sí. Las carpetas de tu bóveda pasan a ser carpetas de FixNote, y las imágenes a las que enlazan las notas, también las incrustadas con ![[...]], pasan a ser adjuntos."
  - q: "¿Qué pasa si importo lo mismo dos veces?"
    a: "Las notas cuyo texto ya está en FixNote se omiten como duplicadas, así que repetir la importación no añade nada."
  - q: "¿Cómo exporto mis notas de FixNote a Markdown?"
    a: "Abre Ajustes → Datos → Exportar notas. FixNote guarda un .zip con todas las notas en Markdown y una copia en JSON."
---

Cambiar de app de notas suele atascarse en una pregunta: ¿cómo me llevo años de notas sin perder nada por el camino? Aquí tienes cada origen paso a paso: qué exportar de la app anterior, qué traspasa FixNote, qué deja fuera y cómo sacar después tus notas en Markdown.

## Dónde está la importación en FixNote

Abre Ajustes → Datos → Importar notas. Hay dos botones: Elegir archivos, para archivos `.zip`, copias de Bear y archivos `.md` o `.txt` sueltos, y Elegir carpeta, para una carpeta entera de notas. En la app para Mac aparece un tercero, Notas de Apple.

Los archivos se leen en tu dispositivo y no se suben a nuestro servidor. Primero FixNote te muestra qué ha encontrado: cuántas notas, carpetas e imágenes y cuántos archivos no podrá traspasar. No se crea nada hasta que pulsas Importar. Si el resultado no te convence, pulsa Deshacer en el aviso que aparece al terminar, y las notas y carpetas nuevas se borran.

## Obsidian y cualquier carpeta de Markdown

Pulsa Elegir carpeta y selecciona tu bóveda. Cada archivo `.md` se convierte en una nota y las subcarpetas en carpetas de FixNote. Si ya existe una carpeta con el mismo nombre en ese nivel, las notas van a ella.

Las imágenes a las que enlazan las notas pasan a ser adjuntos. FixNote entiende tanto la imagen normal de Markdown, `![](img/foto.png)`, como la incrustación de Obsidian, `![[foto.png]]`.

Del front matter FixNote toma el título, las fechas de creación y de edición y las etiquetas. FixNote no tiene etiquetas aparte, así que las del front matter se añaden al final de la nota en una línea como `#trabajo #ideas`, y la búsqueda las encuentra como palabras. Las notas sin fechas en el front matter reciben la fecha de modificación del archivo.

Los enlaces entre notas no pueden seguir siendo enlaces, porque los archivos ya no están en las mismas rutas. De un enlace como `[texto](otra-nota.md)` queda su texto, y los enlaces entre dobles corchetes se quedan en la nota tal como están escritos.

## Bear

En Bear, haz una copia de seguridad: obtendrás un archivo `.bear2bk`. En FixNote pulsa Elegir archivos y selecciónalo. Las fechas de creación y modificación de las notas salen de la copia.

Bear permite etiquetas de varias palabras como `#casa reforma#`. FixNote las convierte en `#casa-reforma` para que la búsqueda trate la etiqueta como una sola palabra.

## Notion

En Notion, exporta en formato Markdown & CSV y descarga el `.zip`. En FixNote pulsa Elegir archivos y selecciona el archivo tal cual, sin descomprimirlo. Si Notion dividió la exportación en varios archivos dentro de uno, FixNote también los lee.

Las páginas se convierten en notas, las subpáginas se reparten en carpetas y las imágenes pasan a ser adjuntos. FixNote quita los identificadores largos que Notion añade a los nombres de archivos y carpetas. Las bases de datos de Notion llegan como archivos CSV, y la importación las deja fuera.

## Notas de Apple

La importación desde Notas de Apple solo está en la app de FixNote para Mac. Pulsa Notas de Apple y macOS te preguntará si FixNote puede usar Notas. Permítelo. Si en algún momento dijiste que no, FixNote muestra el botón Abrir Ajustes del Sistema: allí activa Notas para FixNote en Privacidad y seguridad → Automatización.

Después marca las carpetas que quieres traspasar. En Notas de Apple no cambia nada. Las imágenes dentro de las notas y las tablas se traspasan, y las fechas se conservan. Las notas con contraseña se omiten, y los PDF, escaneos y dibujos se quedan en Notas de Apple. Al terminar, FixNote te dice cuántos había de cada tipo.

## Qué deja fuera la importación

FixNote traspasa texto e imágenes. Los PDF, las hojas de cálculo y otros archivos que no son notas se omiten, y ves cuántos son antes de empezar. Una imagen que no se puede guardar, por ejemplo por su tamaño, se queda en la nota como su enlace original.

Si ya hay en FixNote una nota con el mismo texto, se omite como duplicada. Por eso puedes repetir la importación más adelante sin miedo, por ejemplo cuando hayas añadido algunas notas más en la app anterior.

## Poner orden después de la mudanza

Tras una importación grande, abre Ordenar: la IA propone carpetas y títulos para las notas sin título y encuentra duplicados, y tú aceptas o rechazas cada propuesta (más en la [página de Ordenar](/es/features/tidy-up/)). La [búsqueda](/es/features/search/) entiende las terminaciones de las palabras y también encuentra notas por su significado, algo útil con notas antiguas cuyas palabras exactas ya no recuerdas.

## Cómo llevarte tus notas de vuelta

Ajustes → Datos → Exportar notas guarda un `.zip`: todas las notas en Markdown repartidas en carpetas, las imágenes y una copia en JSON. Cualquier editor de Markdown lo abre, Obsidian incluido. FixNote también importa ese mismo archivo: la copia en JSON recupera las carpetas y las notas del día, por ejemplo en un ordenador donde no quieres activar la sincronización. Los formatos y detalles están en la [página de importar y exportar](/es/features/import-export/).

Empieza por una sola carpeta de tu app anterior: impórtala, mira cómo quedan las notas y las imágenes, y solo entonces pasa el resto.
