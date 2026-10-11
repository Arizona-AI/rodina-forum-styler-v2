# Rodina Forum Styler

Расширение для Chrome (MV3) и Firefox, которое полностью переодевает форум
[Rodina RolePlay](https://forum.rodina-rp.com/): 229 готовых тем, свой редактор палитр,
фоны (картинки, GIF, видео, градиенты, готовые сцены), эффекты, шрифты, курсоры, стекло
и тонкая настройка интерфейса XenForo. Интерфейс — на русском (EN-словарь полон, RU
остаётся основным языком).

* Vanilla TypeScript (strict) + esbuild — без фреймворков и рантайм-зависимостей
* 114 настроек, 16 разделов панели управления, 229 тем (из них 9 категорий и 4 режима)
* Попап — это и есть панель управления: все 16 разделов со сайдбаром прямо в странице расширения (отдельной вкладки настроек нет)
* Минимальные разрешения: `storage` + один host-паттерн форума
* 125 автоматических теста, аудиты i18n и мёртвых импортов в репозитории

## Установка

### Chrome / Edge / Brave (MV3)

```bash
npm install
npm run build          # собирает ./dist
```

1. Откройте `chrome://extensions`
2. Включите «Режим разработчика»
3. «Загрузить распакованное расширение» → папка `dist/`

Готовый архив для распространения: `npm run package` → `rodina-forum-styler-v1.4.1.zip`.

### Firefox 115+ (MV3)

```bash
npm run build:firefox  # кладёт manifest.firefox.json как dist/manifest.json
```

1. Откройте `about:debugging#/runtime/this-firefox`
2. «Загрузить временное дополнение…» → выберите `dist/manifest.json`

Отличия Firefox-манифеста: `background.scripts` вместо `service_worker`,
геcko-id и `strict_min_version: 115.0` — бандлы те же (цели сборки
`chrome110` + `firefox115`).

## Команды

| Команда | Что делает |
| --- | --- |
| `npm run build` | продакшен-сборка в `dist/` (минификация) |
| `npm run build:firefox` | то же, но с Firefox-манифестом |
| `npm run dev` | `--watch` + sourcemaps + без минификации |
| `npm run typecheck` | `tsc --noEmit` (strict + noUncheckedIndexedAccess) |
| `npm test` | сборка тестов + `node --test dist-tests/` (125 тестов) |
| `npm run package` | `dist/` → версионный zip |

Служебные аудиты (Node, без зависимостей):

```bash
node tools/audit-i18n.mjs     # каждый t("ключ") существует; EN = RU, плейсхолдеры
node tools/audit-imports.mjs  # нет неиспользуемых импортов
node tools/render-vars.mjs    # рендер compiled CSS темы в файл (smoke-тесты)
```

## Структура

```
src/
  shared/        цвет, валидаторы, timing, browser-абстракция, logger
  types/         типы Settings и ThemeTokens
  settings/      схема (114 настроек), дефолты, store (chrome.storage)
  theme/         compile/validate/resolve + библиотека из 229 тем
  storage/       экспорт/импорт бандлов и share-кодов
  forum/         реестр селекторов XenForo (автоадаптация к правкам форума)
  content/       контент-скрипт: main + 11 модулей + 7 CSS-файлов
  background/    service worker
  popup/         оболочка попапа (HTML+CSS, iframe на панель)
  options/       панель управления (секции, редактор, темы, AI, импорт/экспорт)
  i18n/          ru.ts + en.ts (по 204 ключа)
tests/           12 сьютов (125 тестов) — node:test через esbuild
docs/            CONTRACTS, ARCHITECTURE, FEATURES, SECURITY, BROWSER_COMPAT,
                 TESTING, AI, CHANGELOG
tools/           аудиты и утилиты сборки
```

## Документация

| Файл | Содержание |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | модули, потоки данных, инъекция стилей, live-sync |
| [docs/FEATURES.md](docs/FEATURES.md) | полный список функций по разделам |
| [docs/SECURITY.md](docs/SECURITY.md) | разрешения, санитизация, секреты, политика AI |
| [docs/BROWSER_COMPAT.md](docs/BROWSER_COMPAT.md) | поддерживаемые браузеры и различия |
| [docs/TESTING.md](docs/TESTING.md) | как запускать и что покрыто |
| [docs/AI.md](docs/AI.md) | локальная эвристика и удалённый провайдер |
| [docs/CONTRACTS.md](docs/CONTRACTS.md) | зафиксированные интерфейсы модулей |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | история версий |

## Как это работает

Контент-скрипт внедряет два `<style>` (`#rfs-base` со статикой форума и
`#rfs-vars` со скомпилированными переменными темы) и атрибуты-флаги
`data-rfs-*` на `<html>`. CSS реагирует на атрибуты и `--rfs-*` переменные,
поэтому переключение настройки не трогает элементы форума напрямую и
переживает любые обновления DOM. Все изменения приходят из
`chrome.storage.onChanged` (событийная модель, без поллинга) и применяются
во вкладках форума мгновенно.
