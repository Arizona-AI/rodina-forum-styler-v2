/**
 * Declarative settings schema.
 *
 * The schema is the single source of truth for:
 *  - which settings exist and how they are grouped,
 *  - how each one is rendered (control type, options, limits),
 *  - user-facing labels/descriptions,
 *  - visibility conditions (a setting can depend on another),
 *  - per-setting reset (defaults come from DEFAULT_SETTINGS).
 *
 * The dashboard, popup and onboarding render themselves from this data.
 */
import type { Settings } from "../types/settings";

export type ControlType = "toggle" | "slider" | "select" | "color" | "text" | "url";

/** Sidebar sections of the dashboard (presentation only). */
export type SectionId =
  | "dashboard"
  | "themes"
  | "editor"
  | "appearance"
  | "background"
  | "effects"
  | "fonts"
  | "cursor"
  | "glass"
  | "forumUi"
  | "performance"
  | "accessibility"
  | "ai"
  | "io"
  | "experimental"
  | "advanced";

/** Logical groups — map to Settings subtrees. */
export type SettingsGroup =
  | "master"
  | "appearance"
  | "theme"
  | "background"
  | "glass"
  | "font"
  | "cursor"
  | "effects"
  | "transition"
  | "tweaks"
  | "performance"
  | "accessibility"
  | "advanced"
  | "ai"
  | "experimental";

export interface SelectOption {
  value: string | number;
  label: string;
}

/** Single visibility condition on another setting. */
export interface WhenCondition {
  key: string;
  equals?: string | number | boolean;
  notEquals?: string | number | boolean;
  /** Value must be one of these (OR). */
  oneOf?: ReadonlyArray<string | number | boolean>;
}

export interface SettingDef {
  /** Dotted path inside Settings, e.g. "effects.snow". */
  key: string;
  group: SettingsGroup;
  control: ControlType;
  label: string;
  description?: string;
  options?: SelectOption[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** Show the control only when another setting satisfies the condition. */
  when?: WhenCondition;
  /** Extra conditions (AND with `when`): all must hold. */
  whenAnd?: WhenCondition[];
  /** Marks values that must never be exported or logged (AI key). */
  secret?: boolean;
}

export const SETTINGS_SCHEMA: readonly SettingDef[] = [
  /* ---------------- master ---------------- */
  {
    key: "master.enabled",
    group: "master",
    control: "toggle",
    label: "Стилизация включена",
    description: "Глобальный переключатель: выключает всё воздействие расширения на форум.",
  },

  /* ---------------- appearance ---------------- */
  {
    key: "appearance.shellTheme",
    group: "appearance",
    control: "select",
    label: "Тема интерфейса расширения",
    description: "Оформление popup и панели управления.",
    options: [
      { value: "dark", label: "Тёмная" },
      { value: "light", label: "Светлая" },
      { value: "auto", label: "Как в системе" },
    ],
  },
  {
    key: "appearance.radiusMode",
    group: "appearance",
    control: "select",
    label: "Скругление углов",
    description: "Значение темы или собственный радиус для карточек, полей и меню.",
    options: [
      { value: "theme", label: "Из темы" },
      { value: "custom", label: "Своё" },
    ],
  },
  {
    key: "appearance.radius",
    group: "appearance",
    control: "slider",
    label: "Радиус, px",
    min: 0,
    max: 24,
    step: 1,
    unit: "px",
    when: { key: "appearance.radiusMode", equals: "custom" },
  },
  {
    key: "appearance.buttonShape",
    group: "appearance",
    control: "select",
    label: "Форма кнопок",
    options: [
      { value: "theme", label: "Из темы" },
      { value: "pill", label: "Капсула" },
      { value: "rounded", label: "Скруглённые" },
      { value: "square", label: "Прямоугольные" },
    ],
  },
  {
    key: "appearance.buttonStyle",
    group: "appearance",
    control: "select",
    label: "Стиль кнопок",
    options: [
      { value: "theme", label: "Из темы" },
      { value: "solid", label: "Заливка" },
      { value: "soft", label: "Мягкие" },
      { value: "outline", label: "Контур" },
    ],
  },
  {
    key: "appearance.avatarShape",
    group: "appearance",
    control: "select",
    label: "Форма аватаров",
    options: [
      { value: "theme", label: "Из темы" },
      { value: "circle", label: "Круг" },
      { value: "rounded", label: "Скруглённый квадрат" },
      { value: "square", label: "Квадрат" },
    ],
  },
  {
    key: "appearance.avatarScale",
    group: "appearance",
    control: "slider",
    label: "Размер аватаров",
    min: 80,
    max: 140,
    step: 5,
    unit: "%",
  },
  {
    key: "appearance.postStyle",
    group: "appearance",
    control: "select",
    label: "Оформление сообщений",
    options: [
      { value: "theme", label: "Из темы" },
      { value: "flat", label: "Плоские" },
      { value: "card", label: "Карточки" },
      { value: "bordered", label: "С рамкой" },
    ],
  },
  {
    key: "appearance.threadDensity",
    group: "appearance",
    control: "select",
    label: "Плотность списка тем",
    options: [
      { value: "theme", label: "Из темы" },
      { value: "compact", label: "Компактная" },
    ],
  },
  {
    key: "appearance.avatarStyle",
    group: "appearance",
    control: "select",
    label: "Обводка аватаров",
    description: "Акцентная обводка, свечение или покрас в цвет ника владельца.",
    options: [
      { value: "default", label: "Из темы" },
      { value: "accent", label: "Акцентная обводка" },
      { value: "glow", label: "Свечение" },
      { value: "paint-accent", label: "Покрас в цвет ника" },
      { value: "paint-glow", label: "Свечение в цвет ника" },
    ],
  },
  {
    key: "appearance.logoStyle",
    group: "appearance",
    control: "select",
    label: "Логотип форума",
    description: "Градиентная заливка логотипа цветами темы или собственная картинка.",
    options: [
      { value: "default", label: "Из темы" },
      { value: "accent-static", label: "Градиент акцентов" },
      { value: "accent-animated", label: "Анимированный градиент" },
      { value: "custom", label: "Своё изображение" },
    ],
  },
  {
    key: "appearance.logoUrl",
    group: "appearance",
    control: "url",
    label: "URL своего логотипа",
    description: "Прямая ссылка на изображение (png, svg, webp…).",
    when: { key: "appearance.logoStyle", equals: "custom" },
  },
  {
    key: "appearance.syncForumMode",
    group: "appearance",
    control: "toggle",
    label: "Синхронизировать светлую/тёмную тему форума",
    description:
      "Переключает стоковую вариацию XenForo под активную тему оформления (со сменой настройки аккаунта и перезагрузкой страницы).",
  },

  /* ---------------- background ---------------- */
  {
    key: "background.mode",
    group: "background",
    control: "select",
    label: "Тип фона",
    description: "Одноцветный, градиент, картинка/GIF, готовая сцена или видео.",
    options: [
      { value: "none", label: "Из темы" },
      { value: "color", label: "Цвет" },
      { value: "gradient", label: "Градиент" },
      { value: "image", label: "Картинка / GIF" },
      { value: "template", label: "Готовая сцена" },
      { value: "video", label: "Видео" },
    ],
  },
  {
    key: "background.color",
    group: "background",
    control: "color",
    label: "Цвет фона",
    when: { key: "background.mode", equals: "color" },
  },
  {
    key: "background.gradientPreset",
    group: "background",
    control: "select",
    label: "Градиент",
    when: { key: "background.mode", equals: "gradient" },
    options: [
      { value: "none", label: "Не выбран" },
      { value: "aurora", label: "Северное сияние" },
      { value: "sunset", label: "Закат" },
      { value: "ocean", label: "Океан" },
      { value: "violet", label: "Фиолетовый дым" },
      { value: "ember", label: "Угли" },
      { value: "forest", label: "Лесной туман" },
      { value: "candy", label: "Конфеты" },
      { value: "midnight", label: "Полночь" },
      { value: "custom", label: "Свой CSS-градиент" },
    ],
  },
  {
    key: "background.gradient",
    group: "background",
    control: "text",
    label: "Свой градиент",
    description: "Например: linear-gradient(135deg, #12121a, #d9204f)",
    when: { key: "background.gradientPreset", equals: "custom" },
    whenAnd: [{ key: "background.mode", equals: "gradient" }],
  },
  {
    key: "background.url",
    group: "background",
    control: "url",
    label: "Ссылка на медиа",
    description: "Прямая https-ссылка на изображение, GIF или MP4/WebM.",
    when: { key: "background.mode", equals: "image" },
  },
  {
    key: "background.url",
    group: "background",
    control: "url",
    label: "Ссылка на видео",
    description: "Прямая https-ссылка на MP4/WebM. Воспроизводится без звука и зациклено.",
    when: { key: "background.mode", equals: "video" },
  },
  {
    key: "background.template",
    group: "background",
    control: "select",
    label: "Сцена",
    description: "Встроенная картинка-фон: рисуется расширением, интернет не нужен.",
    when: { key: "background.mode", equals: "template" },
    options: [
      { value: "stars", label: "Звёзды" },
      { value: "fog", label: "Туман" },
      { value: "city", label: "Городская ночь" },
      { value: "grid", label: "Ретро-сетка" },
      { value: "waves", label: "Волны" },
    ],
  },
  {
    key: "background.overlayColor",
    group: "background",
    control: "color",
    label: "Цвет подложки",
    description: "Затемняющий слой поверх фона — гарантирует читаемость текста.",
  },
  {
    key: "background.dim",
    group: "background",
    control: "slider",
    label: "Затемнение фона",
    min: 0,
    max: 90,
    step: 5,
    unit: "%",
  },
  {
    key: "background.opacity",
    group: "background",
    control: "slider",
    label: "Прозрачность фона",
    min: 10,
    max: 100,
    step: 5,
    unit: "%",
  },
  {
    key: "background.blur",
    group: "background",
    control: "slider",
    label: "Размытие фона",
    min: 0,
    max: 20,
    step: 1,
    unit: "px",
  },
  {
    key: "background.size",
    group: "background",
    control: "select",
    label: "Размер",
    options: [
      { value: "cover", label: "Заполнить" },
      { value: "contain", label: "Вместить" },
      { value: "30%", label: "Мелкий повтор" },
      { value: "50%", label: "Средний повтор" },
      { value: "auto", label: "Авто" },
    ],
  },
  {
    key: "background.position",
    group: "background",
    control: "select",
    label: "Позиция",
    options: [
      { value: "center", label: "Центр" },
      { value: "top", label: "Сверху" },
      { value: "bottom", label: "Снизу" },
      { value: "left", label: "Слева" },
      { value: "right", label: "Справа" },
      { value: "top-left", label: "Сверху слева" },
      { value: "top-right", label: "Сверху справа" },
      { value: "bottom-left", label: "Снизу слева" },
      { value: "bottom-right", label: "Снизу справа" },
    ],
  },
  {
    key: "background.repeat",
    group: "background",
    control: "select",
    label: "Повторение",
    options: [
      { value: "no-repeat", label: "Без повтора" },
      { value: "repeat", label: "Плитка" },
      { value: "repeat-x", label: "По горизонтали" },
      { value: "repeat-y", label: "По вертикали" },
    ],
  },
  {
    key: "background.attachment",
    group: "background",
    control: "select",
    label: "Прикрепление",
    description: "Фиксированный фон не двигается при прокрутке.",
    options: [
      { value: "fixed", label: "Фиксированный" },
      { value: "scroll", label: "С прокруткой" },
    ],
  },
  {
    key: "background.videoAutoplay",
    group: "background",
    control: "toggle",
    label: "Автозапуск видео",
    when: { key: "background.mode", equals: "video" },
  },
  {
    key: "background.videoLoop",
    group: "background",
    control: "toggle",
    label: "Зациклить видео",
    when: { key: "background.mode", equals: "video" },
  },
  {
    key: "background.pauseWhenHidden",
    group: "background",
    control: "toggle",
    label: "Пауза видео при скрытии вкладки",
    description: "Экономит процессор и батарею, когда форум не виден.",
    when: { key: "background.mode", equals: "video" },
  },

  /* ---------------- glass ---------------- */
  {
    key: "glass.enabled",
    group: "glass",
    control: "toggle",
    label: "Glassmorphism",
    description: "Полупрозрачные блоки с размытием заднего плана.",
  },
  {
    key: "glass.blur",
    group: "glass",
    control: "slider",
    label: "Сила размытия",
    min: 0,
    max: 30,
    step: 1,
    unit: "px",
    when: { key: "glass.enabled", equals: true },
  },
  {
    key: "glass.opacity",
    group: "glass",
    control: "slider",
    label: "Прозрачность блоков",
    min: 5,
    max: 95,
    step: 5,
    unit: "%",
    when: { key: "glass.enabled", equals: true },
  },
  {
    key: "glass.borderOpacity",
    group: "glass",
    control: "slider",
    label: "Яркость рамок",
    min: 0,
    max: 100,
    step: 5,
    unit: "%",
    when: { key: "glass.enabled", equals: true },
  },
  {
    key: "glass.shadow",
    group: "glass",
    control: "slider",
    label: "Глубина теней",
    min: 0,
    max: 100,
    step: 5,
    unit: "%",
    when: { key: "glass.enabled", equals: true },
  },
  {
    key: "glass.onBlocks",
    group: "glass",
    control: "toggle",
    label: "Применять к блокам",
    when: { key: "glass.enabled", equals: true },
  },
  {
    key: "glass.onPosts",
    group: "glass",
    control: "toggle",
    label: "Применять к сообщениям",
    when: { key: "glass.enabled", equals: true },
  },
  {
    key: "glass.onNav",
    group: "glass",
    control: "toggle",
    label: "Применять к навигации",
    when: { key: "glass.enabled", equals: true },
  },
  {
    key: "glass.onMenus",
    group: "glass",
    control: "toggle",
    label: "Применять к меню",
    when: { key: "glass.enabled", equals: true },
  },

  /* ---------------- fonts ---------------- */
  {
    key: "font.family",
    group: "font",
    control: "select",
    label: "Шрифт",
    description: "Google Fonts или собственный шрифт по ссылке.",
    options: [
      { value: "theme", label: "Из темы" },
      { value: "system", label: "Системный" },
      { value: "Inter", label: "Inter" },
      { value: "Montserrat", label: "Montserrat" },
      { value: "Outfit", label: "Outfit" },
      { value: "Manrope", label: "Manrope" },
      { value: "Unbounded", label: "Unbounded" },
      { value: "Golos Text", label: "Golos Text" },
      { value: "Onest", label: "Onest" },
      { value: "Rubik", label: "Rubik" },
      { value: "Comfortaa", label: "Comfortaa" },
      { value: "Playfair Display", label: "Playfair Display" },
      { value: "JetBrains Mono", label: "JetBrains Mono" },
      { value: "Space Grotesk", label: "Space Grotesk" },
      { value: "Raleway", label: "Raleway" },
      { value: "Nunito", label: "Nunito" },
      { value: "Merriweather", label: "Merriweather" },
      { value: "Fira Code", label: "Fira Code" },
      { value: "Jost", label: "Jost" },
      { value: "Roboto", label: "Roboto" },
      { value: "Open Sans", label: "Open Sans" },
      { value: "custom", label: "Свой шрифт" },
    ],
  },
  {
    key: "font.customFamily",
    group: "font",
    control: "text",
    label: "Название семейства",
    description: "Имя, как в CSS, например: MyFont",
    when: { key: "font.family", equals: "custom" },
  },
  {
    key: "font.customSource",
    group: "font",
    control: "url",
    label: "Ссылка на файл шрифта",
    description: "Прямая https-ссылка на .woff2, .woff или .ttf.",
    when: { key: "font.family", equals: "custom" },
  },
  {
    key: "font.weight",
    group: "font",
    control: "select",
    label: "Насыщенность",
    options: [
      { value: 300, label: "Light (300)" },
      { value: 400, label: "Regular (400)" },
      { value: 500, label: "Medium (500)" },
      { value: 600, label: "Semibold (600)" },
      { value: 700, label: "Bold (700)" },
    ],
  },
  {
    key: "font.size",
    group: "font",
    control: "slider",
    label: "Размер текста",
    min: 80,
    max: 130,
    step: 5,
    unit: "%",
  },
  {
    key: "font.lineHeight",
    group: "font",
    control: "slider",
    label: "Высота строк",
    min: 1,
    max: 2,
    step: 0.05,
  },
  {
    key: "font.letterSpacing",
    group: "font",
    control: "slider",
    label: "Трекинг",
    min: -0.5,
    max: 2,
    step: 0.05,
    unit: "px",
  },
  {
    key: "font.scope",
    group: "font",
    control: "select",
    label: "Область применения",
    options: [
      { value: "off", label: "Выключен" },
      { value: "ui", label: "Только интерфейс" },
      { value: "all", label: "Вся страница" },
      { value: "allExceptPosts", label: "Везде, кроме сообщений" },
    ],
  },

  /* ---------------- cursor ---------------- */
  {
    key: "cursor.enabled",
    group: "cursor",
    control: "toggle",
    label: "Свой курсор",
    description: "Заменяет стандартный курсор на форуме.",
  },
  {
    key: "cursor.preset",
    group: "cursor",
    control: "select",
    label: "Пресет курсора",
    when: { key: "cursor.enabled", equals: true },
    options: [
      { value: "crosshair", label: "Прицел" },
      { value: "ring", label: "Кольцо" },
      { value: "dot", label: "Точка" },
      { value: "chevron", label: "Шеврон" },
      { value: "custom", label: "Свой (изображение)" },
    ],
  },
  {
    key: "cursor.customUrl",
    group: "cursor",
    control: "url",
    label: "Ссылка на курсор",
    description: "Прямая https-ссылка на PNG/GIF, до 128×128.",
    when: { key: "cursor.preset", equals: "custom" },
    whenAnd: [{ key: "cursor.enabled", equals: true }],
  },
  {
    key: "cursor.colorMode",
    group: "cursor",
    control: "select",
    label: "Цвет курсора",
    description: "«Из цветов темы» — автоматически берёт акцент активной темы.",
    when: { key: "cursor.enabled", equals: true },
    options: [
      { value: "theme", label: "Из цветов темы (авто)" },
      { value: "custom", label: "Свой цвет" },
    ],
  },
  {
    key: "cursor.color",
    group: "cursor",
    control: "color",
    label: "Свой цвет",
    when: { key: "cursor.colorMode", equals: "custom" },
    whenAnd: [{ key: "cursor.enabled", equals: true }],
  },
  {
    key: "cursor.size",
    group: "cursor",
    control: "slider",
    label: "Размер",
    min: 16,
    max: 64,
    step: 2,
    unit: "px",
    when: { key: "cursor.enabled", equals: true },
  },
  {
    key: "cursor.thickness",
    group: "cursor",
    control: "slider",
    label: "Толщина линий",
    min: 1,
    max: 6,
    step: 1,
    unit: "px",
    when: { key: "cursor.preset", oneOf: ["crosshair", "ring", "chevron"] },
    whenAnd: [{ key: "cursor.enabled", equals: true }],
  },

  /* ---------------- effects ---------------- */
  {
    key: "effects.snow",
    group: "effects",
    control: "toggle",
    label: "Снегопад",
    description: "Мягкие снежинки поверх фона.",
  },
  {
    key: "effects.particles",
    group: "effects",
    control: "toggle",
    label: "Геометрические частицы",
    description: "Летающие фигуры: круги, треугольники, квадраты.",
  },
  {
    key: "effects.fog",
    group: "effects",
    control: "toggle",
    label: "Космический туман",
    description: "Медленно дрейфующие цветные облака.",
  },
  {
    key: "effects.glow",
    group: "effects",
    control: "toggle",
    label: "Свечение ссылок и кнопок",
  },
  {
    key: "effects.animatedGradient",
    group: "effects",
    control: "toggle",
    label: "Анимированный градиент",
    description: "Плавно перетекающий фон страницы.",
  },
  {
    key: "effects.hoverLift",
    group: "effects",
    control: "toggle",
    label: "Подъём карточек при наведении",
  },
  {
    key: "effects.count",
    group: "effects",
    control: "slider",
    label: "Количество частиц",
    min: 20,
    max: 200,
    step: 10,
  },
  {
    key: "effects.speed",
    group: "effects",
    control: "slider",
    label: "Скорость эффектов",
    min: 0.2,
    max: 3,
    step: 0.1,
    unit: "×",
  },
  {
    key: "effects.opacity",
    group: "effects",
    control: "slider",
    label: "Яркость эффектов",
    min: 10,
    max: 100,
    step: 5,
    unit: "%",
  },
  {
    key: "effects.pauseWhenHidden",
    group: "effects",
    control: "toggle",
    label: "Останавливать на скрытой вкладке",
  },
  {
    key: "transition.style",
    group: "transition",
    control: "select",
    label: "Анимация появления страницы",
    description: "Срабатывает при загрузке и переходах между страницами форума.",
    options: [
      { value: "none", label: "Нет" },
      { value: "fade", label: "Плавное появление" },
      { value: "slideUp", label: "Сдвиг снизу" },
      { value: "fadeDown", label: "Опускание сверху" },
      { value: "slideLeft", label: "Сдвиг влево" },
      { value: "slideRight", label: "Сдвиг вправо" },
      { value: "scale", label: "Масштабирование" },
      { value: "zoomOut", label: "Отдаление" },
      { value: "rotateIn", label: "С поворотом" },
      { value: "flipX", label: "Флип по горизонтали" },
      { value: "flipY", label: "Флип по вертикали" },
      { value: "bounceUp", label: "Пружинистый подъём" },
      { value: "blur", label: "Размытие" },
      { value: "cascade", label: "Каскадный подъём блоков" },
    ],
  },
  {
    key: "transition.duration",
    group: "transition",
    control: "slider",
    label: "Длительность",
    min: 100,
    max: 900,
    step: 50,
    unit: "ms",
    when: { key: "transition.style", notEquals: "none" },
  },
  {
    key: "transition.stagger",
    group: "transition",
    control: "slider",
    label: "Шаг каскада",
    min: 0,
    max: 150,
    step: 5,
    unit: "ms",
    when: { key: "transition.style", equals: "cascade" },
  },

  /* ---------------- tweaks (forum UI) ---------------- */
  {
    key: "tweaks.hideFooter",
    group: "tweaks",
    control: "toggle",
    label: "Скрыть футер",
  },
  {
    key: "tweaks.hideSidebar",
    group: "tweaks",
    control: "toggle",
    label: "Скрыть боковую панель",
    description: "Боковые колонки на главной и в профилях.",
  },
  {
    key: "tweaks.hideAvatars",
    group: "tweaks",
    control: "toggle",
    label: "Скрыть аватары",
  },
  {
    key: "tweaks.hideNodeIcons",
    group: "tweaks",
    control: "toggle",
    label: "Скрыть иконки разделов",
  },
  {
    key: "tweaks.hideHeaderAlerts",
    group: "tweaks",
    control: "toggle",
    label: "Скрыть кнопки переписок и уведомлений в шапке",
    description: "Значки почты (переписки) и оповещений в верхней панели.",
  },
  {
    key: "tweaks.hideSubForums",
    group: "tweaks",
    control: "toggle",
    label: "Скрыть подфорумы в списках",
  },
  {
    key: "tweaks.hidePrefixes",
    group: "tweaks",
    control: "toggle",
    label: "Скрыть префиксы тем",
  },
  {
    key: "tweaks.hideUnreadIndicators",
    group: "tweaks",
    control: "toggle",
    label: "Скрыть индикаторы непрочитанного",
  },
  {
    key: "tweaks.headerSticky",
    group: "tweaks",
    control: "toggle",
    label: "Закрепить шапку",
    description: "Шапка остаётся видной при прокрутке.",
  },
  {
    key: "tweaks.hideUserBanners",
    group: "tweaks",
    control: "toggle",
    label: "Скрыть баннеры пользователей",
    description: "Баннеры-должности под никами в списках тем и сообщениях.",
  },
  {
    key: "tweaks.hideStyleVariation",
    group: "tweaks",
    control: "toggle",
    label: "Скрыть переключатель темы форума",
    description: "Кнопка светлой/тёмной вариации XenForo в шапке.",
  },
  {
    key: "tweaks.removeUserPaints",
    group: "tweaks",
    control: "toggle",
    label: "Убрать покрас ников",
    description: "Сбрасывает пользовательские цвета ников к цветам темы.",
  },
  {
    key: "tweaks.bannedStyle",
    group: "tweaks",
    control: "select",
    label: "Оформление заблокированных",
    options: [
      { value: "default", label: "Как на форуме" },
      { value: "red-paint", label: "Красный ник" },
      { value: "icon", label: "Значок рядом с ником" },
    ],
  },
  {
    key: "tweaks.animatedAvatars",
    group: "tweaks",
    control: "toggle",
    label: "Анимированные аватары",
    description: "Подгружает исходные GIF-аватары вместо статичных превью.",
  },
  {
    key: "tweaks.copySelectedLink",
    group: "tweaks",
    control: "toggle",
    label: "Кнопка «Ссылка» на выделение",
    description: "Копирует ссылку, открывающую сообщение на выделенный фрагмент.",
  },
  {
    key: "tweaks.hideSignatures",
    group: "tweaks",
    control: "toggle",
    label: "Скрыть подписи",
    description: "Подписи под сообщениями.",
  },
  {
    key: "tweaks.hideBreadcrumbs",
    group: "tweaks",
    control: "toggle",
    label: "Скрыть хлебные крошки",
  },
  {
    key: "tweaks.hideSectionLinks",
    group: "tweaks",
    control: "toggle",
    label: "Скрыть ссылки раздела",
    description: "Строка быстрых ссылок под шапкой раздела.",
  },
  {
    key: "tweaks.hideUserExtras",
    group: "tweaks",
    control: "toggle",
    label: "Скрыть доп. поля пользователей",
    description: "Дополнительная информация в блоке пользователя слева от сообщения.",
  },
  {
    key: "tweaks.hideYourPosts",
    group: "tweaks",
    control: "toggle",
    label: "Скрыть отметку «ваши темы»",
    description: "Значок у тем, в которых вы писали.",
  },
  {
    key: "tweaks.hidePostBg",
    group: "tweaks",
    control: "toggle",
    label: "Прозрачный фон лайтбокса",
    description: "Увеличенные изображения без подложки блока.",
  },
  {
    key: "tweaks.hideConversations",
    group: "tweaks",
    control: "toggle",
    label: "Скрыть кнопку переписок",
    description: "Значок переписок в правой части шапки.",
  },
  {
    key: "tweaks.navSearch",
    group: "tweaks",
    control: "select",
    label: "Поиск в шапке",
    options: [
      { value: "default", label: "Как на форуме" },
      { value: "hide", label: "Скрыть" },
      { value: "icon-only", label: "Только значок" },
    ],
  },
  {
    key: "tweaks.nodeIconStatus",
    group: "tweaks",
    control: "select",
    label: "Иконки форумов по статусу",
    description: "Приглушать иконки прочитанных форумов, оставляя цветными непрочитанные.",
    options: [
      { value: "default", label: "Как на форуме" },
      { value: "mute-read", label: "Приглушать прочитанные" },
    ],
  },
  {
    key: "tweaks.accentButtons",
    group: "tweaks",
    control: "toggle",
    label: "Акцентные кнопки",
    description: "Обычные кнопки получают цвет акцента темы (стиль Arizona).",
  },
  {
    key: "tweaks.accentThreadList",
    group: "tweaks",
    control: "toggle",
    label: "Акцентные названия тем",
    description: "Названия тем в списках окрашиваются в акцент темы.",
  },
  {
    key: "tweaks.accentThreadsMeta",
    group: "tweaks",
    control: "toggle",
    label: "Акцентная мета-информация",
    description: "Ссылки мета-строк списков тем (даты, разделы, участники).",
  },
  {
    key: "tweaks.accentPostAttribution",
    group: "tweaks",
    control: "toggle",
    label: "Акцентная строка авторства",
    description: "Ссылки «#», «Ссылка», «Пожаловаться» под сообщением.",
  },
  {
    key: "tweaks.accentNewBadge",
    group: "tweaks",
    control: "toggle",
    label: "Свечение бейджа «Новое»",
    description: "Акцентная подсветка непрочитанных тем в списках.",
  },

  /* ---------------- performance ---------------- */
  {
    key: "performance.mode",
    group: "performance",
    control: "select",
    label: "Режим производительности",
    description: "auto — умные ограничения; quality — без ограничений; battery — максимум экономии.",
    options: [
      { value: "auto", label: "Авто" },
      { value: "quality", label: "Качество" },
      { value: "battery", label: "Экономия" },
    ],
  },
  {
    key: "performance.fpsCap",
    group: "performance",
    control: "select",
    label: "Лимит FPS эффектов",
    options: [
      { value: 0, label: "Без лимита" },
      { value: 30, label: "30 FPS" },
      { value: 60, label: "60 FPS" },
    ],
  },
  {
    key: "performance.degradeWithVideo",
    group: "performance",
    control: "toggle",
    label: "Упрощать эффекты при видеофоне",
    description: "Снег/частицы отключаются, пока играет фоновое видео.",
  },

  /* ---------------- accessibility ---------------- */
  {
    key: "accessibility.reducedMotion",
    group: "accessibility",
    control: "select",
    label: "Учитывать «уменьшить движение»",
    description: "auto — следовать настройке системы; force — всегда отключать анимации.",
    options: [
      { value: "auto", label: "Следовать системе" },
      { value: "force", label: "Всегда отключать" },
    ],
  },
  {
    key: "accessibility.reduceTransitions",
    group: "accessibility",
    control: "toggle",
    label: "Отключить анимации переходов",
  },
  {
    key: "accessibility.focusRing",
    group: "accessibility",
    control: "toggle",
    label: "Яркая рамка фокуса",
    description: "Усиленная обводка при навигации с клавиатуры.",
  },
  {
    key: "accessibility.contrastBoost",
    group: "accessibility",
    control: "toggle",
    label: "Усиление контраста текста",
    description: "Поднимает яркость вторичного текста и рамок для читаемости.",
  },

  /* ---------------- AI ---------------- */
  {
    key: "ai.enabled",
    group: "ai",
    control: "toggle",
    label: "Включить AI-инструменты",
    description: "Панель AI в панели управления. Данные уходят только при явном согласии.",
  },
  {
    key: "ai.provider",
    group: "ai",
    control: "select",
    label: "Провайдер",
    description: "local — встроенная эвристика (офлайн, без ИИ); openai — совместимый API по вашему ключу.",
    when: { key: "ai.enabled", equals: true },
    options: [
      { value: "local", label: "Локальная эвристика" },
      { value: "openai", label: "OpenAI-совместимый" },
    ],
  },
  {
    key: "ai.endpoint",
    group: "ai",
    control: "url",
    label: "API endpoint",
    description: "Например: https://api.openai.com/v1",
    when: { key: "ai.provider", equals: "openai" },
    whenAnd: [{ key: "ai.enabled", equals: true }],
  },
  {
    key: "ai.model",
    group: "ai",
    control: "text",
    label: "Модель",
    when: { key: "ai.provider", equals: "openai" },
    whenAnd: [{ key: "ai.enabled", equals: true }],
  },
  {
    key: "ai.allowRemote",
    group: "ai",
    control: "toggle",
    label: "Разрешить отправку палитры на endpoint",
    description: "Отправляются только цвета текущей темы — без данных аккаунта, cookies и сообщений.",
    when: { key: "ai.provider", equals: "openai" },
    whenAnd: [{ key: "ai.enabled", equals: true }],
  },

  /* ---------------- experimental ---------------- */
  {
    key: "experimental.enabled",
    group: "experimental",
    control: "toggle",
    label: "Включить экспериментальные функции",
  },
  {
    key: "experimental.themeCrossfade",
    group: "experimental",
    control: "toggle",
    label: "Плавная смена тем",
    description: "Короткий кросс-фейд цветов при переключении темы.",
    when: { key: "experimental.enabled", equals: true },
  },
  {
    key: "experimental.autoDim",
    group: "experimental",
    control: "toggle",
    label: "Авто-затемнение фона",
    description: "Докручивает затемнение, пока контраст текста с фоном не станет приемлемым.",
    when: { key: "experimental.enabled", equals: true },
  },
  {
    key: "experimental.pauseButton",
    group: "experimental",
    control: "toggle",
    label: "Кнопка паузы на форуме",
    description: "Плавающая кнопка быстрого включения/выключения стилизации на странице.",
    when: { key: "experimental.enabled", equals: true },
  },

  /* ---------------- advanced ---------------- */
  {
    key: "advanced.debugMode",
    group: "advanced",
    control: "toggle",
    label: "Режим отладки",
    description: "Подробные логи в консоли, статус селекторов и отчёт для диагностики.",
  },
];
