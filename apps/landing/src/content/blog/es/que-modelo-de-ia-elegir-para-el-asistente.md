---
title: 'FixNote AI, tu propia clave u Ollama: qué modelo usar en el asistente'
description: 'En qué se diferencian FixNote AI, tu propia clave de API y Ollama: qué se envía al modelo, cuáles funcionan gratis o sin internet y con cuál empezar.'
date: 2026-09-26
translationKey: ai-models
faq:
  - q: '¿Necesito Pro para usar el asistente de FixNote?'
    a: 'No. Con tu propia clave de API o con Ollama el asistente funciona en el plan gratuito. Pro solo hace falta para FixNote AI, el modelo integrado que no necesita clave.'
  - q: '¿El modelo ve todas mis notas?'
    a: 'No. La búsqueda se hace en tu dispositivo, y el modelo recibe tu pregunta, los nombres de tus carpetas y lo que el asistente encontró y abrió para responder.'
  - q: '¿Puedo usar el asistente de FixNote sin internet?'
    a: 'Sí, con Ollama en la app de escritorio para Windows o Mac. El modelo funciona en tu ordenador, y tu pregunta y tus notas no salen de él.'
  - q: '¿Qué proveedores sirven para mi propia clave?'
    a: 'Cualquiera compatible con OpenAI. En la lista están OpenAI, OpenRouter, Groq y DeepSeek, y con «Otro» puedes indicar la dirección de cualquier otro servicio.'
---

¿Qué modelo conviene usar en el asistente de FixNote si hay tres opciones: el FixNote AI integrado, tu propia clave de API u Ollama en tu ordenador? Aquí verás en qué se diferencian, qué envía cada uno al modelo, cuáles funcionan gratis o sin internet y por dónde empezar.

El mismo modelo responde en el chat, hace las [ediciones con IA](/es/features/ai-edits/) en las notas, propone carpetas en «Poner orden» y escribe los resúmenes de llamadas. Se elige en Ajustes → IA → «Modelo».

## Qué recibe el modelo con cualquier opción

La búsqueda en tus notas siempre se hace en tu dispositivo, y tu colección completa nunca se envía. El asistente funciona como un agente: busca notas, abre las que necesita y, si se lo pides, crea o cambia notas. El modelo recibe tu pregunta, la lista de nombres de tus carpetas y el resultado de esos pasos, es decir, los fragmentos encontrados y las notas que abrió. Esto es igual en las tres opciones; solo cambia adónde va la petición.

El asistente muestra cada cambio en una nota como una diferencia que puedes revisar, siempre pregunta antes de eliminar o de hacer muchos cambios a la vez, y todo queda en la actividad de la IA. La página [pregunta a tus notas](/es/features/ask-your-notes/) cuenta cómo responde.

## FixNote AI: funciona desde el primer momento

FixNote AI funciona en cuanto inicias sesión, sin clave ni configuración. Forma parte de Pro (puedes probarlo 7 días sin tarjeta) y tiene un límite mensual. Las peticiones pasan por nuestro servidor hasta el proveedor del modelo. No guardamos ni registramos su contenido.

FixNote AI tiene dos niveles, que se cambian en Ajustes → IA → «Razonamiento». «Estándar» responde rápido y sirve para la mayoría de las preguntas. «Profundo» usa un modelo más potente que piensa antes de responder. Va mejor con tareas grandes sobre muchas notas, pero tarda más y gasta el límite unas 4 veces más rápido.

Cuando se acaba el límite del mes, FixNote te dice cuándo se renueva. Hasta entonces puedes pasar a tu propia clave o a Ollama.

## Tu propia clave: cualquier proveedor compatible con OpenAI

En Ajustes → IA → «Modelo», elige «Tu propia clave» y luego el proveedor: OpenAI, OpenRouter, Groq, DeepSeek u «Otro» con la dirección del servicio. Indica el modelo y pega tu clave de API. La clave se queda en este dispositivo y las peticiones van directamente al proveedor, sin pasar por nuestro servidor.

Tu propia clave funciona también en el plan Free, en el navegador y en la app de escritorio. Eliges el modelo y pagas al proveedor según sus precios. Lo que pase con tus peticiones depende de las condiciones de ese proveedor, así que conviene leerlas.

## Ollama: un modelo en tu ordenador

Ollama ejecuta un modelo en tu propio ordenador. Está en la app de escritorio para Windows y Mac, no en el navegador. Solo con Ollama tu pregunta y tus notas nunca salen del ordenador, y es la única opción en el modo «Solo en este dispositivo», que desactiva la sincronización, Telegram y FixNote AI.

La calidad y la velocidad dependen del modelo y del equipo. Algunos modelos pequeños no saben usar herramientas; entonces el asistente responde con las notas que encontró, pero no puede crear ni cambiar notas. Si FixNote no encuentra modelos, instala uno con un comando como `ollama pull llama3.1` y actualiza la lista de modelos en los ajustes. La página [sin conexión](/es/features/offline/) cuenta cómo trabajar sin internet.

## Por dónde empezar

| Lo que más te importa | Qué elegir |
|---|---|
| Que funcione sin más | FixNote AI, «Estándar» |
| Preguntas grandes sobre muchas notas | FixNote AI, «Profundo» |
| Controlar tu gasto y elegir el modelo | Tu propia clave |
| Que nada salga a internet | Ollama |

Puedes cambiar de opción cuando quieras; tus notas no cambian. Si configuras tu propia clave u Ollama, pulsa «Comprobar» debajo de los ajustes del modelo: FixNote envía una petición corta y te muestra si el modelo respondió.
