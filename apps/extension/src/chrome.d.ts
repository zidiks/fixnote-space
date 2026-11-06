/**
 * The few extension APIs this extension uses (Chrome MV3; Edge, Brave and other Chromium browsers
 * the same). Written out instead of depending on @types/chrome.
 */
declare namespace chrome {
  interface Event<F> {
    addListener(callback: F): void
  }

  namespace runtime {
    interface MessageSender {
      tab?: tabs.Tab
      url?: string
    }
    const onInstalled: Event<() => void>
    const onMessage: Event<
      (
        message: unknown,
        sender: MessageSender,
        sendResponse: (response: unknown) => void,
      ) => boolean | undefined
    >
    function sendMessage(message: unknown): Promise<unknown>
    function openOptionsPage(): Promise<void>
    function getManifest(): { version: string }
  }

  namespace storage {
    interface Area {
      get(keys: string | string[]): Promise<Record<string, unknown>>
      set(items: Record<string, unknown>): Promise<void>
      remove(keys: string | string[]): Promise<void>
    }
    const local: Area
    const sync: Area
  }

  namespace tabs {
    interface Tab {
      id?: number
      url?: string
      title?: string
    }
    function query(q: { active?: boolean; currentWindow?: boolean }): Promise<Tab[]>
    function create(p: { url: string }): Promise<Tab>
  }

  namespace scripting {
    interface Result<T> {
      result?: T
    }
    function executeScript<A extends unknown[], T>(p: {
      target: { tabId: number }
      func: (...args: A) => T
      args?: A
    }): Promise<Result<Awaited<T>>[]>
  }

  namespace contextMenus {
    interface OnClickData {
      menuItemId: string | number
      linkUrl?: string
      selectionText?: string
      pageUrl?: string
    }
    function create(p: {
      id: string
      title: string
      contexts: ('page' | 'link' | 'selection' | 'action')[]
    }): void
    function removeAll(): Promise<void>
    const onClicked: Event<(info: OnClickData, tab?: tabs.Tab) => void>
  }

  namespace commands {
    const onCommand: Event<(command: string, tab?: tabs.Tab) => void>
  }

  namespace action {
    const onClicked: Event<(tab: tabs.Tab) => void>
    function setBadgeText(p: { text: string; tabId?: number }): Promise<void>
    function setBadgeBackgroundColor(p: { color: string }): Promise<void>
    function setTitle(p: { title: string }): Promise<void>
  }

  namespace i18n {
    function getMessage(name: string, substitutions?: string | string[]): string
    function getUILanguage(): string
  }
}
