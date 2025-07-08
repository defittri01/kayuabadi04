


import type { StockEntry, ChartSlice, MaterialDataResponse } from './types';
import { formatCurrency } from './utils';
import { createPieChart } from './pieChart';

// --- STATE MANAGEMENT ---
let localMaterialData: MaterialDataResponse | null = null;
let currentPage = 1;
const ITEMS_PER_PAGE = 6;
let currentEditingId: number | null = null;
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

async function updateStockEntryAPI(id: number, entryData: Omit<StockEntry, 'id'>): Promise<StockEntry> {
    const response = await fetch('/api/material', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...entryData }),
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to update the stock entry.' }));
        throw new Error(errorData.message || 'Failed to update the stock entry.');
    }
    return response.json();
}

async function deleteStockEntryAPI(id: number): Promise<void> {
    const response = await fetch('/api/material', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
    });
    if (response.status !== 204) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to delete the stock entry.' }));
        throw new Error(errorData.message || 'Failed to delete the stock entry.');
    }
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
        materialCardsContainer.innerHTML = `<p class="no-data-message">No stock entries yet. Click "Add New Stock" to begin.</p>`;
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
                  <p class="card-meta">${entry.origin} - ${formattedDate} at ${formattedTime}</p>
              </div>
              <div class="card-actions">
                  <button class="action-btn btn-revise" data-id="${entry.id}" aria-label="Revise entry">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                  </button>
                  <button class="action-btn btn-delete" data-id="${entry.id}" aria-label="Delete entry">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                  </button>
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
    const modalTitle = document.getElementById('stock-modal-title') as HTMLHeadingElement;
    const modalCloseBtn = document.getElementById('modal-close-btn') as HTMLButtonElement;
    const modalCancelBtn = document.getElementById('modal-cancel-btn') as HTMLButtonElement;
    const addStockForm = document.getElementById('add-stock-form') as HTMLFormElement;
    const stockDateInput = document.getElementById('stock-date') as HTMLInputElement;
    const stockTimeInput = document.getElementById('stock-time') as HTMLInputElement;
    const prevBtn = document.getElementById('material-prev-btn') as HTMLButtonElement;
    const nextBtn = document.getElementById('material-next-btn') as HTMLButtonElement;
    const materialCardsContainer = document.getElementById('material-cards-container') as HTMLElement;
    const modalSubmitBtn = addStockForm.querySelector('button[type="submit"]') as HTMLButtonElement;

    if(!addStockBtn || !modal || !addStockForm || !prevBtn || !nextBtn || !modalSubmitBtn || !stockTimeInput || !materialCardsContainer || !modalTitle) {
        console.error("Could not set up material event listeners: key elements are missing.");
        return;
    }

    const openModal = () => modal.classList.remove('hidden');
    const closeModal = () => {
        addStockForm.reset();
        currentEditingId = null;
        modal.classList.add('hidden');
    };

    addStockBtn.addEventListener('click', () => {
        currentEditingId = null;
        addStockForm.reset();
        modalTitle.textContent = 'Add New Material Stock';
        modalSubmitBtn.textContent = 'Save Stock';
        
        const now = new Date();
        // Adjust for timezone to set local date and time correctly in inputs
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        stockDateInput.value = now.toISOString().slice(0,10); // YYYY-MM-DD
        stockTimeInput.value = now.toISOString().slice(11,16); // HH:mm
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
        
        const datePart = (formData.get('date') as string)?.trim();
        const timePart = (formData.get('time') as string)?.trim();
        const supplier = (formData.get('supplier') as string)?.trim();
        const driver = (formData.get('driver') as string)?.trim();
        const origin = (formData.get('origin') as string)?.trim();
        
        let errors: string[] = [];
        if (!datePart) errors.push('Date is required.');
        if (!timePart) errors.push('Time is required.');
        if (!supplier) errors.push('Supplier name is required.');
        if (!driver) errors.push('Driver name is required.');
        if (!origin) errors.push('Origin is required.');

        // Combine date and time into a single ISO 8601 string for the backend.
        const date = datePart && timePart ? new Date(`${datePart}T${timePart}`).toISOString() : '';
        if (!date) errors.push('Date and time must form a valid timestamp.');


        const validateVolumeField = (valueStr: string | null, name: string): number => {
            if (valueStr === null || valueStr.trim() === '') {
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
            if (valueStr === null || valueStr.trim() === '') {
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

            if (currentEditingId) {
                await updateStockEntryAPI(currentEditingId, newEntryData);
            } else {
                await createStockEntryAPI(newEntryData);
            }
            
            closeModal();
            // Go to first page on add, stay on current page on edit
            if (!currentEditingId) {
                currentPage = 1;
            }
            await refreshMaterialData();
        } catch (error) {
            console.error(error);
            alert((error as Error).message);
        } finally {
            modalSubmitBtn.disabled = false;
            modalSubmitBtn.textContent = originalBtnText;
            currentEditingId = null;
        }
    });

    // Delegated event listener for revise/delete buttons
    materialCardsContainer.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const reviseBtn = target.closest('.btn-revise');
        const deleteBtn = target.closest('.btn-delete');

        if (reviseBtn) {
            const id = Number((reviseBtn as HTMLButtonElement).dataset.id);
            const entryToEdit = localMaterialData?.entries.find(e => e.id === id);
            if (!entryToEdit) return;

            currentEditingId = id;
            modalTitle.textContent = 'Revise Stock Entry';
            modalSubmitBtn.textContent = 'Save Changes';

            const entryDate = new Date(entryToEdit.date);
            entryDate.setMinutes(entryDate.getMinutes() - entryDate.getTimezoneOffset());
            
            (addStockForm.elements.namedItem('date') as HTMLInputElement).value = entryDate.toISOString().slice(0, 10);
            (addStockForm.elements.namedItem('time') as HTMLInputElement).value = entryDate.toISOString().slice(11, 16);
            (addStockForm.elements.namedItem('supplier') as HTMLInputElement).value = entryToEdit.supplier;
            (addStockForm.elements.namedItem('driver') as HTMLInputElement).value = entryToEdit.driver;
            (addStockForm.elements.namedItem('origin') as HTMLInputElement).value = entryToEdit.origin;
            
            (addStockForm.elements.namedItem('super-count') as HTMLInputElement).value = entryToEdit.super.count.toString();
            (addStockForm.elements.namedItem('super-volume') as HTMLInputElement).value = entryToEdit.super.volume.toString();
            (addStockForm.elements.namedItem('super-price') as HTMLInputElement).value = entryToEdit.super.price.toString();

            (addStockForm.elements.namedItem('rijek-count') as HTMLInputElement).value = entryToEdit.rijek.count.toString();
            (addStockForm.elements.namedItem('rijek-volume') as HTMLInputElement).value = entryToEdit.rijek.volume.toString();
            (addStockForm.elements.namedItem('rijek-price') as HTMLInputElement).value = entryToEdit.rijek.price.toString();
            
            openModal();
        }

        if (deleteBtn) {
            const id = Number((deleteBtn as HTMLButtonElement).dataset.id);
            if (confirm('Are you sure you want to delete this stock entry? This action cannot be undone.')) {
                try {
                    await deleteStockEntryAPI(id);
                    await refreshMaterialData();
                } catch(error) {
                    alert((error as Error).message);
                }
            }
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
