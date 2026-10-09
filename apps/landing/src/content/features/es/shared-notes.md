---
title: Notas y carpetas compartidas
metaTitle: 'Notas compartidas con cifrado: edición en tiempo real en FixNote'
description: Invita a alguien por correo a una nota o carpeta, elige qué puede hacer y editad juntos en directo. El servidor guarda texto cifrado; solo los miembros lo leen.
eyebrow: En equipo
intro: ¿Cómo llevar la lista de la compra o el plan de un viaje entre dos sin que el texto quede legible en un servidor? Invita a la otra persona por correo a una nota o a una carpeta entera, y veréis los cambios del otro al momento.
card:
  title: Notas compartidas
  text: Invita a personas por correo a notas y carpetas y editadlas juntos.
problem: Una nota pegada en un chat se queda vieja con el primer cambio, y pronto cada uno tiene su versión. Los editores en la nube lo resuelven, pero guardan tu texto legible en sus servidores.
stepsTitle: Cómo funciona
steps:
  - title: Invita por correo
    text: Abre una nota, pulsa Compartir y escribe el correo de alguien con cuenta de FixNote. Para una carpeta, elige Compartir… en su menú.
  - title: Elige el acceso
    text: Con Puede editar, la persona cambia el texto contigo; con Puede ver, solo lo lee.
  - title: La otra persona acepta
    text: La invitación llega a su campana de notificaciones y pulsa Aceptar. Si nadie la acepta, caduca a los 30 días.
  - title: Editad juntos
    text: El cursor de cada persona lleva su nombre y su color, y sus cambios recientes se resaltan un momento.
privacy: Cada nota compartida tiene su propia clave, y cada miembro la recibe sellada con su clave pública. El texto, las imágenes y los cambios en directo pasan por el servidor solo cifrados. El servidor sabe quién participa en la nota y con qué rol, y guarda las direcciones de correo.
faq:
  - q: ¿Las personas que invito necesitan Pro?
    a: No. Para compartir una nota o una carpeta, el propietario necesita Pro; a los miembros les basta una cuenta gratuita de FixNote.
  - q: ¿Puedo invitar a alguien sin cuenta de FixNote?
    a: No. La clave de la nota se sella con la clave pública de su cuenta, así que la necesita. Para solo enseñar el texto, crea un enlace de solo lectura, que se abre sin cuenta.
  - q: ¿Qué pasa si dos personas editan el mismo párrafo a la vez?
    a: Los cambios se combinan. Una nota compartida se guarda como documento CRDT (Yjs), que une los cambios simultáneos sin crear copias en conflicto.
  - q: ¿Qué puede hacer un miembro con acceso de solo lectura?
    a: Solo leer. No puede cambiar, mover ni borrar la nota, y en una carpeta compartida no puede crear notas ni subcarpetas.
  - q: ¿Cómo dejo de compartir?
    a: El propietario pulsa Dejar de compartir en la ventana de Compartir, y la nota queda solo para él. Un miembro también puede salir de una nota o carpeta, y desaparece de sus dispositivos.
---

## Cómo compartir una nota o una carpeta

Abre la nota y pulsa Compartir arriba. En la ventana Compartir nota, escribe un correo, elige Puede editar o Puede ver y pulsa Invitar. Mientras la persona no responda, junto a su dirección pone «invitado». Si pasan 30 días sin respuesta, verás «invitación caducada» y el botón Invitar de nuevo.

Para compartir una carpeta, abre su menú en la barra lateral y elige Compartir…. El miembro recibe la carpeta con todas sus subcarpetas y notas, y cualquier nota que metas después en ella pasa a ser compartida. Puedes cambiar el rol de alguien cuando quieras; se aplica al instante, aunque tenga la nota abierta.

Cuando el asistente cambia una nota compartida por encargo de alguien, la nota muestra «FixNote AI · a petición de …», así todos saben de dónde viene el cambio.

## Cuándo resulta útil

En la lista de la compra de casa, uno añade productos desde el portátil y otro los tacha en la tienda con la app web en el móvil. En el plan de un viaje con amigos, cada uno completa su parte de la ruta y las reservas. Con un compañero puedes llevar una carpeta de trabajo con actas de reuniones y tareas del proyecto, y dar al cliente acceso de solo lectura.

Las imágenes y archivos de una nota compartida se cifran con la misma clave, y el espacio que ocupan cuenta para el almacenamiento del propietario. Si quieres ver cómo funcionan las claves, lee sobre el [cifrado de extremo a extremo](/es/features/encryption/).

## Cuándo conviene otra herramienta

Si todo tu equipo necesita una base de conocimiento con comentarios, bases de datos y permisos detallados, Notion te servirá mejor. FixNote tiene dos roles y no tiene comentarios en el texto, y su servidor no puede leer tus notas. Mira la [comparación con Notion](/es/vs/notion/).

Si solo quieres enseñar una nota a alguien que no usa FixNote, no hace falta invitarle: basta con un [enlace de solo lectura](/es/features/share-links/).
