---
title: 'Notas compartidas con cifrado de extremo a extremo en FixNote'
description: 'Cómo invitar a alguien a una nota o carpeta de FixNote, en qué se diferencian los permisos, cómo se edita a la vez y qué sabe el servidor sin ver el texto.'
date: 2026-10-04
translationKey: shared-notes
faq:
  - q: '¿La persona a la que invito necesita FixNote Pro?'
    a: 'No. Pro lo necesita quien comparte la nota o la carpeta. A los invitados les basta una cuenta gratuita de FixNote.'
  - q: '¿Puede el servidor de FixNote leer una nota compartida?'
    a: 'No. El texto, los cambios en vivo y los archivos de una nota compartida van cifrados con su clave, y cada miembro recibe esa clave sellada para que solo él pueda abrirla. El servidor conoce a los miembros, sus correos y sus permisos.'
  - q: '¿Qué pasa si dos personas escriben en el mismo párrafo a la vez?'
    a: 'Los cambios se combinan. Una nota compartida guarda sus cambios como un CRDT (Yjs), que une las ediciones simultáneas sin conflictos.'
  - q: '¿Cuánto dura una invitación a una nota compartida?'
    a: '30 días. Si no se acepta en ese tiempo, el propietario ve «Invitar de nuevo» junto a la dirección.'
---

¿Cómo llevar una misma nota entre dos o con un equipo: la lista de la compra, el plan de un viaje, las notas de un proyecto? En FixNote puedes compartir una nota o una carpeta entera con otras personas por correo, y el servidor sigue sin poder leer el texto. Aquí verás cómo funcionan las invitaciones, los permisos, la edición conjunta y el cifrado de las notas compartidas.

## Cómo invitar a alguien a una nota

Abre la nota, pulsa «Compartir» y escribe un correo. La persona necesita una cuenta de FixNote; si no la tiene, la app te lo dice. Después elige el permiso. Con «Puede editar» escribe en la nota contigo y con «Puede ver» solo la lee.

También puedes compartir una carpeta entera con «Compartir…» en su menú. El miembro recibe la carpeta con todas sus subcarpetas y notas, y las notas nuevas que se añadan aparecen para todos.

Las notas y carpetas compartidas forman parte de Pro. Pro lo necesita quien comparte; a los invitados les basta una cuenta gratuita.

## La invitación hay que aceptarla

La invitación llega a la campana de notificaciones de la otra persona, que pulsa «Aceptar» o «Rechazar». Hasta entonces la nota no le aparece. Si no se acepta en 30 días, caduca: junto a la dirección verás «invitación caducada» y el botón «Invitar de nuevo».

## Cómo se ve la edición conjunta

Cuando estáis los dos en la nota, veis los cambios del otro al momento. El cursor de la otra persona tiene su propio color y su nombre, y su texto nuevo se resalta un instante para que se note qué cambió. Si el asistente cambia una nota compartida a petición de alguien, encima del texto aparece «FixNote AI · a petición de …» y lo que escribe aparece para todos.

Dos personas pueden escribir en el mismo párrafo a la vez. Una nota compartida guarda sus cambios como un CRDT (usamos Yjs), que combina las ediciones simultáneas sin conflictos. Si estás sin conexión, tus cambios se guardan en el dispositivo y se combinan en la siguiente sincronización.

## Qué significa «Puede ver»

Con permiso de lectura no se puede cambiar nada de la nota: ni el texto, ni su lugar en las carpetas, y tampoco se puede eliminar. En una carpeta compartida con ese permiso no se pueden crear notas ni subcarpetas. Si arrastras un archivo o dictas algo con esa carpeta abierta, va a tus propias notas, sin carpeta.

El propietario puede cambiar el permiso de alguien en cualquier momento, y el cambio se aplica al instante, aunque la otra persona tenga la nota abierta.

## Qué sabe el servidor de las notas compartidas

El contenido de una nota compartida va cifrado con la clave de esa nota. Cada miembro recibe la clave sellada con su clave pública, así que solo ese miembro puede abrirla. Los cambios en vivo también pasan por el servidor cifrados. En una carpeta compartida, su nombre y las claves de sus notas se cifran del mismo modo. La página de [cifrado](/es/features/encryption/) y el artículo sobre [notas con cifrado de extremo a extremo](/es/blog/notas-cifrado-de-extremo-a-extremo/) explican cómo se protegen las notas normales.

El servidor sabe quién participa en una nota y con qué permiso, y guarda las direcciones de correo. Los miembros ven los correos de los demás.

Las imágenes y los archivos de una nota compartida se guardan en el servidor bajo esa nota, cifrados con la misma clave. El espacio que ocupan cuenta para el almacenamiento del propietario de la nota.

## Cómo salir o dejar de compartir

Un miembro puede salir de una nota o de una carpeta, y desaparece de sus dispositivos. El propietario puede quitar a una persona o usar «Dejar de compartir», y entonces la nota se queda solo con él. El resto de detalles está en la página de [notas compartidas](/es/features/shared-notes/).

Si solo quieres enseñar una nota a alguien que no usa FixNote, basta con un [enlace de solo lectura](/es/features/share-links/). Para probar la edición conjunta, invita a alguien cercano a tu lista de la compra con «Puede editar» y que cada uno marque un artículo desde su dispositivo.
