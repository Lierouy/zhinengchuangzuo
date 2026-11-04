/**
 * Typeahead trigger characters.
 *
 * Multiple typeahead plugins can be mounted on the same editor, so the trigger
 * characters must be declared in one place. A plugin that owns a trigger must
 * explicitly yield when another trigger is active instead of relying on
 * registration order.
 */
export const MENTION_TRIGGER = '@'
export const TEMPLATE_TRIGGER = '/'

/** All trigger characters that can open a typeahead menu. */
const ALL_TRIGGERS = [MENTION_TRIGGER, TEMPLATE_TRIGGER] as const

/**
 * Returns true when `text` currently ends with a trigger owned by another
 * plugin, meaning the caller should not open its own menu.
 */
export function isOtherTriggerActive(
  text: string,
  ownTrigger: string,
): boolean {
  return ALL_TRIGGERS.some(
    (trigger) =>
      trigger !== ownTrigger &&
      new RegExp(`(^|\\s|\\()${escapeRegExp(trigger)}[^\\s]*$`).test(text),
  )
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
