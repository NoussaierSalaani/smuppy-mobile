/**
 * Builder helpers for category-based selection configs (interests, expertise).
 * Eliminates repetitive object-literal boilerplate across config files.
 */

import type { CategoryConfig, CategoryItem } from './category-types';

/** Create a CategoryItem with positional args instead of verbose object literal. */
export const item = (name: string, icon: string, color: string): CategoryItem => ({
  name,
  icon,
  color,
});

/** Create a CategoryConfig with positional args instead of verbose object literal. */
export const cat = (
  category: string,
  icon: string,
  color: string,
  items: CategoryItem[],
): CategoryConfig => ({
  category,
  icon,
  color,
  items,
});
