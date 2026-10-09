---
title: "Guardar mensajes de Telegram en tus notas con el bot de FixNote"
description: "Cómo conectar el bot de FixNote en Telegram, qué puedes enviarle, por qué el bot no puede leer tus mensajes y qué revisar si una nota no aparece."
date: 2026-10-06
translationKey: telegram-capture
faq:
  - q: "¿Cómo guardo mensajes de Telegram en mis notas?"
    a: "Conecta el bot en FixNote: Ajustes → Integraciones → Telegram → Conectar. Después envía o reenvía al bot texto, audios y fotos, y cada mensaje se convierte en una nota en la app."
  - q: "¿Puede el bot de FixNote leer mis mensajes?"
    a: "No. El bot sella cada mensaje con la clave pública de tu cuenta en cuanto llega, y solo tu app puede abrirlo. Telegram sí ve tu chat con el bot, como ve cualquier chat."
  - q: "¿Puedo añadir el bot de FixNote a un grupo?"
    a: "No. El bot solo funciona en un chat privado, para que los mensajes de otras personas de un grupo nunca acaben en tus notas."
  - q: "¿El bot de Telegram es gratis?"
    a: "El bot forma parte de Pro. Pro tiene una prueba de 7 días sin tarjeta, que activas tú."
---

Mucha gente se manda cosas a Mensajes guardados en Telegram y luego no hay manera de encontrarlas. ¿Cómo enviar ideas, enlaces y audios directamente a tus notas? FixNote tiene un bot para eso: lo que le envías o reenvías se convierte en una nota en la app. Aquí verás cómo conectarlo, qué puedes mandarle y por qué el bot no puede leer tus mensajes.

## Cómo conectar el bot

El bot forma parte de Pro y funciona con tu cuenta de FixNote. Abre Ajustes → Integraciones → Telegram y pulsa Conectar. Se abre Telegram con el bot; pulsa Iniciar. El enlace lleva un código de un solo uso que vale 15 minutos y une tu chat a tu cuenta. Después, los ajustes de FixNote muestran Conectado con tu nombre de Telegram.

El bot solo funciona en un chat privado. Si lo añades a un grupo, no responde, porque si no los mensajes de otras personas acabarían en tus notas.

Para desconectarlo, pulsa Desconectar en los mismos ajustes o envía `/stop` en el chat con el bot.

## Qué puedes enviarle al bot

El bot acepta texto, audios, archivos de audio y fotos, también reenviados:

- El texto se convierte en una nota. Los enlaces escondidos tras palabras se conservan, y un enlace en una línea propia se convierte en una tarjeta con el título y la imagen de la página.
- Un audio se transcribe en tu dispositivo: la nota tiene el texto y, debajo, la grabación.
- Una foto pasa a ser una imagen de la nota, y su pie de foto pasa a ser el texto.
- Un mensaje reenviado lleva una línea con su autor, y una publicación de un canal público lleva además un enlace al original.

Los archivos de más de diez megabytes se rechazan, y el bot lo avisa en el chat. Los documentos y los vídeos todavía no se admiten.

Las notas nuevas llegan sin carpeta. Si prefieres reunirlo todo en un sitio, activa Mensajes a la nota del día en esos mismos ajustes, y los mensajes se añadirán a la [nota de hoy](/es/blog/nota-diaria-y-tareas-repetidas/).

## Por qué el bot no puede leer tus mensajes

Tu cuenta tiene un par de claves. La clave pública está en el servidor; la privada solo existe en tus dispositivos. Cuando llega un mensaje, el bot lo sella al instante con la clave pública y lo pone en una cola. Solo la clave privada, es decir, tu app, puede abrirlo. Ni el bot ni nosotros podemos leerlo. El mensaje nunca se guarda legible en el servidor ni se escribe en los registros.

Los audios se sellan enteros, y en el servidor no hay transcripción. La voz se reconoce después en la app, en tu ordenador o en tu navegador, igual que las [notas de voz](/es/features/voice-notes/).

La app recoge los mensajes de la cola, los convierte en notas y los borra del servidor. A partir de ahí se cifran y se sincronizan como cualquier otra nota.

Telegram sí ve tu chat con el bot, como ve todos los chats. Son las reglas de Telegram, y FixNote no puede cambiarlas. Más en la [página del bot de Telegram](/es/features/telegram/).

## Por qué no puedes leer tus notas desde el bot

El bot solo escribe. Buscar y hacer preguntas se hace en la app. Es a propósito: para mostrar tus notas en Telegram, el bot tendría que leerlas, y eso significa que estarían sin cifrar en algún sitio.

## Si un mensaje no aparece

Los mensajes se convierten en notas mientras la app está abierta. Normalmente ocurre casi al momento: el servidor avisa a la app en cuanto el bot pone un mensaje en la cola. Si la app estaba cerrada, las notas aparecen la próxima vez que la abras.

Si el bot respondió «Este enlace ha caducado», pulsa Conectar otra vez: el código del enlace vale 15 minutos. En el modo Solo en este dispositivo el bot está desactivado, porque en ese modo FixNote no se comunica con nuestro servidor.

Envía al bot un audio corto y abre FixNote: tendrás una nota con su texto.
