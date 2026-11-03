/**
 * Lab-only settings. Nothing is persisted or written back to the global theme.
 */
export const COMPONENTS = Object.freeze(['TextField', 'Select', 'Autocomplete', 'Button']);
export const PALETTE_COLORS = Object.freeze([
  'primary', 'secondary', 'success', 'info', 'warning', 'error',
]);

const fieldStates = Object.freeze(['default', 'focused', 'disabled', 'error', 'required', 'readOnly']);

export const COMPONENT_DEFINITIONS = Object.freeze({
  TextField: Object.freeze({
    variants: Object.freeze(['outlined', 'filled', 'standard']),
    states: fieldStates,
    defaultHeight: 48,
    label: 'Tea name',
  }),
  Select: Object.freeze({
    variants: Object.freeze(['outlined', 'filled', 'standard']),
    states: fieldStates,
    defaultHeight: 48,
    label: 'Tea category',
  }),
  Autocomplete: Object.freeze({
    variants: Object.freeze(['outlined', 'filled', 'standard']),
    states: fieldStates,
    defaultHeight: 48,
    label: 'Choose a tea',
  }),
  Button: Object.freeze({
    variants: Object.freeze(['contained', 'outlined', 'text']),
    states: Object.freeze(['default', 'focused', 'disabled', 'loading']),
    defaultHeight: 66,
    label: 'Start timer',
  }),
});

export function createDefaults() {
  return Object.fromEntries(COMPONENTS.map(name => [
    name,
    { variant: COMPONENT_DEFINITIONS[name].variants[0],
      height: COMPONENT_DEFINITIONS[name].defaultHeight,
      radius: 6,
      color: 'primary',
      state: 'default' },
  ]));
}

export function applyLabSetting(current, name, key, value) {
  if (!COMPONENT_DEFINITIONS[name]) return current;
  const definition = COMPONENT_DEFINITIONS[name];
  const allowed = ['variant', 'height', 'radius', 'color', 'state'];
  if (!allowed.includes(key)) return current;
  if (key === 'variant' && !definition.variants.includes(value)) return current;
  if (key === 'state' && !definition.states.includes(value)) return current;
  if (key === 'color' && !PALETTE_COLORS.includes(value)) return current;
  if (key === 'height' && (!Number.isInteger(value) || value < 36 || value > 88)) return current;
  if (key === 'radius' && (!Number.isInteger(value) || value < 0 || value > 24)) return current;
  return { ...current, [name]: { ...current[name], [key]: value } };
}
