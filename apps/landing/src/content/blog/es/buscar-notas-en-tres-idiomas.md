---
title: 'Por qué «sorteo» encuentra «giveaway»: buscar notas en tres idiomas'
description: Cómo busca FixNote en notas que mezclan español, inglés y ruso, y por qué la búsqueda por palabras y la búsqueda por significado trabajan juntas.
date: 2026-09-22
translationKey: search
---

Una app de notas normal busca exactamente las letras que escribiste. Pero apuntamos las ideas como salen: «llamada con Oleg», «call con Oleg», «bot de Telegram», «телеграм-бот». Un mes después ya no recuerdas qué palabra usaste, y una búsqueda exacta no la encuentra.

FixNote tiene dos búsquedas, y las dos funcionan en tu dispositivo.

## Una búsqueda por palabras que perdona

La primera es la búsqueda de texto completo de la base de datos local SQLite. Encima de ella, FixNote hace varias cosas:

- **Transliteración.** Cada palabra también se busca en el otro alfabeto: «телеграм» encuentra «telegram».
- **Terminaciones.** Las formas de una palabra rusa se reducen a una raíz común, así que la gramática no estorba.
- **La distribución del teclado no afecta a los atajos.** Mod+K abre la búsqueda también con el teclado ruso o español, porque las teclas se reconocen por su posición física.

Las coincidencias se resaltan en la nota, así que ves enseguida por qué apareció.

## Búsqueda por significado

La segunda búsqueda encuentra notas que no comparten ni una palabra con tu consulta. Cada nota se divide en fragmentos, y un modelo multilingüe pequeño (multilingual-e5-small) convierte cada fragmento en un vector, una descripción numérica de su significado. El modelo se descarga una vez y funciona en tu ordenador; el texto de tus notas no sale de él.

Tu pregunta también se convierte en un vector, y FixNote busca los fragmentos más cercanos en significado. El modelo se entrenó con muchos idiomas, así que una pregunta en español encuentra una nota escrita en inglés.

## Cómo trabajan juntas

Los resultados de ambas búsquedas se combinan por posición: un fragmento que aparece tanto por palabras como por significado sube. Las notas recientes reciben un pequeño empujón, porque «¿qué decidí sobre las vacaciones?» seguramente se refiere a este año y no a hace dos.

## Dónde ayuda el asistente

Cuando le preguntas al asistente, primero añade palabras clave a la consulta: traducciones y sinónimos. Así «sorteos» encuentra una nota sobre «giveaway». Esas palabras solo se añaden a la búsqueda por palabras; la búsqueda por significado siempre usa tu pregunta tal como la escribiste.

Después, el asistente recibe los mejores fragmentos y responde solo con ellos, citando las fuentes por número: `[1]`, `[2]`. Pulsa un número y se abre la nota de la que salió la respuesta. Si la respuesta no está en tus notas, el asistente lo dice en lugar de inventarse algo.

## Por qué importa

Las buenas notas no son las que están bien ordenadas en carpetas, sino las que encuentras cuando las necesitas. Una búsqueda que entiende la transliteración, las formas de las palabras y el significado te deja apuntar rápido sin decidir antes dónde va cada idea. El orden puede esperar, y el asistente también ayuda con eso.

Pruébalo: [descarga FixNote](/es/download/) o abre la versión web.
