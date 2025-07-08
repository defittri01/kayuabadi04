import type { ChartSlice } from './types';

// The hardcoded materialStockData array and its functions have been removed.
// This data is now fetched from and managed by the database via the `/api/material` endpoint.

export const dashboardChartData: Record<string, ChartSlice[]> = {
    'material-chart': [
      { percent: 45, label: 'Finished Goods', color: 'var(--chart-color-1)' },
      { percent: 35, label: 'Raw Materials', color: 'var(--chart-color-2)' },
      { percent: 20, label: 'Work in Progress', color: 'var(--chart-color-3)' },
    ],
    'cashflow-chart': [
      { percent: 60, label: 'Income', color: 'var(--chart-color-2)' },
      { percent: 30, label: 'Operating Expenses', color: 'var(--chart-color-4)' },
      { percent: 10, label: 'Investments', color: 'var(--chart-color-6)' },
    ],
    'manpower-chart': [
      { percent: 50, label: 'Production', color: 'var(--chart-color-1)' },
      { percent: 25, label: 'Sales & Marketing', color: 'var(--chart-color-2)' },
      { percent: 15, label: 'R&D', color: 'var(--chart-color-3)' },
      { percent: 10, label: 'Admin', color: 'var(--chart-color-5)' },
    ],
    'equipment-chart': [
      { percent: 75, label: 'In Use', color: 'var(--chart-color-2)' },
      { percent: 15, label: 'Under Maintenance', color: 'var(--chart-color-3)' },
      { percent: 10, 'label': 'Idle', color: 'var(--chart-color-4)' },
    ],
    'sales-chart': [
      { percent: 20, label: 'Q1', color: 'var(--chart-color-1)' },
      { percent: 25, label: 'Q2', color: 'var(--chart-color-2)' },
      { percent: 22, label: 'Q3', color: 'var(--chart-color-3)' },
      { percent: 33, label: 'Q4', color: 'var(--chart-color-4)' },
    ],
    'productivity-chart': [
      { percent: 25, label: 'Exceeding Target', color: 'var(--chart-color-2)' },
      { percent: 60, label: 'On Target', color: 'var(--chart-color-1)' },
      { percent: 15, label: 'Below Target', color: 'var(--chart-color-4)' },
    ],
};
