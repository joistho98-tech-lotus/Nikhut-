export interface Transaction {
  date: string;
  particulars: string;
  vchType: string;
  vchNo: string;
  debit: number;
  credit: number;
  id?: string;
}

export interface ReconciliationReport {
  id: string;
  name: string;
  type: string;
  subType: string[];
  lastEdit: string;
  internalBalance: number;
  externalBalance: number;
  difference: number;
  unmatchedEntries: UnmatchedEntry[];
  aiConclusion: string;
}

export interface UnmatchedEntry {
  internal?: Transaction;
  external?: Transaction;
  reason: string;
}

export type TabType = 'Data' | 'Reports' | 'Notes' | 'Settings' | 'AIStudio';
