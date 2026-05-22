# Permission Justifications - Quick TAB Launcher by Bonn

Justifications for the AMO submission form, one per requested permission.

---

## tabs

Used to query open tabs by title and URL when the user types a search query. Also used to switch to a selected tab, create new tabs for bookmark/history navigation, close tabs, and detect duplicate tabs. The extension reads tab metadata (title, URL, favicon) but does not modify page content.

## bookmarks

Used to search the user's bookmarks by title and URL when the user types a search query with at least 2 characters. Results are displayed in the launcher panel so the user can open a bookmarked page. The extension only reads bookmarks, it never creates, modifies, or deletes them.

## history

Used to search browsing history from the last 30 days (configurable) when the user types a search query. History results include title, URL, visit count, and last visit time. The extension only reads history, it never modifies or deletes entries.

## sessions

Used to retrieve recently closed tabs so the user can restore them from the launcher panel. The extension reads session data to display a "recent tabs" section when the launcher opens with an empty search field.

## storage

Used to persist user configuration preferences (number of results to show, debounce timing, history range, language, full-text search toggle) in browser.storage.local. No personal or browsing data is stored, only settings values.

## activeTab

Used to send a message to the active tab's content script when the user presses the keyboard shortcut or clicks the toolbar button. This message toggles the launcher overlay visibility. Also used to detect if the current page is a privileged URL (about:, moz-extension:) where content scripts cannot run, in which case a popup fallback is used instead.

## Host permission: <all_urls>

The extension injects a content script into every web page to create the launcher overlay UI. The overlay is a panel rendered inside a closed Shadow DOM, isolated from the page. Without this permission, the launcher could not appear on arbitrary pages. The content script does not read or modify page content (unless the user explicitly enables optional full-text search). No data is sent externally.
