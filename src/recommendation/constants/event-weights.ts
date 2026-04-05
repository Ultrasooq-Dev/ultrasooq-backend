export const EVENT_WEIGHTS: Record<string, number> = {
  product_view: 1.0,
  product_view_repeat: 2.0,
  product_click_search: 1.5,
  product_click_recommendation: 2.0,
  product_search: 0.5,
  add_to_cart: 3.0,
  remove_from_cart: -1.5,
  checkout_start: 4.0,
  order_complete: 5.0,
  rfq_submitted: 4.5,
  wishlist_add: 2.5,
};

export const DECAY_LAMBDA = 0.03;

export function applyTimeDecay(weight: number, daysSinceEvent: number): number {
  return weight * Math.exp(-DECAY_LAMBDA * daysSinceEvent);
}
