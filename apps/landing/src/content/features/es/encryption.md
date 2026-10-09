---
title: Cifrado de extremo a extremo
metaTitle: 'Notas con cifrado de extremo a extremo: cómo FixNote las protege'
description: FixNote cifra cada nota en tu dispositivo con su propia clave. El servidor guarda solo texto cifrado y tu clave es una frase de 12 palabras que solo tienes tú.
eyebrow: Cifrado
intro: ¿Puede alguien de una app de notas, o quien robe su base de datos, leer lo que escribes? En FixNote la nota se cifra en tu dispositivo, y al servidor solo llega texto cifrado que no se abre sin tu clave.
card:
  title: Cifrado de extremo a extremo
  text: Las notas se cifran en tu dispositivo; el servidor solo guarda texto cifrado.
problem: Muchas apps de notas en la nube cifran tus datos con su propia clave y pueden leerlos cuando lo necesitan. Si la base de datos se filtra o alguien sin permiso entra en ella, tus planes, tus cuentas y tus borradores acaban en manos ajenas.
stepsTitle: Cómo funciona
steps:
  - title: Una clave que puedes anotar
    text: Al crear la cuenta, FixNote genera una clave aleatoria y te la muestra como una frase de 12 palabras. Anótala.
  - title: Una clave para cada nota
    text: Cada nota se cifra en el dispositivo con su propia clave aleatoria (XChaCha20-Poly1305), y esa clave se envuelve con la clave de tu cuenta.
  - title: Solo sale texto cifrado
    text: La sincronización envía la nota cifrada, su clave envuelta y los datos que necesita, como fechas y un número de versión.
  - title: Dispositivos nuevos con un código
    text: En un dispositivo nuevo, escribe la frase o confirma el acceso desde otro que ya uses comparando un código de seis dígitos en las dos pantallas.
privacy: La frase y las claves nunca salen de tus dispositivos. En el ordenador la clave se guarda en el llavero del sistema; en el navegador, en su almacenamiento en ese dispositivo. El servidor conoce tu correo, cuándo cambiaron las notas y sus números de versión, pero no el texto de las notas, los nombres de las carpetas ni las imágenes.
faq:
  - q: ¿Puede FixNote leer mis notas?
    a: No. El servidor solo tiene texto cifrado y claves envueltas, y la clave de tu cuenta se queda en tus dispositivos.
  - q: ¿Qué pasa si pierdo la frase de 12 palabras?
    a: Mientras tengas un dispositivo con la sesión iniciada, tus notas siguen disponibles y puedes volver a ver la frase en Ajustes. Si pierdes la frase y todos los dispositivos, nadie puede recuperar las notas, tampoco nosotros.
  - q: ¿También se cifran las imágenes y los archivos?
    a: Sí. Cada adjunto se cifra por separado en el dispositivo y se guarda en el servidor cifrado. Los nombres de las carpetas también van cifrados.
  - q: ¿El plan gratuito tiene cifrado?
    a: En Free tus notas se quedan en el dispositivo y no nos llegan. Todo lo que llega al servidor con Pro (sincronización, notas compartidas, enlaces, mensajes de Telegram) va siempre cifrado, y no se puede desactivar.
  - q: ¿Qué ve el asistente?
    a: La búsqueda funciona en tu dispositivo, y al modelo solo le llegan los fragmentos encontrados para tu pregunta. Con Ollama en tu ordenador, no salen de él.
---

## Cómo activarlo y comprobarlo

No hay nada que activar: el cifrado funciona desde el primer inicio de sesión. Abre Ajustes → Cuenta y sincronización y entra con el código del correo. FixNote muestra «Tu frase de recuperación» y luego, en el paso «Comprueba la frase», te pide algunas palabras según su número para asegurarse de que las anotaste.

Puedes volver a ver la frase en la misma sección con Mostrar frase de recuperación. Antes de enseñar las palabras, FixNote te envía un código por correo, así que nadie puede leerlas sin más en tu ordenador desbloqueado.

Para añadir otro dispositivo sin la frase, elige Confirmar en otro dispositivo después de entrar. En el antiguo aparecerá «Un dispositivo nuevo quiere acceder a tus notas» y un código de seis dígitos. Si los códigos coinciden, pulsa Permitir.

## Cuándo resulta útil

Sirve sobre todo para datos de salud, el presupuesto de casa y notas de trabajo bajo NDA que se sincronizan entre el portátil y el ordenador de casa. En las [notas compartidas](/es/features/shared-notes/) cada miembro recibe la clave de la nota sellada para él, así que la edición en directo también cruza el servidor cifrada. El bot de Telegram sella al momento los mensajes que le envías con tu clave pública, y solo tu app puede abrirlos.

El texto cifrado de cada nota está ligado a su identificador, así que el servidor no puede cambiar una nota por otra sin que se note. El paso a paso está en el artículo sobre el [cifrado de extremo a extremo en FixNote](/es/blog/notas-cifrado-de-extremo-a-extremo/).

## Cuándo conviene otra herramienta

Si quieres una app con el código abierto para revisarlo tú mismo, mira Joplin: es un proyecto de código abierto con cifrado de extremo a extremo en sus apps. Mira la [comparación con Joplin](/es/vs/joplin/).

El cifrado de FixNote protege las notas en el servidor y en el camino hasta él. En el propio dispositivo están en una base de datos local, así que activa el cifrado del disco: BitLocker en Windows o FileVault en macOS.
