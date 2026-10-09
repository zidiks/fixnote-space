---
title: 'Servidor MCP para tus notas: conecta FixNote a Claude, Cursor y Codex'
description: 'Cómo dar a Claude Desktop, Cursor y Codex acceso a tus notas de FixNote con el servidor MCP, elegir el nivel de acceso y mostrar solo las carpetas que quieras.'
date: 2026-10-03
translationKey: mcp
faq:
  - q: '¿Hace falta FixNote Pro para usar el servidor MCP?'
    a: 'No. El servidor MCP está incluido en el plan Free. Funciona en tu ordenador con tus notas locales, así que no necesita cuenta ni internet.'
  - q: '¿Funciona MCP en la versión web de FixNote?'
    a: 'No. El servidor MCP viene con la app de escritorio para Windows y macOS: la app conectada lo inicia en el mismo ordenador.'
  - q: '¿Puede Claude borrar mis notas a través de MCP?'
    a: 'Solo si el acceso está en «Completo». Todo lo que se borre así se puede recuperar en «Actividad de la IA», en Ajustes → IA.'
  - q: '¿Claude o Cursor envían mis notas a su modelo?'
    a: 'Nuestro servidor no interviene. Lo que una app conectada lee por MCP lo envía a su propio modelo según sus propias condiciones, así que ábrele solo las carpetas que no te importe enseñar.'
---

Quieres que Claude Desktop, Cursor o Codex sepan qué decidiste en un proyecto y, de paso, que añadan a una nota lo que salió de una conversación. La app de escritorio de FixNote trae un servidor MCP justo para eso. Aquí verás cómo conectarlo, qué permisos dar y cómo dejar a la app dentro de una sola carpeta de trabajo.

## Qué es MCP y qué hace el servidor de FixNote

Model Context Protocol (MCP) es un estándar con el que las apps de IA conectan herramientas externas. Lo entienden Claude Desktop, Claude Code, Cursor, Codex y muchos otros clientes. FixNote les ofrece sus herramientas de notas, las mismas que usa el asistente integrado.

Con acceso de lectura, la app conectada busca notas, las lee junto con sus imágenes y archivos, consulta las notas recientes y la lista de carpetas y abre la nota del día. Con acceso de escritura, además crea notas, les añade texto y las edita, las mueve entre carpetas, crea y renombra carpetas y adjunta archivos. Para borrar notas y carpetas necesita acceso completo.

## Dónde funciona el servidor

El servidor MCP viene con las apps para Windows y macOS; la versión web no lo tiene. La app conectada lo inicia cuando lo necesita, y el servidor lee la base de datos local de FixNote en ese ordenador. No necesita internet ni cuenta, así que sigue funcionando en el modo «Solo en este dispositivo», del que hablamos en [FixNote sin internet](/es/blog/app-de-notas-sin-internet/). MCP está incluido en el plan Free.

Abre FixNote al menos una vez en el ordenador para que exista la base de datos. Después de actualizar FixNote, reinicia también la app conectada; el aviso de actualización te lo recuerda.

## Cómo conectarlo

Ve a Ajustes → IA → «Apps conectadas (MCP)» y pulsa «Añadir a Claude Desktop», «Añadir a Cursor» o «Añadir a Codex». FixNote escribe su configuración en el archivo de esa app y te dice cuál ha cambiado. Luego reinicia la app.

Para cualquier otro cliente MCP, pulsa «Copiar ajustes». Obtendrás un fragmento JSON corto con el comando que inicia el servidor; pégalo donde tu cliente guarde su lista de servidores MCP.

En un Mac, mueve primero FixNote a Aplicaciones y ábrelo desde ahí. Si se ejecuta desde otra carpeta, FixNote te pedirá que lo muevas, porque la ruta del servidor tiene que mantenerse igual.

## Niveles de acceso

| Acceso | Qué pueden hacer las apps conectadas |
|---|---|
| Desactivado | Nada |
| Solo lectura | Buscar y leer notas, ver sus imágenes y archivos. Es el nivel por defecto |
| Lectura y escritura | Crear y editar notas y carpetas, pero no borrarlas |
| Completo | Todo lo anterior y además borrar |

Cada cambio hecho por MCP aparece en «Actividad de la IA», en la misma sección de ajustes. Puedes deshacerlo mientras nadie haya editado la nota después, y las notas y carpetas borradas se recuperan desde ahí.

## Qué notas ve la app

Por defecto, la app conectada ve todas tus notas. En «Notas visibles», elige «Carpetas y notas elegidas» y marca las carpetas que quieras (las subcarpetas van incluidas) y las notas sueltas. Todo lo demás, para la app, no existe: la búsqueda no lo encuentra y, si lo pide directamente, recibe un «no encontrado». Las notas nuevas solo se pueden crear dentro de las carpetas elegidas.

Una imagen o un archivo de una nota solo está disponible si la app ve esa nota.

## Qué pedirle a Claude o a Cursor

Con acceso de lectura, prueba algo como «Busca en mis notas qué decidimos sobre el diseño de la landing y conviértelo en una lista de tareas» o «¿Qué preguntas para el proveedor anoté la semana pasada?». Con acceso de escritura puedes pedir «Añade un resumen de esta conversación a la nota de hoy» o «Crea en la carpeta Proyecto una nota con el plan de lanzamiento».

En Cursor y Claude Code esto viene bien para las notas sobre tu código: decisiones de arquitectura, comandos que siempre se olvidan, lo que queda por terminar. La [página de MCP](/es/features/mcp/) reúne todo lo que hace el servidor.

Empieza con «Solo lectura» y una carpeta de notas de trabajo, y hazle a Claude una pregunta que solo tus notas puedan responder. Activa la escritura cuando veas cómo trata la app tu texto.
