---
title: Cómo funciona el cifrado de extremo a extremo en FixNote
description: Una frase de 12 palabras, una clave para cada nota y un servidor que solo guarda texto cifrado. Paso a paso, qué le pasa a una nota antes de sincronizarse.
date: 2026-09-18
translationKey: e2ee
---

Las notas son quizá lo más personal que guardamos en la nube: planes, dinero, salud, borradores de correos que nunca enviaste. Por eso FixNote está hecho para que no tengas que confiar en nosotros. La nota se cifra en tu dispositivo y el servidor solo recibe lo que no puede leer.

## Todo empieza con 12 palabras

Al crear una cuenta, la app genera 16 bytes aleatorios (128 bits) y los muestra como una frase de 12 palabras en inglés según el estándar BIP39, el mismo formato que usan las carteras de criptomonedas. Las palabras son fáciles de apuntar en papel, y la última lleva una suma de control, así que la app detecta una errata al instante.

De esa frase se derivan en tu dispositivo todas las demás claves: una para las notas, otra para los nombres de carpetas, otra para comprobar la frase y un par de claves para los mensajes entrantes. Ni la frase ni las claves se envían nunca al servidor. En el ordenador la clave se guarda en el llavero del sistema (Administrador de credenciales de Windows, Llavero de macOS); en el navegador, en el almacenamiento de ese navegador en este dispositivo.

## Cada nota tiene su propia clave

Cada nota se cifra con su propia clave aleatoria mediante XChaCha20-Poly1305, un cifrado moderno con comprobación de integridad: si alguien cambia un solo byte, el descifrado simplemente falla.

A su vez, la clave de la nota se cifra («se envuelve») con la clave de tu cuenta y se guarda junto al texto cifrado. Además, el cifrado está ligado al identificador de la nota, así que el servidor no puede cambiar una nota por otra sin que se note ni hacer pasar una versión antigua por nueva.

Los nombres de carpetas se cifran igual. Las imágenes y otros adjuntos se cifran archivo por archivo y también se guardan solo cifrados.

## Qué ve el servidor

La respuesta honesta no es «nada», sino solo lo imprescindible para sincronizar:

- el texto cifrado de la nota y su clave envuelta;
- los identificadores de la nota y de la carpeta;
- las fechas de creación y edición, un número de versión y una marca de borrado;
- el tipo de nota: normal o nota del día (y su fecha);
- tu correo, para enviarte los códigos de acceso.

El texto de las notas, los nombres de carpetas y las imágenes nunca están legibles en el servidor. Si alguien robara la base de datos, obtendría un montón de bytes de aspecto aleatorio.

## Añadir un dispositivo nuevo

Puedes escribir las 12 palabras, pero hay una forma más sencilla. En un dispositivo donde ya has iniciado sesión, empieza a añadir uno nuevo: ambas pantallas muestran el mismo código de seis dígitos. Si coinciden, la clave viaja cifrada al dispositivo nuevo y solo él puede leerla.

## ¿Y el asistente?

La búsqueda funciona en tu dispositivo, incluida la búsqueda por significado. El modelo de lenguaje solo recibe los fragmentos encontrados para una pregunta concreta, nunca toda tu biblioteca. Si prefieres no enviar ni siquiera eso, conecta tu propia clave de OpenAI, OpenRouter, Groq o DeepSeek, u Ollama en tu ordenador. En el modo solo local, FixNote no se comunica con nuestro servidor en absoluto.

## Si pierdes la frase

En los dispositivos donde ya has iniciado sesión, tus notas siguen disponibles y desde ahí puedes añadir un dispositivo nuevo sin la frase. Pero si pierdes la frase y todos los dispositivos, nadie puede recuperar tus notas, tampoco nosotros. Es la otra cara de un cifrado en el que no hace falta confiar. Apunta la frase en papel y guárdala con tus documentos importantes.

Más detalles en la página de [Seguridad](/es/security/).
