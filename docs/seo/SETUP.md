# Подключение поиска и аналитики fixnote.space

Что сделать руками один раз. Ключи и токены не коммитим и не присылаем в чат: они лежат в
`~/.config/fixnote-seo/.env` и `~/.config/claude-seo/` на машине, где работает Claude.

## 1. DNS (Cloudflare → fixnote.space → DNS)

Подтверждать сайты будем TXT-записями, чтобы в коде не было мета-тегов. Значения выдаст каждый сервис
(шаги 2–4), все записи на корень `fixnote.space`.

## 2. Google Search Console

1. search.google.com/search-console → Add property → **Domain** → `fixnote.space` → TXT-запись в DNS.
2. Sitemaps → `https://fixnote.space/sitemap-index.xml`.
3. Settings → Users and permissions → Add user → email сервис-аккаунта из шага 5 → **Full**.

## 3. Яндекс.Вебмастер

1. webmaster.yandex.ru → добавить `https://fixnote.space` → способ «DNS-запись».
2. Индексирование → Файлы Sitemap → `https://fixnote.space/sitemap-index.xml`.
3. Информация о сайте → Региональность → «Нет региона». Сайт международный, у каждого языка свой префикс.
4. oauth.yandex.ru → Создать приложение:
   - платформа «Веб-сервисы», Redirect URI `https://oauth.yandex.ru/verification_code`;
   - права «Яндекс.Вебмастер»: `webmaster:hostinfo`, `webmaster:verify`; «Яндекс.Метрика»: `metrika:read`;
   - открыть `https://oauth.yandex.ru/authorize?response_type=token&client_id=<ClientID>`, токен положить в `.env`.

## 4. Bing Webmaster Tools

1. bing.com/webmasters → Import from Google Search Console (после шага 2).
2. Settings → API access → API Key → в `.env`.
3. IndexNow настроен в коде (`apps/landing/indexnow.mjs`), отдельно ничего не нужно.

## 5. Google Cloud (для Claude: GSC, PageSpeed, CrUX, GA4)

1. console.cloud.google.com → новый проект `fixnote-seo`.
2. APIs & Services → Enable:
   - Google Search Console API;
   - PageSpeed Insights API;
   - Chrome UX Report API;
   - Google Analytics Data API.
3. Credentials → Create credentials → **API key** (ограничить этими API) → в `.env`.
4. IAM → Service accounts → Create → без ролей → Keys → Add key → JSON. Файл сохранить как
   `~/.config/claude-seo/service_account.json`.
5. Email сервис-аккаунта (`…@fixnote-seo.iam.gserviceaccount.com`) добавить в GSC (шаг 2.3) и в GA4
   (шаг 7.3).

## 6. Яндекс Метрика

1. metrika.yandex.ru → Добавить счётчик:
   - сайт `fixnote.space`;
   - Вебвизор **выключен** (в коде тоже `webvisor: false`);
   - принять условия.
2. Номер счётчика прислать Claude: он попадёт в `apps/landing/src/data/analytics.ts`. Номер не секрет, он виден в коде страницы.
3. Цели → JavaScript-событие: `download` (скачивание установщика) и `open_app` (переход в веб-версию).
4. Для своих визитов: Настройки → Фильтры → не учитывать мои визиты.

## 7. Google Analytics 4

1. analytics.google.com → Admin → Create property `fixnote.space` → Web stream `https://fixnote.space`.
2. Measurement ID (`G-…`) прислать Claude, он тоже не секрет.
3. Admin → Property access management → email сервис-аккаунта → роль Viewer.
4. Admin → Events: отметить `download` как key event (появится после первого скачивания).
5. Admin → Data retention → 14 месяцев.

## 8. Cloudflare

1. Analytics & Logs → Web Analytics: серверная статистика зоны уже есть бесплатно, включать JS-маячок не нужно.
2. **AI Crawl Control** (Security → Bots): проверить, что не заблокированы `Googlebot`, `Bingbot`,
   `YandexBot`, `OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot`, `Claude-SearchBot`.
3. Профиль → API Tokens → Create → Custom:
   - права Zone: Analytics: Read и Zone: Read на `fixnote.space`;
   - токен положить в `.env`.
4. Workers & Pages → `fixnote-space-landing` → Settings → Build → **Deploy command**: `npx wrangler deploy && node indexnow.mjs`
   (корень сборки `apps/landing`; если корень другой, путь `apps/landing/indexnow.mjs`).

## 9. Wordstat (необязательно)

- **Бесплатно:** веб-интерфейс wordstat.yandex.ru, выгрузки руками.
- **По API**, около $0.16 за 1000 запросов:
  - Yandex Cloud → сервис-аккаунт с ролью `search-api.webSearch.user`;
  - API key → в `.env`, folder id → в `.env`.

## `~/.config/fixnote-seo/.env`

```
YANDEX_OAUTH_TOKEN=
BING_WMT_API_KEY=
GOOGLE_API_KEY=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ZONE_ID=
YANDEX_CLOUD_API_KEY=
YANDEX_CLOUD_FOLDER_ID=
```
