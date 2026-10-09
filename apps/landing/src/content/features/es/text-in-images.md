---
title: Texto en imágenes
metaTitle: 'Busca el texto de tus capturas y fotos: OCR en FixNote'
description: FixNote lee el texto de tus capturas y fotos en el propio dispositivo, y la búsqueda encuentra la imagen por sus palabras. Lee español, inglés y ruso.
eyebrow: OCR
intro: ¿Hiciste una captura con el número de reserva y ahora no la encuentras? FixNote lee el texto de las imágenes de tus notas, y la búsqueda las encuentra por las palabras que aparecen en ellas.
card:
  title: Texto en imágenes
  text: La búsqueda encuentra capturas y fotos por las palabras que contienen.
problem: Las capturas, las fotos de una pizarra y los tiques guardan el texto que necesitas, pero para una búsqueda normal solo son imágenes. Encontrar un número de pedido obliga a recorrer notas y mirar cada imagen.
stepsTitle: Cómo funciona
steps:
  - title: Añade una imagen
    text: Pega una captura, arrastra una foto a una nota o envíasela al bot de FixNote en Telegram.
  - title: FixNote la lee en segundo plano
    text: Mientras la ventana de la app está abierta, FixNote lee las imágenes nuevas de una en una sin frenarte. Los datos de idioma se descargan una vez, la primera vez que hacen falta.
  - title: Encuentra o copia el texto
    text: La búsqueda con Ctrl+K (⌘K en Mac) encuentra la nota por las palabras de la imagen. Con clic derecho en la imagen y «Texto de la imagen» ves lo que se leyó, con un botón «Copiar».
privacy: El texto se reconoce en tu dispositivo con Tesseract, y tus imágenes no se envían a ningún sitio para ello. El texto reconocido se guarda en la base de datos local, no se sincroniza y se borra junto con las notas.
faq:
  - q: ¿Qué idiomas lee FixNote?
    a: Español, inglés y ruso. Los tres se leen de una vez, así que una imagen que mezcla texto latino y cirílico también funciona.
  - q: ¿FixNote lee texto escrito a mano?
    a: Normalmente no. Tesseract lee bien el texto impreso sobre fondo liso, como capturas, documentos y tiques. Las fotos en ángulo y la letra pequeña salen peor.
  - q: ¿Hace falta internet para reconocer el texto?
    a: Solo una vez, para descargar los datos de idioma, unos 8 MB. Después funciona sin conexión.
  - q: ¿El asistente ve el texto de las imágenes?
    a: Sí. El asistente lo usa cuando busca una respuesta y cuando lee una nota, así que encuentra el número de una captura.
  - q: ¿Necesito Pro?
    a: No. El reconocimiento de texto forma parte del plan Free.
---

## Cómo activarlo

No hay nada que activar. Cuando aparece una imagen en una nota, FixNote la lee poco después en segundo plano, mientras la ventana de la app está abierta. Cada dispositivo lee las imágenes por su cuenta y solo las que ya tiene guardadas; el texto reconocido no se sincroniza entre dispositivos. FixNote hace pausas entre imágenes para que la app no se ralentice, así que cientos de capturas llegadas en una importación se leen poco a poco.

Los datos de idioma aparecen en Ajustes → Avanzado → «Modelos en este dispositivo», en «Texto de imágenes». Ahí puedes descargarlos de antemano o eliminarlos para liberar espacio; FixNote los vuelve a descargar cuando hagan falta.

Para ver lo que se leyó, haz clic derecho en la imagen y elige «Texto de la imagen». Si no hay texto, FixNote lo dice: «No se encontró texto en la imagen.» Para fotos así, añade debajo unas palabras tuyas y la nota aparecerá en la búsqueda sin necesidad de reconocimiento.

## Cuándo es útil

Un número de reserva, una dirección de una captura del mapa o un código de pedido de un correo aparecen en la [búsqueda](/es/features/search/) normal, como si los hubieras escrito. La foto de una diapositiva de un congreso se convierte en texto que puedes copiar a tus apuntes. La captura de un mensaje de error se encuentra por su texto cuando el error vuelve un mes después. Las fotos de tiques enviadas al [bot de Telegram](/es/features/telegram/) también se pueden buscar, y las imágenes que llegaron al importar desde Notion u Obsidian se leen igual que las nuevas.

## Cuándo conviene otra herramienta

Tesseract apenas lee la letra manuscrita. Si fotografías cuadernos, es más cómodo reconocer el texto en el móvil, por ejemplo con Google Lens, y pegarlo en una nota ya como texto. FixNote no busca dentro de los PDF, aunque sean escaneos, ni lee idiomas que no sean español, inglés o ruso.
