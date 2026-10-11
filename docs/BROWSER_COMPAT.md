# Совместимость с браузерами

## Поддерживаемые

| Браузер | Версия | Манифест | Статус |
| --- | --- | --- | --- |
| Chrome | 110+ | MV3, `background.service_worker` | основная цель, проверен вручную |
| Edge / Brave / Opera | на Chromium 110+ | как Chrome | ожидается (тот же движок) |
| Firefox | 115+ (ESR) | MV3, `background.scripts`, gecko-id | поддерживается сборкой `--firefox` |

Цели esbuild — `["chrome110", "firefox115"]`, бандлы **одни и те же** для всех
браузеров: различие живёт только в манифесте.

## Два манифеста

| | `manifest.json` (Chrome) | `manifest.firefox.json` (Firefox) |
| --- | --- | --- |
| background | `"service_worker": "background.js"` | `"scripts": ["background.js"]` (event page) |
| gecko-id / min | — | `browser_specific_settings.gecko`, `strict_min_version: 115.0` |
| остальное | идентично | идентично |

`npm run build` кладёт первый, `npm run build:firefox` — второй
(как `dist/manifest.json`). Флаг учитывается и в `--watch`/`--zip`.

## API-портиры

Весь доступ к WebExtension-API идёт через `shared/browser.ts`:

* `api()` возвращает `chrome` только если это контекст расширения **и**
  у объекта есть `storage` (в обычных страницах `window.chrome` существует,
  но `chrome.storage` — нет);
* `extensionVersion()` вне расширения возвращает `"dev"`, а не бросает;
* `subscribeSettings()` при недоступном API пишет warn и подписывается в
  no-op — панель не падает, а честно показывает состояние.

Это делает расширение устойчивым к «полуживому» окружению и позволяет
громко открывать `options.html`/`popup.html` в обычном браузере для
smoke-тестов (см. [TESTING.md](TESTING.md)).

## Используемые API и их наличие

| API | Chrome 110 | Firefox 115 | Замечание |
| --- | --- | --- | --- |
| `chrome.storage.onChanged` + `local` | ✓ | ✓ (`browser` alias не нужен — код работает через `chrome.*`, Firefox его тоже предоставляет) | единственный канал live-sync |
| MV3 service worker / event page | ✓ | event page через `background.scripts` | инициализация идемпотентна (`ensureOnInstalled`) |
| content script в манифесте | ✓ | ✓ | `run_at: document_idle`, `all_frames: false` |
| `chrome.runtime.onMessage` | ✓ | ✓ | ответы `sendResponse` с возвратом `true` |
| CSS custom properties, `:root`-инъекция | ✓ | ✓ | ядро стилизации |
| `<link rel=stylesheet>` для Google Fonts | ✓ | ✓ | opt-in |
| `<video autoplay muted loop playsinline>` | ✓ | ✓ | фон-видео; автоплей может блокироваться политикой — это не ошибка расширения |
| canvas 2D + `requestAnimationFrame` | ✓ | ✓ | эффекты; есть FPS-cap и автопауза скрытой вкладки |
| `requestIdleCallback` | ✓ | ✓ (с недавних версий) | в `scheduleIdle` есть fallback на `setTimeout(0)` |
| `localStorage` в контент-скрипте (легаси-фолбэк форума) | ✓ | ✓ | используется только как fallback чтения настроек форумных уведомлений |
| `optional_host_permissions` | ✓ | ✓ | только для удалённого AI-endpoint |

## Известные отличия

* **Google Fonts в Firefox**: внешний `<link>` грузится штатно; если
  пользователь выбрал «свой источник», URL валидируется одинаково.
* **Фон-видео**: на mobile-версиях и при экономии батареи autoplay может
  быть запрещён браузером — модуль честно отключает видео и сообщает об этом
  в статусе.
* **Иконки панели**: SVG-иконки в UI строятся через `createElementNS`
  (не через `innerHTML`) — работает везде без исключений.
* **Firefox и `chrome.*`**: Firefox 109+ предоставляет namespace `chrome`
  для Promise-style API; код не использует `browser.*` напрямую, поэтому
  мост не требуется.

## Проверка в других браузерах

1. `npm run build:firefox`
2. `about:debugging#/runtime/this-firefox` → «Загрузить временное
   дополнение…» → `dist/manifest.json`.
3. Форум открывается, панель доступна через «Расширения» → RFS.

Для Chromium: `npm run build` → `chrome://extensions` → «Загрузить
распакованное расширение» → `dist/`.
