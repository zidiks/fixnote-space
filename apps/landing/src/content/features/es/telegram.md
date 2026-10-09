---
title: Notas desde Telegram
metaTitle: 'Guarda mensajes de Telegram como notas con el bot de FixNote'
description: Envía o reenvía al bot de FixNote textos, audios y fotos de Telegram y se convierten en notas en tu dispositivo. El bot los cifra y no puede leerlos.
eyebrow: Telegram
intro: ¿Te mandas cosas a Mensajes guardados en Telegram y luego no encuentras nada? Envía o reenvía el mensaje al bot de FixNote y se convierte en una nota en la app, sea texto, audio o foto.
card:
  title: Bot de Telegram
  text: Reenvía al bot textos, audios y fotos y se convierten en notas.
problem: Las ideas llegan fuera de casa, y la app abierta suele ser Telegram. Mensajes guardados acumula cientos de mensajes, a la semana ya no encuentras el que buscas y los audios hay que escucharlos enteros.
stepsTitle: Cómo funciona
steps:
  - title: Conecta el bot
    text: En Ajustes → Integraciones → Telegram pulsa «Conectar» y luego «Iniciar» en el chat de Telegram que se abre. El enlace con el código vale 15 minutos.
  - title: Envía y reenvía
    text: El bot acepta texto, audios, archivos de audio y fotos de hasta 10 MB. Un mensaje reenviado conserva su autor en la nota, y una publicación de un canal público, el enlace a ella.
  - title: Abre FixNote
    text: Los mensajes se convierten en notas cuando la app sincroniza. Los audios se transcriben en tu dispositivo y el sonido queda en la nota como adjunto.
privacy: El bot sella cada mensaje al momento con la clave pública de tu cuenta, y solo tu app puede abrirlo. El servidor guarda el mensaje sellado hasta que la app lo recoge y después lo borra. Telegram ve tu chat con el bot, como cualquier otro chat.
faq:
  - q: ¿Puedo usar el bot con el plan Free?
    a: No. El bot es parte de Pro, porque los mensajes pasan por nuestro servidor. En Free el bot responde que guardar desde mensajería es parte de Pro.
  - q: ¿Puedo añadir el bot a un grupo?
    a: No. Solo acepta mensajes en un chat privado, para que los mensajes de otras personas no acaben en tus notas.
  - q: ¿Puedo enviar al bot un PDF u otro documento?
    a: Todavía no. El bot acepta texto, audios, archivos de audio y fotos. Rechaza los archivos de más de 10 MB y te lo dice.
  - q: ¿Puedo leer mis notas a través del bot?
    a: No, el bot solo recibe mensajes. Para buscar y preguntar está la app.
  - q: ¿Cómo desconecto el bot?
    a: Envíale /stop o pulsa «Desconectar» en Ajustes → Integraciones → Telegram.
---

## Cómo conectar el bot

Inicia sesión con una cuenta Pro y abre Ajustes → Integraciones → Telegram. Pulsa «Conectar»: se abre Telegram con el bot, y ahí pulsas «Iniciar». En los ajustes aparecerá «Conectado» con el nombre de tu chat. El enlace sirve una sola vez y durante 15 minutos; si caduca, pulsa «Conectar» de nuevo.

Al lado hay un interruptor, «Mensajes a la nota del día». Si está activado, todo lo que envías se añade a la nota de hoy. Si no, cada mensaje se convierte en una nota aparte, sin carpeta, y puedes colocarlas después, por ejemplo con [Ordenar](/es/features/tidy-up/).

Los enlaces escondidos tras palabras en las publicaciones reenviadas siguen siendo enlaces. El pie de una foto pasa a ser el texto de la nota, y un enlace solo en su línea se convierte en una tarjeta con el título de la página.

## Cuándo es útil

Estás leyendo un canal y quieres guardar una publicación. Reenvíala al bot y la nota tendrá el texto y un enlace al original. En la calle es más fácil grabar un audio que escribir, y FixNote lo convierte en texto en tu ordenador o en el navegador. La foto de un tique o de una tarjeta de visita va por el mismo camino, y luego la búsqueda la encuentra por el [texto de la imagen](/es/features/text-in-images/).

Con «Mensajes a la nota del día» activado, todo lo que mandaste desde el móvil durante el día se reúne en una sola nota, lista para ordenar por la tarde en el ordenador.

## Cuándo conviene otra herramienta

Para un borrador que solo necesitas un par de horas, Mensajes guardados de Telegram es más sencillo: es gratis y ya lo tienes. El bot de FixNote no te devuelve notas ni acepta documentos, así que un PDF es mejor arrastrarlo a una nota en el ordenador. En el modo «Solo en este dispositivo» el bot está desactivado, porque funciona a través de nuestro servidor.
