

import type { StockEntry, ChartSlice, MaterialDataResponse } from './types';
import { formatCurrency } from './utils';
import { createPieChart } from './pieChart';

// --- STATE MANAGEMENT ---
let localMaterialData: MaterialDataResponse | null = null;
let currentPage = 1;
const ITEMS_PER_PAGE = 6;
let isInitialized = false;

// --- API COMMUNICATION LAYER ---
async function fetchMaterialData(page: number, limit: number): Promise<MaterialDataResponse> {
    const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
    });
    const response = await fetch(`/api/material?${params.toString()}`);
    if (!response.ok) {
        throw new Error('Failed to fetch material stock data from server.');
    }
    return response.json();
}

async function createStockEntryAPI(entryData: Omit<StockEntry, 'id'>): Promise<StockEntry> {
    const response = await fetch('/api/material', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entryData),
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to save the new stock entry.' }));
        throw new Error(errorData.message || 'Failed to save the new stock entry.');
    }
    return response.json();
}

// --- RENDERING LOGIC ---

function renderPagination() {
    const paginationContainer = document.getElementById('material-pagination-container') as HTMLDivElement;
    const prevBtn = document.getElementById('material-prev-btn') as HTMLButtonElement;
    const nextBtn = document.getElementById('material-next-btn') as HTMLButtonElement;
    const pageInfo = document.getElementById('material-page-info') as HTMLSpanElement;

    if (!paginationContainer || !localMaterialData || !prevBtn || !nextBtn || !pageInfo) return;

    const { totalCount } = localMaterialData;
    const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

    if (totalPages <= 1) {
        paginationContainer.classList.add('hidden');
        return;
    }

    paginationContainer.classList.remove('hidden');
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
}

const renderMaterialPage = () => {
    const materialCardsContainer = document.getElementById('material-cards-container') as HTMLElement;
    
    if (!materialCardsContainer || !localMaterialData) return;

    const { entries, summary } = localMaterialData;

    // 1. Render Material Cards
    materialCardsContainer.innerHTML = '';
    if (entries.length === 0) {
        const message = 'No stock entries yet. Click "Add New Stock" to begin.';
        materialCardsContainer.innerHTML = `<p class="no-data-message">${message}</p>`;
    } else {
      entries.forEach(entry => {
        const card = document.createElement('div');
        card.className = 'material-card';
        const totalCount = entry.super.count + entry.rijek.count;
        const superPercent = totalCount > 0 ? (entry.super.count / totalCount) * 100 : 0;
        const rijekPercent = totalCount > 0 ? (entry.rijek.count / totalCount) * 100 : 0;
        
        const entryDate = new Date(entry.date);
        const formattedDate = entryDate.toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric' });
        const formattedTime = entryDate.toLocaleTimeString('id-ID', {hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).replace('.', ':');

        card.innerHTML = `
          <div class="card-header">
              <div>
                  <h4 class="card-supplier">${entry.supplier} / ${entry.driver}</h4>
                  <p class="card-meta">${entry.origin} - ${formattedDate} pukul ${formattedTime}</p>
              </div>
          </div>
          <div class="card-body">
              <div id="mat-card-chart-${entry.id}" class="chart-wrapper mini-chart"></div>
              <div class="card-data">
                  <div class="data-item super">
                      <p class="data-label">Super</p>
                      <p class="data-value">${entry.super.count} Batang</p>
                      <p class="data-value">${entry.super.volume.toFixed(2)} m³</p>
                      <p class="data-value">${formatCurrency(entry.super.price)}</p>
                  </div>
                  <div class="data-item rijek">
                      <p class="data-label">Rijek</p>
                      <p class="data-value">${entry.rijek.count} Batang</p>
                      <p class="data-value">${entry.rijek.volume.toFixed(2)} m³</p>
                      <p class="data-value">${formatCurrency(entry.rijek.price)}</p>
                  </div>
              </div>
          </div>
        `;
        materialCardsContainer.appendChild(card);
        
        const cardChartData: ChartSlice[] = [
          { percent: superPercent, label: 'Super', color: 'var(--chart-color-2)', value: `${entry.super.count} Batang` },
          { percent: rijekPercent, label: 'Rijek', color: 'var(--chart-color-4)', value: `${entry.rijek.count} Batang` },
        ];
        createPieChart(`mat-card-chart-${entry.id}`, cardChartData, true);
      });
    }

    // 2. Render Summary (using summary data from API)
    const superPercent = summary.totalVolume > 0 ? (summary.totalSuperVolume / summary.totalVolume) * 100 : 0;
    const rijekPercent = summary.totalVolume > 0 ? (summary.totalRijekVolume / summary.totalVolume) * 100 : 0;

    const summaryChartData: ChartSlice[] = [
        { percent: superPercent, label: 'Super', color: 'var(--chart-color-2)', value: `${summary.totalSuperVolume.toFixed(2)} m³` },
        { percent: rijekPercent, label: 'Rijek', color: 'var(--chart-color-4)', value: `${summary.totalRijekVolume.toFixed(2)} m³`},
    ];
    createPieChart('material-summary-chart', summaryChartData);

    (document.getElementById('summary-stat-volume') as HTMLElement).textContent = `${summary.totalVolume.toFixed(2)} m³`;
    (document.getElementById('summary-stat-value') as HTMLElement).textContent = formatCurrency(summary.totalValue);
    (document.getElementById('summary-stat-count') as HTMLElement).textContent = `${summary.totalLogs} Batang`;

    // 3. Render Pagination
    renderPagination();
};

async function refreshMaterialData() {
    const materialCardsContainer = document.getElementById('material-cards-container') as HTMLElement;
    const paginationContainer = document.getElementById('material-pagination-container') as HTMLDivElement;

    if (materialCardsContainer) {
        materialCardsContainer.innerHTML = `<p class="no-data-message">Loading data...</p>`;
    }
    if (paginationContainer) paginationContainer.classList.add('hidden');
    
    try {
        localMaterialData = await fetchMaterialData(currentPage, ITEMS_PER_PAGE);
        renderMaterialPage();
    } catch(error) {
        console.error(error);
        if (materialCardsContainer) {
            materialCardsContainer.innerHTML = `<p class="no-data-message">Error loading data. Please try refreshing the page.</p>`;
        }
    }
}

// --- EVENT LISTENERS & SETUP ---
function setupMaterialEventListeners() {
    const addStockBtn = document.getElementById('add-stock-btn') as HTMLButtonElement;
    const modal = document.getElementById('add-stock-modal') as HTMLDivElement;
    const modalCloseBtn = document.getElementById('modal-close-btn') as HTMLButtonElement;
    const modalCancelBtn = document.getElementById('modal-cancel-btn') as HTMLButtonElement;
    const addStockForm = document.getElementById('add-stock-form') as HTMLFormElement;
    const stockDateInput = document.getElementById('stock-date') as HTMLInputElement;
    const prevBtn = document.getElementById('material-prev-btn') as HTMLButtonElement;
    const nextBtn = document.getElementById('material-next-btn') as HTMLButtonElement;
    const modalSubmitBtn = addStockForm.querySelector('button[type="submit"]') as HTMLButtonElement;

    if(!addStockBtn || !modal || !addStockForm || !prevBtn || !nextBtn || !modalSubmitBtn) {
        console.error("Could not set up material event listeners: key elements are missing.");
        return;
    }

    const openModal = () => {
        modal.classList.remove('hidden');
    }
    const closeModal = () => {
        addStockForm.reset();
        modal.classList.add('hidden');
    };

    addStockBtn.addEventListener('click', () => {
        addStockForm.reset();
        stockDateInput.valueAsDate = new Date(); // Set to today by default
        openModal();
    });

    modalCloseBtn.addEventListener('click', closeModal);
    modalCancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    addStockForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(addStockForm);
        
        const date = (formData.get('date') as string)?.trim();
        const supplier = (formData.get('supplier') as string)?.trim();
        const driver = (formData.get('driver') as string)?.trim();
        const origin = (formData.get('origin') as string)?.trim();
        
        let errors: string[] = [];
        if (!date) errors.push('Date is required.');
        if (!supplier) errors.push('Supplier name is required.');
        if (!driver) errors.push('Driver name is required.');
        if (!origin) errors.push('Origin is required.');

        const validateVolumeField = (valueStr: string | null, name: string): number => {
            if (!valueStr || !valueStr.trim()) {
                errors.push(`${name} is required.`);
                return NaN;
            }
            const num = parseFloat(valueStr);
            if (isNaN(num) || num < 0) {
                errors.push(`${name} must be a valid, non-negative number.`);
                return NaN;
            }
            if (valueStr.includes('.') && (valueStr.split('.')[1] || '').length > 2) {
                errors.push(`${name} cannot have more than 2 decimal places.`);
            }
            return num;
        };

        const validateIntegerField = (valueStr: string | null, name: string): number => {
            if (!valueStr || !valueStr.trim()) {
                errors.push(`${name} is required.`);
                return NaN;
            }
            const num = parseInt(valueStr, 10);
            if (isNaN(num) || !Number.isInteger(num) || num < 0) {
                errors.push(`${name} must be a valid, non-negative integer.`);
                return NaN;
            }
            return num;
        };

        const superCount = validateIntegerField(formData.get('super-count') as string, 'Super Count');
        const superVolume = validateVolumeField(formData.get('super-volume') as string, 'Super Volume');
        const superPrice = validateIntegerField(formData.get('super-price') as string, 'Super Price');
        const rijekCount = validateIntegerField(formData.get('rijek-count') as string, 'Rijek Count');
        const rijekVolume = validateVolumeField(formData.get('rijek-volume') as string, 'Rijek Volume');
        const rijekPrice = validateIntegerField(formData.get('rijek-price') as string, 'Rijek Price');

        if (errors.length > 0) {
            alert('Please fix the following issues:\n\n- ' + errors.join('\n- '));
            return;
        }

        const originalBtnText = modalSubmitBtn.textContent;
        modalSubmitBtn.disabled = true;
        modalSubmitBtn.textContent = 'Saving...';
        
        try {
            const newEntryData: Omit<StockEntry, 'id'> = {
                date, supplier, driver, origin,
                super: { count: superCount, volume: superVolume, price: superPrice },
                rijek: { count: rijekCount, volume: rijekVolume, price: rijekPrice }
            };
            await createStockEntryAPI(newEntryData);
            
            closeModal();

            currentPage = 1;
            await refreshMaterialData();
        } catch (error) {
            console.error(error);
            alert((error as Error).message);
        } finally {
            modalSubmitBtn.disabled = false;
            modalSubmitBtn.textContent = originalBtnText;
        }
    });

    prevBtn.addEventListener('click', () => {
        if(currentPage > 1) {
            currentPage--;
            refreshMaterialData();
        }
    });

    nextBtn.addEventListener('click', () => {
        if(!localMaterialData) return;
        const totalPages = Math.ceil(localMaterialData.totalCount / ITEMS_PER_PAGE);
        if(currentPage < totalPages) {
            currentPage++;
            refreshMaterialData();
        }
    });
}

export async function initMaterialPage() {
    // Refresh data every time the page is shown
    await refreshMaterialData();
    
    // But only attach event listeners once
    if (!isInitialized) {
        setupMaterialEventListeners();
        isInitialized = true;
    }
}