/**
 * Fancy a Cuppa V3 — category artwork.
 *
 * Edit the independent entries below when the final Figma positions
 * arrive. The cropped area is controlled by objectFit + positionX/positionY
 * + scale within the fixed 192px image viewport. Nothing in TeaCard needs
 * to change for these adjustments.
 *
 * These paths point only to original PNGs supplied by the designer.
 * Product-specific photo_url is intentionally never used for rendering.
 */
export const CATEGORY_IMAGE_CONFIG = Object.freeze({
  black:  Object.freeze({ filename:'black-tea-new.png',  objectFit:'cover', scale:1, positionX:50, positionY:50 }),
  green:  Object.freeze({ filename:'green-tea-new.png',  objectFit:'cover', scale:1, positionX:50, positionY:50 }),
  fruit:  Object.freeze({ filename:'fruit-inusion-new.png',  objectFit:'cover', scale:1, positionX:50, positionY:50 }),
  rooibos:Object.freeze({ filename:'rooibos-tea-new.png', objectFit:'cover', scale:1, positionX:50, positionY:50 }),
  herbal: Object.freeze({ filename:'herbal-infusion-new.png', objectFit:'cover', scale:1, positionX:50, positionY:50 }),
});

export const CATEGORY_BACKGROUND = '#E8FBCB';

const SUPABASE_CATEGORIES = Object.freeze([
  'black','green','white','oolong','yellow','dark','pu_erh',
  'herbal','fruit','rooibos','mate','other',
]);

/** Confirmed keys of public.teas.category; unassigned categories use Soft Lime. */
export const SUPPORTED_TEA_CATEGORIES = SUPABASE_CATEGORIES;

function appBaseUrl() {
  // Vite injects BASE_URL in the browser; Node tests may omit import.meta.env.
  return import.meta.env?.BASE_URL || '/';
}

export function getCategoryVisual(category, baseUrl=appBaseUrl()) {
  const image = CATEGORY_IMAGE_CONFIG[category];
  if (!image) {
    return {
      category:category || 'other', kind:'colour',
      backgroundColor:CATEGORY_BACKGROUND,
      imageUrl:null, objectFit:null, scale:1, positionX:50, positionY:50,
    };
  }
  const prefix=String(baseUrl).endsWith('/') ? String(baseUrl) : String(baseUrl)+'/';
  return {
    category,kind:'image',
    backgroundColor:CATEGORY_BACKGROUND,
    imageUrl:prefix+'images/categories/'+image.filename,
    objectFit:image.objectFit,
    scale:image.scale, positionX:image.positionX, positionY:image.positionY,
  };
}
