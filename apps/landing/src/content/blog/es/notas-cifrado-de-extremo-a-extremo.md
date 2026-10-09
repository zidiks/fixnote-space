---
title: 'Notas con cifrado de extremo a extremo: cómo funciona en FixNote'
description: 'Una frase de 12 palabras, una clave nueva por versión de cada nota y un servidor que solo guarda texto cifrado: qué ve FixNote y qué pasa si pierdes la frase.'
date: 2026-09-18
updated: 2026-10-09
translationKey: e2ee
faq:
  - q: ¿Puede FixNote leer mis notas?
    a: No. El servidor solo guarda texto cifrado y las claves están únicamente en tus dispositivos. Un modelo recibe fragmentos de notas solo cuando le haces una pregunta al asistente.
  - q: ¿Qué pasa si pierdo la frase de recuperación?
    a: En los dispositivos donde ya iniciaste sesión, tus notas siguen disponibles y puedes volver a mostrar la frase tras un código por correo. Si pierdes la frase y todos los dispositivos, nadie puede recuperar las notas.
  - q: ¿Qué cifrado usa FixNote?
    a: XChaCha20-Poly1305 de la biblioteca libsodium. Las claves se derivan en tu dispositivo de un secreto aleatorio de 128 bits, escrito como una frase BIP39 de 12 palabras.
  - q: ¿Necesito cifrado si no uso la sincronización?
    a: Sin cuenta, las notas no salen nunca de tu dispositivo. El cifrado entra en juego cuando inicias sesión y tus notas empiezan a sincronizarse.
---

En las notas guardamos cosas que preferimos no enseñar: planes, dinero, salud, borradores de correos. ¿Se pueden sincronizar por la nube sin que el propio servicio pueda leerlas? En FixNote la nota se cifra en tu dispositivo y el servidor solo recibe lo que no puede leer. Aquí verás paso a paso de dónde salen las claves, cómo se cifra una nota, qué ve el servidor y qué hacer si pierdes la frase de recuperación.

## Qué significa el cifrado de extremo a extremo en las notas

Cifrado de extremo a extremo significa que la nota va cifrada de camino al servidor, mientras está guardada allí y de camino a tu otro dispositivo. Solo tus dispositivos pueden descifrarla, porque solo ellos tienen las claves. El servidor guarda bytes que sin clave no significan nada.

En FixNote esto se aplica a la sincronización. Sin cuenta, las notas no salen del dispositivo. La sincronización entre dispositivos forma parte de Pro; en el plan gratuito con cuenta, la sincronización solo descarga.

## Todo empieza con 12 palabras

Cuando creas una cuenta, la app genera 16 bytes aleatorios (128 bits) y te los muestra como una frase de 12 palabras en inglés según el estándar BIP39. Las palabras se apuntan fácilmente en papel, y la última lleva una suma de control, así que la app detecta una errata enseguida. Después de mostrarla, FixNote te pide escribir algunas palabras por su número para comprobar que la anotaste.

De este secreto se derivan en tu dispositivo todas las demás claves: para las notas, para los nombres de carpeta, para comprobar la frase, para los enlaces y un par de claves para los datos entrantes. Ni la frase ni las claves se envían al servidor. En la app de escritorio el secreto se guarda en el almacén de credenciales del sistema (Administrador de credenciales de Windows, Llavero de macOS). En el navegador queda en el almacenamiento del navegador, cifrado con una clave que los scripts pueden usar pero no leer.

## Cómo se cifra una nota

Cada vez que una nota va al servidor, FixNote la cifra con una clave aleatoria nueva mediante XChaCha20-Poly1305 de la biblioteca libsodium. Este cifrado comprueba la integridad: si cambia un solo byte del texto cifrado, el descifrado falla.

La clave de la nota se cifra a su vez con la clave de tu cuenta y se guarda junto al texto cifrado. Además, el texto cifrado va ligado al identificador de la nota. Así el servidor no puede poner el contenido de una nota en el lugar de otra, porque descifrar ese cambio también falla.

Los nombres de carpeta se cifran con una clave aparte. Las imágenes y otros archivos se cifran cada uno con su propia clave y también se guardan solo cifrados.

## Qué ve el servidor

El servidor existe para sincronizar, así que algo sí ve. De tus notas y carpetas sabe lo siguiente:

- Guarda el texto cifrado de cada nota y su clave cifrada.
- Ve los identificadores de notas y carpetas y qué carpeta está dentro de cuál.
- Conoce las horas de creación y edición, el número de versión y si una nota se borró o se fijó.
- Ve si una nota es normal o diaria, y la fecha de la nota diaria.
- Conoce tu correo, para enviarte códigos de acceso, y el tamaño de tus archivos cifrados.

El texto de las notas, sus títulos, los nombres de carpeta y el contenido de las imágenes no están en el servidor de forma legible. Si alguien robara la base de datos, se llevaría bytes que parecen aleatorios.

## Cómo añadir un dispositivo nuevo

En el dispositivo nuevo, inicia sesión con el código del correo. Después puedes escribir las 12 palabras o elegir «Confirmar en otro dispositivo». En ese caso, el dispositivo donde ya iniciaste sesión muestra la solicitud «Un dispositivo nuevo quiere acceder a tus notas» con un código de seis cifras, y el nuevo muestra el mismo código. Si coinciden, pulsa «Permitir»: el dispositivo antiguo cifra el secreto para una clave de un solo uso del nuevo, y solo el nuevo puede leerlo. Si los códigos no coinciden, alguien cambió la clave por el camino y debes rechazar la solicitud.

## Notas compartidas, enlaces y Telegram

Una nota compartida (Pro) tiene su propia clave, sellada por separado para cada miembro con su clave pública. Las ediciones en directo entre miembros también viajan cifradas. Un enlace público a una nota lleva la clave en la dirección, después del signo #, y el navegador nunca envía esa parte de la dirección al servidor.

Los mensajes al bot de Telegram pasan por Telegram sin cifrar, porque así funciona el propio mensajero. Nuestro bot los cifra al momento con la clave pública de tu cuenta y los pone en cola, y es tu dispositivo el que los convierte en notas.

## Qué recibe el modelo cuando preguntas al asistente

La búsqueda en tus notas, también la búsqueda por significado, se hace en tu dispositivo. El modelo recibe tu pregunta, los fragmentos encontrados para ella y las notas que el asistente lea mientras responde. Nunca recibe tu base de datos entera. Si no quieres enviar ni eso, conecta tu propia clave de un proveedor compatible con OpenAI, u Ollama en la app de escritorio. En el modo «Solo en este dispositivo» FixNote no contacta con nuestro servidor en absoluto: no hay sincronización, Telegram, notas compartidas ni FixNote AI.

## Qué pasa si pierdes la frase

En los dispositivos donde ya iniciaste sesión, tus notas siguen disponibles. Desde ellos puedes añadir un dispositivo nuevo sin la frase y volver a mostrar la propia frase. Si pierdes la frase y todos los dispositivos, nadie puede recuperar las notas, tampoco nosotros, porque no tenemos la clave.

Así que hazlo hoy: abre Ajustes → «Cuenta y sincronización», pulsa «Mostrar frase de recuperación», escribe el código del correo y copia las 12 palabras en papel. Guárdalo con tus documentos importantes. Tienes más detalles en las páginas de [cifrado](/es/features/encryption/) y [seguridad](/es/security/).
