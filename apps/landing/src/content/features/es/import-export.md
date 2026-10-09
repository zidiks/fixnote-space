---
title: Importar y exportar
metaTitle: 'Pasa tus notas de Notion, Obsidian, Bear o Apple Notes a FixNote'
description: Trae tus notas a FixNote desde Obsidian, Bear, Notion y Notas de Apple con carpetas e imágenes, y expórtalo todo de vuelta a Markdown cuando quieras.
eyebrow: Mudanza
intro: ¿Cómo pasar años de notas desde otra app sin perder carpetas ni imágenes? FixNote lee las exportaciones de Obsidian, Bear y Notion, en Mac trae las notas directamente desde Notas de Apple y en cualquier momento lo exporta todo a Markdown.
card:
  title: Importar y exportar
  text: Llega desde Notion, Obsidian, Bear y Notas de Apple y exporta a Markdown.
problem: Cambiar de app de notas da miedo, porque todo lo acumulado durante años puede quedarse atrás. Y conviene saber de antemano que de la app nueva también se puede salir con todas tus notas.
stepsTitle: Cómo pasar tus notas
steps:
  - title: Elige el origen
    text: En Ajustes → Datos → «Importar notas» pulsa «Elegir archivos» o «Elegir carpeta». En la app para Mac también hay un botón «Notas de Apple».
  - title: Revisa lo encontrado
    text: FixNote muestra cuántas notas, carpetas e imágenes encontró y cuántos archivos dejará fuera. Nada cambia hasta que pulsas «Importar».
  - title: Importa
    text: Las notas llegan con sus carpetas, fechas e imágenes. Si el resultado no te convence, toda la importación se deshace con «Deshacer» en el aviso.
privacy: Los archivos que importas se leen en tu dispositivo y no se suben a ningún sitio. La exportación también se prepara en tu dispositivo y se guarda donde tú elijas.
faq:
  - q: ¿Qué formatos importa FixNote?
    a: Archivos .md, .markdown y .txt, la carpeta de un almacén de Obsidian, una copia de Bear (.bear2bk), una exportación de Notion en formato Markdown & CSV y la exportación del propio FixNote. Las notas de Apple se importan directamente en la app para Mac.
  - q: ¿Puedo importar desde Evernote?
    a: FixNote no lee archivos .enex directamente. Convierte antes las notas a Markdown con un conversor externo y luego importa la carpeta.
  - q: ¿Qué pasa si importo dos veces lo mismo?
    a: Las notas cuyo texto ya está en FixNote se omiten como duplicadas, así que nada se repite.
  - q: ¿Qué incluye la exportación?
    a: Un .zip con cada nota como archivo Markdown en su carpeta, las imágenes en una carpeta attachments y al lado una copia completa en JSON. Se abre en cualquier editor de Markdown y se puede volver a importar en FixNote.
  - q: ¿Necesito Pro para importar o exportar?
    a: No. Las dos cosas funcionan en el plan Free y sin cuenta.
---

## Cómo traer tus notas

Abre Ajustes → Datos y busca «Importar notas».

Obsidian o cualquier carpeta de Markdown: pulsa «Elegir carpeta» y elige tu almacén. Se mantiene la estructura de carpetas, y las imágenes, también las incrustadas como `![[foto.png]]`, pasan a ser adjuntos. Las etiquetas del front matter se añaden al final de la nota en una línea `#etiqueta`, para que la búsqueda las encuentre.

Bear: haz una copia de seguridad en Bear y elige el archivo `.bear2bk`. Las etiquetas con espacios como `#a b#` pasan a ser `#a-b`.

Notion: exporta tus páginas en Markdown & CSV y elige el `.zip` resultante. FixNote quita los identificadores largos que Notion añade a los nombres de archivo.

Notas de Apple (solo en la app para Mac): pulsa «Notas de Apple» y permite el acceso cuando macOS lo pida. Elige las carpetas; en Notas de Apple no cambia nada. Las notas con contraseña se omiten, los PDF, escaneos y dibujos no se traspasan, y FixNote te dice cuántos había de cada tipo.

Las tablas, los PDF y otros archivos que no son notas se dejan fuera. Los enlaces a otras notas de la app anterior quedan como texto normal.

La exportación está en el mismo sitio: «Exportar notas» guarda un `.zip` con todas tus notas.

## Cuándo es útil

Dejas Notion porque quieres notas que se abran sin internet. Pasas años de notas de Bear a un PC con Windows, donde Bear no existe. Quieres una copia de tus notas en el disco una vez al mes, por si acaso. Después de una importación grande, usa [Ordenar](/es/features/tidy-up/): FixNote propone títulos para las notas sin nombre y carpetas para las sueltas.

## Cuándo conviene otra herramienta

Si quieres que tus notas vivan siempre en el disco como archivos `.md` normales que también editan otros programas, Obsidian encaja mejor: FixNote guarda las notas en su propia base de datos y te da Markdown al exportar ([FixNote frente a Obsidian](/es/vs/obsidian/)). Las bases de datos de Notion no se traspasan, porque las tablas CSV se dejan fuera. Si tu trabajo depende de esas tablas con propiedades, mantenlas en Notion.
