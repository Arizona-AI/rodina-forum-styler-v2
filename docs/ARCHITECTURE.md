# Архитектура

Единый принцип: **данные живут в `chrome.storage`, а всё остальное — производное**.
Ни контент-скрипт, ни панель управления не хранят состояние само по себе; каждый
консьюмер подписывается на события хранилища и перерисовывает себя.

```
shared/  types/  settings/  theme/  storage/  i18n/   ← чистая логика, тестируется в node
    │
    ├── content/    контент-скрипт форума (main + модули + CSS)
    ├── popup/      всплывающая панель
    ├── options/    панель управления (16 секций)
    └── background/ service worker (клик по иконке, onInstalled)
```

## Слои

| Слой | Ответственность | Знает о браузере |
| --- | --- | --- |
| `shared/` | цвет (WCAG-контраст), валидаторы, timing (debounce/rAF), `browser.ts`, `logger` | только `browser.ts` |
| `settings/` | схема 114 настроек, дефолты, валидация/коэрция, store | через `shared/browser` |
| `theme/` | `compile` (токены → `:root` CSS), `validate` (санитизация), `resolve` (каталог), библиотека 229 тем | нет |
| `storage/` | бандл экспорта, share-коды, миграции, импорт с валидацией | через `shared/browser` |
| `forum/` | реестр селекторов XenForo + `auditSelectorHealth` | DOM |

Правило: `chrome.*` встречается в `shared/browser.ts` и в entry-точках,
которые гарантированно исполняются в контексте расширения (service worker,
`onMessage` контент-скрипта). Остальной код работает через абстракцию —
поэтому панель честно деградирует при отсутствии API (smoke-тесты в
обычном браузере), а не падает.

## Хранилище

| Ключ | Содержимое |
| --- | --- |
| `rfs.settings` | `Settings` (включает `theme.activeId`, `theme.favorites`, `theme.recent`) |
| `rfs.meta` | `ExtensionMeta` — `schemaVersion`, признак онбординга |
| `rfs.customThemes` | пользовательские `CustomTheme[]` (лимит 100) |
| `rfs.editorDraft` | черновик редактора (`previewOnly` — живой предпросмотр) |
| `rfs.aiSecrets` | `{ apiKey }` — отдельный ключ, **никогда** не покидает устройство |

Поток записи: `ctx.update(key, value)` → `coerceValue`/`validateSettings`
(по схеме) → `storageSet` → `chrome.storage.onChanged` → все подписчики.
Нет второго канала уведомления: **storage-события — единственный источник
правды**, поэтому «сохранил в одном месте — обновилось везде» верно по
построению, а не по совпадению.

## Контент-скрипт

`content/main.ts` оркестрирует `ContentModule`-объекты
(`{ id, init(ctx), apply(ctx), destroy() }`):

| Модуль | Что делает |
| --- | --- |
| `backgroundLayer` | слой фона: цвет/градиент/картинка/GIF/видео/готовые сцены + затемнение |
| `effectsCanvas` | снег/частицы/туман на canvas через `createFrameLoop` |
| `cursor` | пресеты и собственные курсоры (инлайн-переменные) |
| `fonts` | Google Fonts `<link>`, свои шрифты, масштаб/вес |
| `transitions` | появление страницы, stagger, кроссфейд темы |
| `pauseButton` | плавающая кнопка паузы (experimental) |

Шаг применения (`scheduleApply`, debounce 90 мс):

1. `resolveActiveTokens()` — активные токены темы (builtin | пользовательская | черновик)
2. `styleHost.setThemeCss(compileThemeVariables(tokens))` → `<style id="rfs-vars">`
3. `applyFlags(settings, host)` → атрибуты `data-rfs-*` и инлайн-переменные на `<html>`
4. `module.apply(ctx)` для каждого модуля

`buildFlagPlan` — чистая функция «настройки → атрибуты/переменные»,
покрыта тестами: значения клампятся одинаково (например, радиус 0…24 и в
атрибуте, и в `--rfs-ui-radius`).

CSS в `content/styles/` (7 файлов, вшитых в бандл как строки через
`loader: { ".css": "text" }`) реагирует только на `data-rfs-*`/`--rfs-*`:
переключение настройки не трогает элементы форума напрямую и переживает
обновления DOM. Селекторы берутся из реестра (`forum/selectors.ts`), а не
пишутся в модулях: правка форума ломает максимум один файл, а
`auditSelectorHealth()` показывает в отчёте отладки, что именно отвалилось.

## Панель управления

```
options.ts   оболочка: сайдбар, hash-роутер, PanelContext, live-sync
sections.ts  реестр 16 секций (kind: settings | custom)
panels/*     dashboard, themes, editor, io, aiPanel, advanced
ui/*         dom (h/icon), controls (schema-driven rows), toast, modal, themeBits
```

Ключевые свойства:

* **Строки рисуются из схемы** — `renderSettingsSection` материализует
  `SettingDef` в ряды управления; новая настройка = запись в `schema.ts`.
* **Строки синхронизируются на месте**: при `onChanged` каждый ряд вызывает
  свой `sync()` — фокус и скролл не теряются, ре-рендера нет.
* **`PanelContext`** — единственная панельная поверхность: `settings()`,
  `update`, `patch`, `refresh`, `toast`, `confirm`, `openSection`,
  `resetAll(keepThemes)`.
* **Редактор тем** живёт поверх `rfs.editorDraft`: правки токенов
  (debounce 250 мс) сразу уезжают на форум при включённом
  «Показывать на форуме» (`previewOnly`), undo/redo — стеки на 50 шагов,
  «Сохранить изменения» доступен только для пользовательских баз (базовые
  темы библиотеки — read-only, «Сохранить как тему» создаёт копию).

## Темы

`ThemeDefinition = { id, name, description, category, mode, tokens }`.
Токены компилируются `compileThemeVariables` в блок `:root` с повторной
санитизацией каждого значения — даже вручную подредактированный JSON не
может внедрить ничего, кроме цветов и длин. `validate.ts` дополнительно
чинит контраст (`ensureContrast` ищет рабочее направление и проверяет
итоговый hex, а не float-кандидат).

## i18n

`t(key, vars?)`: активная локаль → RU → сам ключ. `{name}`-плейсхолдеры
интерполируются. Словари полны и симметричны (204/204, проверяется и
аудитом, и тестами на паритет плейсхолдеров). Подписи строк схемы —
готовый русский текст по замыслу (см. заголовок `en.ts`).

## Сборка

`build.mjs`: три entry (`content`, `background`, `options`) →
IIFE-бандлы в `dist/`, статика (manifest, html, css, иконки) копируется
отдельно. Попап — статическая `popup.html` c iframe на `options.html?popup=1`. Флаги: `--watch`, `--dev`, `--tests`, `--zip`, `--firefox`.
Цели esbuild — `chrome110` + `firefox115`, один бандл на оба браузера.
