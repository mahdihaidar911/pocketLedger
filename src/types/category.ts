export type CategoryKind =
  | 'expense'
  | 'income';

export interface Category {
  id: string;

  name: string;

  kind: CategoryKind;

  icon: string | null;

  isDefault: boolean;

  isActive: boolean;

  createdAt: string;

  updatedAt: string;
}

export interface CreateCategoryInput {
  name: string;
  kind: CategoryKind;
  icon?: string | null;
}

// Kind is deliberately immutable: existing transaction types must remain valid.
export interface UpdateCategoryInput {
  name: string;
  icon: string | null;
}
