import type {
    TransactionListItem,
} from './transaction';

import type {
    TransferListItem,
} from './transfer';

export type ActivityTypeFilter = 'all' | 'expense' | 'income' | 'transfer';

export interface ActivityFilters {
  searchText?: string;
  type?: ActivityTypeFilter;
  accountId?: string | null;
  startIso?: string;
  // Exclusive upper bound: the UI includes the entire selected end date.
  endIso?: string;
}

export interface ActivityCursor {
  occurredAt: string;
  createdAt: string;
  kind: 'transaction' | 'transfer';
  id: string;
}

export interface ActivityPage {
  items: ActivityListItem[];
  nextCursor: ActivityCursor | null;
}

export type ActivityListItem =
  | {
      kind: 'transaction';
      data: TransactionListItem;
    }
  | {
      kind: 'transfer';
      data: TransferListItem;
    }; 
