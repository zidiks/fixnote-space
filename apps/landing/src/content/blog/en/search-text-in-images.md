---
title: "Search the text in images and screenshots: OCR on device in FixNote"
description: "FixNote reads the text in screenshots, photos and receipts on your device, so search finds an image by the words in it. How it works and where it struggles."
date: 2026-10-02
translationKey: ocr
faq:
  - q: "How do I find a screenshot by the text in it?"
    a: "Add the screenshot to a FixNote note. The app reads the text in it in the background, and search (Ctrl+K, or ⌘K on a Mac) finds the note by words that appear only in the image."
  - q: "Are my images uploaded anywhere for OCR?"
    a: "No. Text recognition runs on your device. The text it reads is stored in the local database and is not synced."
  - q: "Which languages does FixNote recognize in images?"
    a: "English, Russian and Spanish, including a mix of them in one image."
  - q: "Do I need a paid plan for text in images?"
    a: "No. Text recognition is part of the Free plan and works without an account."
---

Where was that screenshot with the booking number? A photo of the whiteboard after a meeting, a receipt, a slide from someone else's deck: the text you need is in the image, while ordinary note search only sees typed words. This post explains how FixNote reads the text in images, where you see the result, and which images it reads less well.

## How FixNote reads the text in images

When an image appears in a note, FixNote reads the text in it in the background. It uses Tesseract, an open-source text recognition (OCR) engine, running inside the app on your computer or in your browser. It reads English, Russian and Spanish. FixNote goes through images one at a time with a pause in between, so the app never feels busy.

The language data is about eight megabytes. FixNote downloads it once, the first time it meets an image, and after that recognition needs no internet.

## Where the recognized text goes

The text is stored in the local database next to the image. It is never sent to our server and is not synced between devices: each device reads the images once they are on it. If you delete notes, the text of their images is deleted with them.

Text recognition is part of the Free plan and works without an account. More about what runs on your device is on the [text in images page](/features/text-in-images/).

## Where you see it

The recognized text shows up in three places:

- Note search (Ctrl+K, ⌘K on a Mac) finds a note by words that appear only in an image.
- The assistant reads that text along with the note. Ask "what was my hotel booking number in Porto?" and it finds the answer in the screenshot, if the number is there.
- Right-click an image and choose Text from image to see the recognized text and copy it.

Search treats this text like any other: it understands word endings and transliteration. How that works across languages is covered in [searching notes in three languages](/blog/searching-notes-in-three-languages/).

## What it reads well and what it doesn't

Tesseract does best with screenshots, documents and receipts: even, printed text on a plain background. Photos taken at an angle, small print and text over a busy picture come out worse, and handwriting usually doesn't come out at all. If an image has no text it can read, the Text from image window says "No text found in this image."

For a screenshot to turn up in search, a few distinctive words are enough: a hotel name, an order number, a surname. If one word doesn't find it, try another word from the image.

## How to download or remove the model

Settings → Advanced → Models on this device has a Text from images entry. It shows whether the language data is downloaded and how much space it takes, and you can remove it there. When it's needed again, FixNote downloads it again.

Drop a screenshot with an address or an order number into FixNote, give it a minute, then press Ctrl+K and type a word from the image.
