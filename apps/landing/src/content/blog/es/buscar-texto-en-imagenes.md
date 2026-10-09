---
title: "Buscar el texto de imágenes y capturas con FixNote: OCR local"
description: "FixNote lee el texto de capturas, fotos y tiques en tu dispositivo, y la búsqueda encuentra la imagen por las palabras que tiene. Cómo funciona y qué lee peor."
date: 2026-10-02
translationKey: ocr
faq:
  - q: "¿Cómo encuentro una captura de pantalla por el texto que tiene?"
    a: "Añade la captura a una nota de FixNote. La app lee su texto en segundo plano, y la búsqueda (Ctrl+K, o ⌘K en Mac) encuentra la nota por palabras que solo aparecen en la imagen."
  - q: "¿Se suben mis imágenes a algún sitio para el OCR?"
    a: "No. El reconocimiento de texto funciona en tu dispositivo. El texto leído se guarda en la base de datos local y no se sincroniza."
  - q: "¿Qué idiomas reconoce FixNote en las imágenes?"
    a: "Español, inglés y ruso, también mezclados en una misma imagen."
  - q: "¿Hace falta un plan de pago para leer el texto de las imágenes?"
    a: "No. El reconocimiento de texto forma parte del plan Free y funciona sin cuenta."
---

¿Dónde estaba la captura con el número de reserva? La foto de la pizarra después de una reunión, un tique de compra, una diapositiva de la presentación de otra persona: el texto que buscas está en la imagen, y la búsqueda normal de notas solo ve lo que se escribió con el teclado. Aquí verás cómo lee FixNote el texto de las imágenes, dónde aparece el resultado y qué imágenes lee peor.

## Cómo lee FixNote el texto de las imágenes

Cuando aparece una imagen en una nota, FixNote lee su texto en segundo plano. Para ello usa Tesseract, un motor de reconocimiento de texto (OCR) de código abierto que funciona dentro de la app, en el ordenador o en el navegador. Lee español, inglés y ruso. FixNote revisa las imágenes de una en una, con una pausa entre ellas, para que la app nunca vaya lenta.

Los datos de idioma ocupan unos ocho megabytes. FixNote los descarga una vez, la primera vez que encuentra una imagen, y a partir de ahí el reconocimiento no necesita internet.

## Adónde va el texto reconocido

El texto se guarda en la base de datos local junto a la imagen. Nunca se envía a nuestro servidor ni se sincroniza entre dispositivos: cada dispositivo lee las imágenes cuando ya las tiene. Si borras notas, el texto de sus imágenes se borra con ellas.

El reconocimiento de texto forma parte del plan Free y funciona sin cuenta. Más sobre lo que ocurre en tu dispositivo en la [página de texto en imágenes](/es/features/text-in-images/).

## Dónde se nota

El texto reconocido aparece en tres sitios:

- La búsqueda de notas (Ctrl+K, ⌘K en Mac) encuentra una nota por palabras que solo están en una imagen.
- El asistente lee ese texto junto con la nota. Pregúntale «¿cuál era el número de reserva del hotel en Oporto?» y encontrará la respuesta en la captura, si el número aparece en ella.
- Con clic derecho en una imagen y Texto de la imagen ves el texto reconocido y puedes copiarlo.

La búsqueda trata este texto como cualquier otro: entiende las terminaciones de las palabras y la transliteración. Cómo funciona con varios idiomas lo explica el artículo sobre [buscar notas en tres idiomas](/es/blog/buscar-notas-en-tres-idiomas/).

## Qué lee bien y qué lee peor

Tesseract funciona mejor con capturas, documentos y tiques: texto impreso y regular sobre un fondo liso. Las fotos tomadas en ángulo, la letra pequeña y el texto sobre una imagen recargada salen peor, y la letra manuscrita normalmente no sale. Si una imagen no tiene texto legible, la ventana Texto de la imagen lo dice: «No se encontró texto en la imagen.»

Para que una captura aparezca en la búsqueda bastan unas pocas palabras características: el nombre del hotel, un número de pedido, un apellido. Si con una palabra no la encuentras, prueba con otra de la imagen.

## Cómo descargar o quitar el modelo

En Ajustes → Avanzado → Modelos en este dispositivo hay una entrada Texto de imágenes. Ahí ves si los datos de idioma están descargados y cuánto ocupan, y puedes quitarlos. Cuando vuelvan a hacer falta, FixNote los descargará otra vez.

Arrastra a FixNote una captura con una dirección o un número de pedido, espera un minuto, pulsa Ctrl+K y escribe una palabra de la imagen.
