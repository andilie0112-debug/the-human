// Wallet with a transaction history. Amounts are whole rupiah.

export type TransactionCategory = 'salary' | 'thr' | 'rent' | 'bill' | 'food' | 'shopping' | 'transport' | 'health' | 'other';

export interface Transaction {
  /** Game minutes when it happened. */
  time: number;
  amount: number;
  category: TransactionCategory;
  /** Key into strings.id.json, so UI text stays out of the simulation. */
  labelKey: string;
}

export class Wallet {
  balance: number;
  readonly history: Transaction[] = [];

  constructor(startBalance: number) {
    this.balance = Math.round(startBalance);
  }

  add(time: number, amount: number, category: TransactionCategory, labelKey: string): Transaction {
    const tx: Transaction = { time, amount: Math.round(amount), category, labelKey };
    this.balance += tx.amount;
    this.history.push(tx);
    return tx;
  }
}
