# CRM Search Fix

Chrome extension that blocks CRM fields from launching automatic search when focus leaves a field. Search can be triggered manually with Enter.

## Install

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this folder: `/Users/a74/Documents/New project 2`.

## Use

1. Open the website with the unwanted automatic search.
2. Click the extension icon.
3. Click `Включить для этого сайта`.
4. Keep the default selector or edit it if your CRM field names are different.
5. The default selector is `input[name="phone"], input[name="fio"], input[name="email"], input[name="created"], input[name="user_id"]`.
6. Keep `Блокировать уход из поля: blur, focusout, change` enabled.
7. `Запускать поиск по Enter` is enabled by default and runs CRM search manually.

If the site uses a non-standard field, set `Поле, которое запускает поиск` in the popup to a CSS selector for that field.

## CRM diagnostics

If search still starts:

1. Enable `Писать диагностику в консоль страницы`.
2. Open DevTools on the CRM page.
3. Use the phone field and click another field.
4. Look for `[CRM Search Fix] blocked field blur`, `focusout`, or `change` messages.
5. When Enter search is enabled, look for `[CRM Search Fix] enter search trigger`.

If those messages appear but the search still starts, the CRM is probably launching search through a request after `input` or through its own internal state. In that case, the next fix is to block the specific network request URL.
