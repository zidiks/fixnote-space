---
title: 'Dictado por voz sin internet: cómo funciona el dictado en FixNote'
description: 'Cómo dictar notas en FixNote, qué modelo de reconocimiento de voz conviene a tu ordenador y por qué la grabación de tu voz no sale de tu dispositivo.'
date: 2026-10-07
translationKey: voice-on-device
faq:
  - q: '¿El dictado de FixNote necesita internet?'
    a: 'Solo una vez, para descargar el modelo de reconocimiento de voz. Después, el dictado funciona sin conexión.'
  - q: '¿Adónde va la grabación de mi voz?'
    a: 'A ningún sitio. La voz se reconoce en tu dispositivo y el audio de una nota dictada no se guarda. Una pregunta hablada al asistente se queda en el dispositivo para que puedas volver a escucharla.'
  - q: '¿El dictado funciona en el navegador?'
    a: 'Sí. El modelo Whisper funciona dentro de la app tanto en la versión web como en las apps para Windows y macOS.'
  - q: '¿Qué modelo reconoce la voz con más precisión?'
    a: 'El modelo «Preciso», de unos 245 MB. Va mejor con idiomas mezclados, pero es casi el doble de lento que el «Estándar».'
---

¿Se pueden dictar notas sin enviar tu voz al servidor de otro? En FixNote sí: la voz se reconoce en tu ordenador o en tu navegador. Aquí verás cómo empezar a grabar, adónde va el texto, qué pasa con el audio y qué modelo elegir para tu equipo.

## Cómo empezar a dictar

Hay varias formas de empezar una grabación:

- El botón «Nota de voz» de Inicio convierte lo que dices en una nota nueva.
- El micrófono de una nota abierta inserta el texto donde está el cursor.
- El micrófono del chat del asistente envía tu pregunta enseguida como mensaje de voz, y el asistente responde al texto reconocido.
- En la app de escritorio, «Nota de voz» también está en el menú del icono de la bandeja.

Ctrl+Mayús+Espacio (⌘⇧Espacio en Mac) empieza y termina la grabación desde cualquier sitio. Si hay una nota abierta, el texto va a ella; si el cursor está en el cuadro del chat, se convierte en una pregunta al asistente; en los demás casos aparece una nota nueva. Esc cancela la grabación y «Listo» la termina. Cada grabación puede durar hasta diez minutos.

Si activas «Notas de voz a la nota del día» en Ajustes → General, lo que dictes se añadirá a la nota de hoy en vez de crear notas aparte.

## Qué pasa mientras hablas

FixNote corta la grabación en las pausas y transcribe cada trozo al momento, sin esperar a que termines. El idioma se detecta en el primer trozo y se mantiene en los demás. Cuando pulsas «Listo», solo queda por procesar la última frase, así que el texto aparece casi enseguida, incluso después de un dictado largo.

## Dónde se reconoce la voz y qué pasa con el audio

La voz la reconoce el modelo Whisper. Funciona dentro de la app en todas las plataformas, también en la versión web, y el audio no se envía a ninguna parte. El modelo se descarga una vez, con la primera grabación (FixNote muestra el progreso); a partir de ahí, el dictado no necesita internet.

Cuando dictas en una nota, el audio no se guarda: la nota recibe solo el texto. Una pregunta que le haces al asistente por voz se guarda en este dispositivo para que puedas volver a escucharla en el chat.

## Qué modelo elegir

En Ajustes → Avanzado → «Modelos en este dispositivo» hay tres modelos de reconocimiento de voz:

| Modelo | Tamaño | Para qué sirve |
|---|---|---|
| Ligero | unos 41 MB | Ordenadores lentos; se equivoca más |
| Estándar | unos 77 MB | La mayoría de las grabaciones; viene por defecto |
| Preciso | unos 245 MB | Voz que mezcla dos idiomas; casi el doble de lento |

En la misma lista ves qué modelos están descargados y cuánto ocupan, y puedes eliminar cualquiera.

Si el reconocimiento va lento en tu ordenador, FixNote lo nota. Tras dos dictados lentos de cada tres, te ofrece una sola vez un modelo más ligero. Puedes volver al anterior en los mismos ajustes.

## Cómo ordenar el texto dictado

El texto dictado se guarda tal cual, con cada «eh» y cada repetición. Después de una nota de voz nueva, FixNote muestra el botón «Ordenar»: la IA propone párrafos y viñetas y te enseña los cambios palabra por palabra. El cambio se aplica al pulsar «Aceptar», y «Descartar» deja el texto como estaba. Cualquier otra nota se ordena igual con «Preguntar a la IA» → «Ordenar la nota».

Para esto hace falta un modelo de lenguaje: FixNote AI en Pro, tu propia clave de API u Ollama en tu ordenador. Si en Ajustes → IA elegiste un modo que aplica los cambios directamente, FixNote muestra un aviso con el botón «Deshacer».

## Mensajes de voz de Telegram y llamadas

Los mensajes de voz que envías al bot de FixNote en Telegram los transcribe el mismo modelo en tu dispositivo; el bot los entrega cifrados. En la [página del bot de Telegram](/es/features/telegram/) se explica cómo funciona.

En las apps para Windows y macOS (macOS 14.2 o posterior), la voz también se reconoce durante una llamada: FixNote graba tu micrófono y el audio de la otra parte, transcribe ambos en el dispositivo y escribe un resumen de la reunión. Más detalles en la [página de resúmenes de llamadas](/es/features/call-summaries/), y todo sobre las notas de voz en la [página de notas de voz](/es/features/voice-notes/).

Abre la nota de hoy, pulsa Ctrl+Mayús+Espacio y dicta tu lista de tareas para mañana. La primera grabación tarda un poco más mientras se descarga el modelo; las siguientes empiezan sin esperar.
