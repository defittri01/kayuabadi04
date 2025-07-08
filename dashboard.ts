import { dashboardChartData } from './state';
import { createPieChart } from './pieChart';

export function initDashboardPage() {
    for (const chartId in dashboardChartData) {
        createPieChart(`${chartId}-wrapper`, dashboardChartData[chartId]);
    }
}
