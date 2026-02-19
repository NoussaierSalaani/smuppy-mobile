/**
 * Shared types for category-based selection configs (interests, expertise).
 * Both InterestsScreen and ExpertiseScreen use the same data shape.
 */

export interface CategoryItem {
  name: string;
  icon: string;
  color: string;
}

export interface CategoryConfig {
  category: string;
  icon: string;
  color: string;
  items: CategoryItem[];
}
