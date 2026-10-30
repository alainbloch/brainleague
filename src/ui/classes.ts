import { categoryResults } from './categoryResults.js';
import { tutorialSections } from './tutorialSections.js';

/**
 * Component class strings ported from rubyminer-core's UiHelper (ui_helper.rb)
 * and its Tailwind v4 design-token system (application.css). Every colour is a
 * token utility (bg-surface, text-ink, border-edge, bg-accent, ...) so changing
 * the theme never touches a template.
 *
 * Tailwind v4 syntax (min-h-11, rounded-pill, size-6) is kept verbatim so CSS
 * can be shared with rubyminer-core.
 */

const BASE = {
  touchTargets:
    'ds-button inline-flex items-center justify-center gap-2 font-medium rounded-md cursor-pointer ' +
    'transition-colors duration-150 active:scale-[0.98] ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ' +
    'disabled:opacity-[.55] disabled:cursor-not-allowed disabled:active:scale-100',
};

export const button = {
  base: BASE.touchTargets,
  variants: {
    primary:
      'ds-button-primary bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-press',
    secondary: 'bg-fill text-ink border border-edge hover:bg-fill-hover',
    tertiary: 'text-ink-soft hover:text-ink hover:bg-fill',
    danger: 'border border-danger text-danger hover:bg-fill-hover',
  },
  sizes: {
    sm: 'ds-button-sm px-3 text-xs min-h-11 sm:min-h-7',
    md: 'ds-button-md px-4 text-sm min-h-11 sm:min-h-9',
  },
};

export function buttonClass(
  variant: keyof typeof button.variants | string = 'primary',
  size: keyof typeof button.sizes | string = 'md',
): string {
  return [
    button.base,
    button.variants[variant as keyof typeof button.variants] || button.variants.primary,
    button.sizes[size as keyof typeof button.sizes] || button.sizes.md,
  ].join(' ');
}

export const inputClass =
  'ds-input block w-full rounded-md border border-edge bg-surface text-ink placeholder:text-muted ' +
  'px-3 py-2 text-sm min-h-11 sm:min-h-9 transition-colors duration-150 ' +
  'focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ' +
  'disabled:opacity-[.55]';

export const tones = {
  neutral: {
    badge: 'bg-fill text-ink-soft border-edge',
    alert: 'bg-fill text-ink-soft border-edge',
  },
  accent: {
    badge: 'bg-accent text-on-accent border-transparent',
    alert: 'bg-accent text-on-accent border-transparent',
  },
  ok: { badge: 'text-ok border-ok', alert: 'text-ok border-ok' },
  warn: { badge: 'text-warn border-warn', alert: 'text-warn border-warn' },
  danger: { badge: 'text-danger border-danger', alert: 'text-danger border-danger' },
  info: { badge: 'text-info border-info', alert: 'text-info border-info' },
};

export type Tone = keyof typeof tones;

export function badgeClass(tone: Tone | string = 'neutral'): string {
  return `ds-badge inline-flex items-center gap-1 rounded-pill border px-2.5 py-0.5 text-xs font-medium ${
    (tones[tone as Tone] || tones.neutral).badge
  }`;
}

export function alertClass(tone: Tone | string = 'neutral'): string {
  return `rounded-md border px-4 py-3 text-sm font-medium bg-surface ${
    (tones[tone as Tone] || tones.neutral).alert
  }`;
}

export const cardClass = 'ds-card min-w-0 bg-surface border border-edge rounded-lg p-6 text-ink';
export const fieldWrapperClass = 'grid gap-1.5';
export const labelClass = 'text-sm font-medium text-ink-soft';

/** All helpers exposed to templates via `ui`. */
export const uiHelpers = {
  tutorialSections,
  categoryResults,
  buttonClass,
  inputClass,
  badgeClass,
  alertClass,
  cardClass,
  fieldWrapperClass,
  labelClass,
};
