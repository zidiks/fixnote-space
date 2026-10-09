---
title: Text in images
metaTitle: 'Search the text in screenshots and photos: OCR in FixNote'
description: FixNote reads the text in your screenshots and photos on the device, so search finds an image by the words in it. Reads English, Russian and Spanish.
eyebrow: OCR
intro: Took a screenshot of a booking number and now can't find it? FixNote reads the text in the images of your notes, and search finds them by the words in the picture.
card:
  title: Text in images
  text: Search finds screenshots and photos by the words in them.
problem: Screenshots, whiteboard photos and receipts hold the text you need, but to a normal search they are just pictures. Finding an order number means scrolling through notes and squinting at every image.
stepsTitle: How it works
steps:
  - title: Add an image
    text: Paste a screenshot, drag a photo into a note, or send it to the FixNote bot in Telegram.
  - title: FixNote reads it in the background
    text: While the app window is open, FixNote reads new images one at a time without slowing you down. The language data downloads once, the first time it is needed.
  - title: Find or copy the text
    text: Search with Ctrl+K (⌘K on a Mac) finds the note by words from the image. Right-click an image and choose "Text from image" to see what was read, with a "Copy" button.
privacy: Text is recognized on your device by Tesseract, and your images are not sent anywhere for it. The recognized text is kept in the local database, is not synced, and is deleted along with the notes.
faq:
  - q: Which languages does FixNote read?
    a: English, Russian and Spanish. All three are read in one pass, so an image that mixes Latin and Cyrillic text works too.
  - q: Does FixNote read handwriting?
    a: Usually not. Tesseract is good with printed text on a plain background, such as screenshots, documents and receipts. Photos taken at an angle and small print come out worse.
  - q: Does recognition need the internet?
    a: Only once, to download the language data of about 8 MB. After that it works offline.
  - q: Does the assistant see the text in images?
    a: Yes. The assistant uses it when it searches for an answer and when it reads a note, so it can find the number on a screenshot.
  - q: Do I need Pro?
    a: No. Text recognition is part of the Free plan.
---

## How to turn it on

There is nothing to turn on. When an image appears in a note, FixNote reads it in the background soon after, while the app window is open. Each device reads images on its own, and only the ones already stored on it; the recognized text is not synced between devices. FixNote pauses between images so the app stays responsive, which means hundreds of screenshots from an import are read gradually.

The language data shows up in Settings → Advanced → "Models on this device", under "Text from images". You can download it in advance there, or remove it to free space; FixNote downloads it again when it is needed.

To see what was read, right-click the image and choose "Text from image". If there is none, FixNote says "No text found in this image." For photos like that, add a few words of your own under the image, and the note will turn up without recognition.

## When it helps

A booking number, an address from a map screenshot or an order code from an email all turn up in regular [search](/features/search/), as if you had typed them in. A photo of a conference slide becomes text you can copy into your notes. A screenshot of an error message is found by its wording when the error comes back a month later. Receipt photos sent to the [Telegram bot](/features/telegram/) become searchable too, and images that came in with an import from Notion or Obsidian are read just like new ones.

## When another tool is better

Tesseract hardly reads handwriting. If you photograph paper notebooks, it is easier to recognize the text on your phone, for example with Google Lens, and paste it into a note as text. FixNote does not search inside PDFs, even scanned ones, and it does not read languages other than English, Russian and Spanish.
