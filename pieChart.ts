import type { ChartSlice } from './types';

export const createPieChart = (wrapperId: string, data: ChartSlice[], isMini = false) => {
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;
     
    // Clear previous chart
    wrapper.innerHTML = `
      <svg class="pie-chart-svg" viewBox="0 0 100 100"></svg>
      <div class="chart-tooltip"></div>
    `;

    const svg = wrapper.querySelector('.pie-chart-svg');
    const tooltip = wrapper.querySelector('.chart-tooltip') as HTMLElement;
    if (!svg || !tooltip) return;

    const getCoordinatesForPercent = (percent: number) => {
      const x = Math.cos(2 * Math.PI * percent);
      const y = Math.sin(2 * Math.PI * percent);
      return [x * 50 + 50, y * 50 + 50];
    };

    let cumulativePercent = 0;
    data.forEach((slice, index) => {
      if(slice.percent === 0) return;

      const [startX, startY] = getCoordinatesForPercent(cumulativePercent / 100);
      cumulativePercent += slice.percent;
      const [endX, endY] = getCoordinatesForPercent(cumulativePercent / 100);

      const largeArcFlag = slice.percent > 50 ? 1 : 0;

      const pathData = [
        `M 50 50`,
        `L ${startX} ${startY}`,
        `A 50 50 0 ${largeArcFlag} 1 ${endX} ${endY}`,
        `Z`
      ].join(' ');

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathData);
      path.setAttribute('fill', slice.color);
      const label = slice.value ? `${slice.label} (${slice.percent.toFixed(1)}%) - ${slice.value}` : `${slice.label} (${slice.percent.toFixed(1)}%)`;
      path.setAttribute('data-label', label);
      (path.style as any).animationDelay = `${index * 100}ms`;

      path.addEventListener('mouseover', (e) => {
          tooltip.textContent = path.getAttribute('data-label');
          tooltip.style.display = 'block';
      });

      path.addEventListener('mousemove', (e) => {
          const rect = document.body.getBoundingClientRect();
          tooltip.style.left = `${e.clientX - rect.left + 15}px`;
          tooltip.style.top = `${e.clientY - rect.top + 15}px`;
      });

      path.addEventListener('mouseout', () => {
          tooltip.style.display = 'none';
      });

      svg.appendChild(path);
    });
};
