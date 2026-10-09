---
title: 'Frase de recuperación de 12 palabras: cómo guarda FixNote tu clave'
description: 'Por qué FixNote te muestra 12 palabras, dónde volver a verlas, cómo añadir un dispositivo nuevo sin la frase y qué pasa con tus notas si la pierdes.'
date: 2026-09-28
translationKey: recovery-phrase
faq:
  - q: 'He perdido mi frase de recuperación de FixNote. ¿Qué hago?'
    a: 'Abre FixNote en un dispositivo con sesión iniciada y ve a Ajustes → Cuenta y sincronización → «Mostrar frase de recuperación». Si no tienes ni la frase ni ningún dispositivo con sesión, las notas no se pueden recuperar.'
  - q: '¿Puedo iniciar sesión en un dispositivo nuevo sin la frase?'
    a: 'Sí, si tienes otro dispositivo con sesión iniciada. Elige «Confirmar en otro dispositivo», compara el código de seis cifras y pulsa «Permitir» en el dispositivo antiguo.'
  - q: '¿El soporte de FixNote puede recuperar mis notas?'
    a: 'No. La clave de tus notas solo está en tus dispositivos y en tu copia de la frase; el servidor guarda únicamente texto cifrado.'
  - q: '¿En qué se diferencia la frase de recuperación de una contraseña?'
    a: 'Una cuenta de FixNote no tiene contraseña: entras con un código que llega por correo. La frase es lo que descifra tus notas en el dispositivo.'
---

Cuando creas una cuenta, FixNote te muestra 12 palabras y te pide que las anotes. ¿Para qué sirven, cuándo las vas a necesitar y qué pasa si las pierdes? Aquí tienes las respuestas y cómo añadir un dispositivo nuevo sin la frase.

## Para qué sirven las 12 palabras

Las notas se cifran en tu dispositivo, y el servidor solo recibe texto cifrado. La clave es la frase de 12 palabras: FixNote la genera al azar al crear la cuenta y de ella deriva en el dispositivo todas las demás claves. Las palabras existen para que puedas apuntar esa clave en papel. Son palabras en inglés de la lista estándar BIP39, el mismo formato que usan los monederos de criptomonedas.

No hay contraseña. Entras con un código de seis cifras que llega por correo, y solo la clave abre tus notas. El servidor nunca recibe la clave, así que no podemos restaurarla. Todos los detalles están en [Cómo funciona el cifrado de extremo a extremo en FixNote](/es/blog/notas-cifrado-de-extremo-a-extremo/) y en la [página de cifrado](/es/features/encryption/).

## Dónde se guarda la clave en tu dispositivo

En las apps para Windows y macOS, la clave está en el almacén de credenciales del sistema: el Administrador de credenciales de Windows o el Llavero de macOS. En la versión web se guarda en el navegador de ese dispositivo. Por eso un dispositivo en el que ya iniciaste sesión no te pide la frase.

## Cómo comprueba FixNote que la anotaste

Tras la pantalla «Tu frase de recuperación» y el botón «Ya la anoté», FixNote te pide que escribas algunas palabras según su número. Si no coinciden, te pide que revises tu nota. La última palabra lleva una suma de control, así que cuando escribes la frase en un dispositivo nuevo, la app detecta una errata al momento. Tampoco acepta la frase de otra cuenta.

## Cuándo necesitarás la frase

Necesitas la frase en un dispositivo nuevo cuando no tienes otro con la sesión iniciada. También te salva si has perdido o borrado todos tus dispositivos. En los demás casos es más fácil añadir el dispositivo nuevo desde uno antiguo.

## Añadir un dispositivo nuevo sin la frase

En el dispositivo nuevo, inicia sesión con el código del correo y elige «Confirmar en otro dispositivo» en lugar de escribir la frase. El dispositivo antiguo mostrará «Un dispositivo nuevo quiere acceder a tus notas» con un código de seis cifras. Comprueba que el código es el mismo en las dos pantallas y pulsa «Permitir».

El dispositivo nuevo crea un par de claves de un solo uso, y el antiguo sella para él la clave de la cuenta. El servidor solo transmite ese sobre sellado y no puede abrirlo, y la solicitud caduca a los diez minutos. Si los códigos de las dos pantallas no coinciden, alguien cambió la clave por el camino y no debes permitir la solicitud.

Permite el acceso solo si el dispositivo es tuyo y el código coincide. Con la clave, el dispositivo podrá leer todas tus notas. Después arranca la [sincronización](/es/features/sync/) y tus notas aparecen en él.

## Volver a ver la frase

Ve a Ajustes → Cuenta y sincronización → «Mostrar frase de recuperación». Antes de enseñarte las palabras, FixNote te envía un código por correo, y la frase solo aparece cuando lo introduces. Así nadie que se siente ante tu ordenador desbloqueado puede leerla. Para comprobar el código hace falta conexión.

## Dónde guardar la frase

Escribe las palabras en papel y guárdalas con tus documentos importantes. También sirve un gestor de contraseñas de confianza. Guardar la frase en una nota de FixNote no tiene sentido: si pierdes el acceso a tus notas, la pierdes con ellas. No se la envíes a nadie, porque quien la tenga puede leer todas tus notas.

## Si pierdes la frase

Mientras te quede un dispositivo con sesión iniciada, tus notas siguen ahí. Consulta la frase en ese dispositivo, vuelve a anotarla y añade los dispositivos nuevos con el código. Si has perdido la frase y todos los dispositivos, nadie puede recuperar tus notas, tampoco nosotros. Es el precio de un cifrado en el que el servidor no tiene la clave.

Abre Ajustes → Cuenta y sincronización, pulsa «Mostrar frase de recuperación» y compara tu copia con lo que muestra FixNote.
