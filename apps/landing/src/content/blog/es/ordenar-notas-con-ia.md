---
title: 'Cómo ordenar tus notas con IA: carpetas y títulos en FixNote'
description: 'Cómo «Poner orden» en FixNote sugiere carpetas, títulos y duplicados, qué ve el modelo y cómo aceptar, descartar o deshacer cada cambio, uno por uno.'
date: 2026-09-30
translationKey: tidy
faq:
  - q: '¿Qué envía FixNote al modelo para poner orden?'
    a: 'Los nombres de tus carpetas y, de las notas sin carpeta o sin título, el título y el comienzo del texto, hasta 280 caracteres. Los duplicados se buscan en tu dispositivo, sin modelo.'
  - q: '¿Puedo deshacer un traslado o una unión de notas?'
    a: 'Sí. Cada sugerencia aceptada queda en la actividad de la IA, en Ajustes → IA, y desde ahí se deshace mientras la nota no se haya editado después.'
  - q: '¿«Poner orden» funciona sin Pro?'
    a: 'Sí, si conectas tu propia clave de API u Ollama en Ajustes → IA. Con FixNote AI forma parte de Pro.'
  - q: '¿FixNote elimina los duplicados por su cuenta?'
    a: 'No, solo propone unirlos. Si aceptas, las líneas que faltan en la nota más reciente se añaden a ella y la otra se elimina. También se puede deshacer desde el registro.'
---

¿Cómo poner en orden notas que llevan meses acumulándose sin carpeta ni título? FixNote tiene «Poner orden» para eso: la IA sugiere carpetas y títulos, la app encuentra duplicados y tú decides qué aceptar. Aquí verás cómo usarlo, qué ve el modelo y cómo deshacer cualquier cambio.

## Cómo usar «Poner orden»

Pulsa «Poner orden» en la barra lateral y después «Buscar sugerencias». FixNote revisa tus notas y muestra las sugerencias en tres grupos:

- «Carpetas» propone mover una nota a una carpeta que ya existe o a una nueva.
- «Títulos» propone un nombre para una nota cuya primera línea resultó ser una frase larga.
- «Duplicados» muestra notas casi iguales que puedes unir.

Cada sugerencia tiene «Aceptar» y «Descartar», y con «Aceptar todo» y «Rechazar todo» resuelves la lista entera. El modelo solo propone una carpeta nueva cuando al menos dos notas encajan en ella, y le pone nombre en el idioma de las notas. Si no hay nada que sugerir, FixNote dice «No hay sugerencias: todo está en orden».

También puedes ordenar solo unas cuantas notas: elígelas en una lista con Ctrl+clic (⌘+clic en Mac) y pulsa «Ordenar» en la barra de selección.

## Lo que FixNote hace sin que se lo pidas

Cada pocos días la app busca sugerencias en segundo plano si hay al menos tres notas sin carpeta. Lo que encuentra espera en la página «Poner orden»; no se aplica nada.

Hay una pista más. Cuando sales de una nota reciente sin carpeta que ya tiene unas líneas de texto, FixNote te propone una carpeta y un título en un aviso con «Aplicar» y «Revisar».

## Qué ve el modelo

Para las carpetas y los títulos, FixNote envía al modelo los nombres de tus carpetas y hasta 40 notas que necesitan carpeta o título. De cada nota el modelo recibe solo el título y el comienzo del texto, hasta 280 caracteres. Los duplicados se buscan en tu dispositivo, sin modelo: FixNote compara las palabras y propone una pareja cuando dos notas tienen el mismo título y casi las mismas palabras, o cuando casi todo el texto coincide.

El modelo que responde lo eliges en Ajustes → IA: FixNote AI, tu propia clave u Ollama. Con tu propia clave u Ollama, «Poner orden» funciona también en el plan gratuito; [qué modelo de IA elegir](/es/blog/que-modelo-de-ia-elegir-para-el-asistente/) los compara. Las notas que otros comparten contigo solo para ver nunca entran en las sugerencias.

## Qué pasa cuando aceptas

Un traslado pone la nota en la carpeta elegida y crea la carpeta si todavía no existe. Un título se añade como primera línea de la nota. Una unión añade a la nota más reciente las líneas que le faltan y elimina la otra, así que no se pierde texto.

Una sugerencia aceptada se aplica en el acto y queda en la actividad de la IA, en Ajustes → IA. El registro muestra qué cambió y cuándo, por ejemplo: Movida «Compras» a «Casa». «Deshacer» lo devuelve todo a como estaba mientras la nota no se haya editado; si se editó, el registro avisa de que ya no se puede deshacer.

## El modo automático

Por defecto las sugerencias esperan tu decisión. En Ajustes → IA → «Modos de IA» está el modo «Automático»: con él las sugerencias, también las encontradas en segundo plano, se aplican al instante y un aviso ofrece deshacerlas. El registro y «Deshacer» funcionan igual. En el modo «Aceptar ediciones», las sugerencias de «Poner orden» siguen esperando tu aprobación.

## Por qué no hay etiquetas

FixNote no tiene etiquetas. El orden se basa en las [carpetas](/es/features/folders/) y en la búsqueda, por eso «Poner orden» solo sugiere carpetas y títulos. Una palabra con `#` sigue siendo texto normal y la búsqueda la encuentra. Las etiquetas del encabezado (front matter) de los archivos Markdown importados se conservan como una última línea con esas palabras.

## Cuándo usarlo

Es más útil justo después de una importación grande desde otra app, y luego cada vez que vuelvan a acumularse notas sin carpeta. La página de [«Poner orden»](/es/features/tidy-up/) cuenta más sobre la función.

La primera vez, acepta solo las sugerencias del grupo «Títulos» y después abre la actividad de la IA y deshaz una de ellas. Así ves cómo funciona sin mover nada de carpeta.
