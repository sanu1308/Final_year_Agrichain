const PRODUCT_IMAGE_FALLBACKS = [
  {
    matches: ['mustard', 'sarson'],
    image: 'https://images.unsplash.com/photo-1509358271058-acd22cc93898?w=800&auto=format&fit=crop&q=80',
  },
  {
    matches: ['mango'],
    image: 'https://images.unsplash.com/photo-1553279768-865429fa0078?w=800&auto=format&fit=crop&q=80',
  },
  {
    matches: ['wheat'],
    image: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800&auto=format&fit=crop&q=80',
  },
  {
    matches: ['rice', 'basmati'],
    image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=800&auto=format&fit=crop&q=80',
  },
];

const CATEGORY_IMAGE_FALLBACKS = {
  fruits: 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=800&auto=format&fit=crop&q=80',
  grains: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=800&auto=format&fit=crop&q=80',
  vegetables: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=800&auto=format&fit=crop&q=80',
  pulses: 'https://images.unsplash.com/photo-1515543904379-3d757afe72e4?w=800&auto=format&fit=crop&q=80',
  spices: 'https://images.unsplash.com/photo-1532336414038-cf19250c5757?w=800&auto=format&fit=crop&q=80',
};

export function getProductImage(productName = '', category = '') {
  const searchText = `${productName} ${category}`.toLowerCase();
  const productMatch = PRODUCT_IMAGE_FALLBACKS.find(({ matches }) =>
    matches.some((term) => searchText.includes(term))
  );

  if (productMatch) return productMatch.image;

  return CATEGORY_IMAGE_FALLBACKS[category.toLowerCase()] || null;
}