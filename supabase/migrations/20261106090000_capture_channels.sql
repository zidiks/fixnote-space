-- More capture channels besides Telegram (docs/CONCEPT.md 4.9): the Discord app
-- (functions/discord-bot: "Save to FixNote" on a message, /save) and the browser extension
-- (functions/capture-extension, apps/extension). Same rules as Telegram: a one-time code from the
-- app links the channel; what arrives is sealed to the account's public key before it is stored
-- (the extension seals in the browser, so plaintext never reaches the server at all), and Pro is
-- checked by the inbox_items_pro trigger.
--
-- capture_links.external_id: the Discord user id; for the extension the SHA-256 (hex, 64
-- characters) of the token the extension holds, never the token itself.

alter table public.capture_links drop constraint capture_links_channel_check;
alter table public.capture_links
  add constraint capture_links_channel_check check (channel in ('telegram', 'discord', 'extension'));

alter table public.inbox_items drop constraint inbox_items_channel_check;
alter table public.inbox_items
  add constraint inbox_items_channel_check check (channel in ('telegram', 'discord', 'extension'));
