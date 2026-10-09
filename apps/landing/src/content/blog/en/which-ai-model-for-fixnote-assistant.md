---
title: 'FixNote AI, your own key or Ollama: which model for the assistant'
description: 'How FixNote AI, your own API key and Ollama differ: what each sends to the model, which work on Free or offline, and which one to start with.'
date: 2026-09-26
translationKey: ai-models
faq:
  - q: 'Do I need Pro to use the FixNote assistant?'
    a: "No. With your own API key or with Ollama the assistant works on the free plan. Pro is only needed for FixNote AI, the built-in model that doesn't need a key."
  - q: 'Does the model see all my notes?'
    a: 'No. Search runs on your device, and the model gets your question, your folder names and what the assistant found and opened to answer it.'
  - q: 'Can I use the FixNote assistant offline?'
    a: "Yes, with Ollama in the desktop app for Windows or Mac. The model then runs on your computer, and your question and notes don't leave it."
  - q: 'Which providers work with my own key?'
    a: 'Any OpenAI-compatible one. The list has OpenAI, OpenRouter, Groq and DeepSeek, and "Other" takes the address of any other service.'
---

Which model should power the FixNote assistant when there are three options: the built-in FixNote AI, your own API key, or Ollama on your computer? Below is how they differ, what each one sends to the model, which work for free or offline, and where to start.

The same model answers in the chat, makes [AI edits](/features/ai-edits/) in notes, suggests folders in Tidy up and writes call summaries. You pick it in Settings → AI → "Model".

## What the model gets, whichever you choose

Search over your notes always runs on your device, and your whole library is never sent anywhere. The assistant works as an agent: it searches notes, opens the ones it needs and, when you ask, creates or changes them. The model receives your question, the list of your folder names and the results of those steps, meaning the passages it found and the notes it opened. That is the same for all three options; only the destination of the request differs.

The assistant shows every change to a note as a diff, always asks before deleting or making many changes at once, and records everything in the AI activity log. The [ask your notes page](/features/ask-your-notes/) has more on how it answers.

## FixNote AI: works right away

FixNote AI works as soon as you sign in, with no key or setup. It is part of Pro (you can try it for 7 days without a card) and has a monthly allowance. Requests go through our server to the model provider. We don't store or log what's in them.

FixNote AI has two levels, switched in Settings → AI → "Thinking". "Standard" answers quickly and suits most questions. "Deep" uses a stronger model that thinks before it answers. It handles big tasks across many notes better, but it is slower and uses the allowance about 4 times faster.

When the month's allowance runs out, FixNote tells you when it renews. Until then you can switch to your own key or Ollama.

## Your own key: any OpenAI-compatible provider

In Settings → AI → "Model", choose "Your own key", then the provider: OpenAI, OpenRouter, Groq, DeepSeek, or "Other" with the service's address. Enter the model name and paste your API key. The key stays on this device, and requests go straight to the provider, bypassing our server.

Your own key works on the Free plan too, in the browser and in the desktop app. You choose the model and pay the provider at its prices. What happens to your requests is up to that provider's terms, so read them.

## Ollama: a model on your computer

Ollama runs a model on your own computer. It is available in the desktop app for Windows and Mac, not in the browser. Only with Ollama do your question and notes never leave the computer, and it is the only option in "Only on this device" mode, which turns off sync, Telegram and FixNote AI.

Quality and speed depend on the model and your hardware. Some small models can't call tools; then the assistant answers from the notes it found but can't create or change notes. If FixNote finds no models, install one with a command like `ollama pull llama3.1` and refresh the model list in settings. The [offline page](/features/offline/) covers working without the internet.

## Where to start

| What matters most | What to pick |
|---|---|
| It should just work | FixNote AI, "Standard" |
| Big questions across many notes | FixNote AI, "Deep" |
| Your own costs and choice of model | Your own key |
| Nothing goes over the internet | Ollama |

You can change the choice at any time; your notes stay as they are. If you set up your own key or Ollama, press "Check" under the model settings: FixNote sends a short request and shows whether the model answered.
