/** Supabase keys are preserved. Historical/unassigned categories use Other. */
export const TEA_CATEGORY_ICONS = Object.freeze({
  black:'psychiatry', green:'potted_plant', herbal:'local_florist',
  fruit:'nutrition', rooibos:'spa', other:'category',
});
export function getTeaCategoryIcon(category) {
  return Object.prototype.hasOwnProperty.call(TEA_CATEGORY_ICONS, category)
    ? TEA_CATEGORY_ICONS[category] : TEA_CATEGORY_ICONS.other;
}
