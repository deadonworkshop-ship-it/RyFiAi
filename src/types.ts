export interface Bill {
  id: number;
  name: string;
  amount: number;
  phase: number;
  paid: boolean;
  month: string;
  date?: string;
}

export interface GlobalExpense {
  id: number;
  name: string;
  amount: number;
  paid: boolean;
}

export interface Snapshot {
  id: number;
  tracker: 'investment' | 'debt' | 'savings' | 'assumptions' | 'tax' | 'retirement';
  account: string;
  amount: number;
  month: string;
}

export interface Flow {
  id: number;
  tracker: 'income';
  account: string;
  description?: string;
  amount: number;
  date: string;
  month: string;
}

export interface Goal {
  account: string;
  label: string;
  target: number;
}

export interface Summary {
  income: number;
  taxes: number;
  retirement: number;
  billsTotal: number;
  billsPaid: number;
}
