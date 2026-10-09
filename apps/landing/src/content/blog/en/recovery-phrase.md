---
title: 'Your 12-word recovery phrase: how FixNote keeps the key to your notes'
description: 'Why FixNote shows you 12 words, where to see them again, how to add a new device without the phrase, and what happens to your notes if you lose it.'
date: 2026-09-28
translationKey: recovery-phrase
faq:
  - q: 'I lost my FixNote recovery phrase. What now?'
    a: 'Open FixNote on a device where you are signed in and go to Settings → Account & sync → Show recovery phrase. If you have neither the phrase nor a signed-in device, the notes cannot be recovered.'
  - q: 'Can I sign in on a new device without the phrase?'
    a: 'Yes, if another device is already signed in. Choose Confirm on another device, compare the six-digit code and click Allow on the old device.'
  - q: 'Can FixNote support recover my notes?'
    a: 'No. The key to your notes exists only on your devices and in your copy of the phrase; the server holds nothing but ciphertext.'
  - q: 'How is the recovery phrase different from a password?'
    a: 'A FixNote account has no password: you sign in with a code sent by email. The phrase is what decrypts your notes on the device.'
---

When you create an account, FixNote shows you 12 words and asks you to write them down. What are they for, when will you need them, and what happens if you lose them? This post answers those questions and shows how to add a new device without the phrase.

## What the 12 words are for

Notes are encrypted on your device, and the server only ever gets ciphertext. The key is the 12-word phrase: FixNote generates it at random when you create the account and derives every other key from it on the device. The words exist so you can write that key down on paper. They are English words from the standard BIP39 list, the same format crypto wallets use.

There is no password. You sign in with a six-digit code from an email, and only the key can open your notes. The server never receives the key, so we can't restore it. The full picture is in [How end-to-end encryption works in FixNote](/blog/end-to-end-encrypted-notes/) and on the [encryption page](/features/encryption/).

## Where the key lives on your device

In the Windows and macOS apps the key sits in the system's credential store: Windows Credential Manager or the macOS Keychain. In the web app it is kept in the browser on that device. That's why a device you are already signed in on doesn't ask for the phrase.

## How FixNote checks you wrote it down

After the "Your recovery phrase" screen and the "I wrote it down" button, FixNote asks you to type a few words by their numbers. If they don't match, it asks you to check your note. The last word carries a checksum, so when you type the phrase on a new device, the app catches a typo right away. It also refuses a phrase from a different account.

## When you'll need the phrase

You need the phrase on a new device when you have no other device that's signed in. It also saves you if you've lost or wiped all your devices. In every other case it's easier to add the new device from an old one.

## Adding a new device without the phrase

On the new device, sign in with the email code and choose "Confirm on another device" instead of typing the phrase. The old device shows "A new device wants access to your notes" with a six-digit code. Check that the code is the same on both screens and click Allow.

The new device creates a one-time key pair, and the old one seals the account key for it. The server only passes that sealed envelope along and can't open it, and the request expires after ten minutes. If the codes on the two screens differ, someone swapped the key on the way, and you must not allow the request.

Only allow access if the device is yours and the code matches. Once it has the key, the device can read all your notes. Then [sync](/features/sync/) starts and your notes appear on it.

## Seeing the phrase again

Go to Settings → Account & sync → Show recovery phrase. Before it shows the words, FixNote emails you a code, and the phrase appears only after you enter it. That way someone who sits down at your unlocked computer can't read it. Checking the code needs an internet connection.

## Where to keep the phrase

Write the words on paper and keep them with your important documents. A password manager you trust works too. Keeping the phrase in a FixNote note makes no sense: lose access to your notes and you lose the phrase with them. Never send it to anyone, because whoever has it can read all your notes.

## If you lose the phrase

As long as one signed-in device is left, your notes are there. Look the phrase up on that device, write it down again, and add new devices with the code. If both the phrase and every device are gone, nobody can recover your notes, us included. That's the price of encryption where the server has no key.

Open Settings → Account & sync, click Show recovery phrase and check your written copy against what FixNote shows.
