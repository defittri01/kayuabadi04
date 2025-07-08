export type ChartSlice = {
  percent: number;
  label: string;
  color: string;
  value?: string;
};

export type LogData = {
  count: number;
  volume: number;
  price: number;
};

export type StockEntry = {
  id: number;
  supplier: string;
  driver: string;
  origin: string;
  date: string;
  super: LogData;
  rijek: LogData;
};

export type MaterialSummary = {
  totalVolume: number;
  totalValue: number;
  totalLogs: number;
  totalSuperVolume: number;
  totalRijekVolume: number;
};

export type MaterialDataResponse = {
  entries: StockEntry[];
  summary: MaterialSummary;
  totalCount: number;
};

export type CashflowItem = {
  category: string;
  amount: number;
};

export type DailyCashflowLogEntry = {
  id: number;
  date: string;
  type: 'income' | 'expense';
  category: string;
  description: string;
  amount: number;
  runningBalance?: number;
};

export type CashflowData = {
  income: CashflowItem[];
  expenses: CashflowItem[];
  dailyLog: DailyCashflowLogEntry[];
};