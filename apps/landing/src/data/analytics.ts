/**
 * Site analytics: Yandex Metrika and Google Analytics 4 on fixnote.space only (never in the app).
 * They load only after the visitor accepts the banner (Base.astro, `consent` in i18n); the choice
 * is kept in localStorage `fixnote.consent` and changed with "Cookies" in the footer. With both
 * ids null there is no banner and no script. The privacy policy describes them: change it with
 * this file: the banner and the policy name only the services that are on.
 *
 * Goals sent by the click handler in Base.astro: `download` (platform: windows, mac-arm,
 * mac-intel) for /download/* links and `open_app` for links to the web app. In Metrika both are
 * goals of type "JavaScript event"; Webvisor stays off there and in `init`.
 */
export const YANDEX_METRIKA_ID: number | null = 113660805
export const GA4_ID: string | null = 'G-D3V577XS4T'

export const ANALYTICS = YANDEX_METRIKA_ID !== null || GA4_ID !== null
