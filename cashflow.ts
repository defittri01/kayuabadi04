/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { formatCurrency } from './utils';
import type { CashflowItem, DailyCashflowLogEntry, CashflowData } from './types';

// --- STATE MANAGEMENT ---
let localCashflowData: CashflowData | null = null;
let currentEditingId: number | null = null;
const selectedEntryIds = new Set<number>();
let visibleEntryIds: number[] = [];
let activeTimeframeFilter: 'all' | '90' | '30' | '7' | 'custom' = 'all';
type SortKey = 'date' | 'type' | 'category' | null;
type SortDirection = 'asc' | 'desc';
let activeSortKey: SortKey = null;
let activeSortDirection: SortDirection = 'asc';
let isInitialized = false;

// --- API COMMUNICATION LAYER ---

async function createCashflowEntryAPI(entryData: Omit<DailyCashflowLogEntry, 'id'>): Promise<DailyCashflowLogEntry> {
    const response = await fetch('/api/cashflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entryData),
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to save entry.' }));
        throw new Error(errorData.message || 'Failed to save entry.');
    }
    return response.json();
}

async function updateCashflowEntryAPI(entryData: DailyCashflowLogEntry): Promise<DailyCashflowLogEntry> {
    const response = await fetch('/api/cashflow', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entryData),
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to update entry.' }));
        throw new Error(errorData.message || 'Failed to update entry.');
    }
    return response.json();
}

async function deleteCashflowEntryAPI(id: number): Promise<void> {
    const response = await fetch('/api/cashflow', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
    });
    if (response.status !== 204) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to delete entry.' }));
        throw new Error(errorData.message || 'Failed to delete entry.');
    }
}

async function bulkDeleteCashflowEntriesAPI(ids: number[]): Promise<void> {
    const response = await fetch('/api/cashflow', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
    });
    if (response.status !== 204) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to delete entries.' }));
        throw new Error(errorData.message || 'Failed to delete entries.');
    }
}


// --- RENDERING LOGIC ---

function updateBulkActionUI() {
    const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
    const dailyLogTableBody = document.getElementById('daily-log-body');
    if (!bulkDeleteBtn || !dailyLogTableBody) return;

    // Update button visibility
    bulkDeleteBtn.classList.toggle('hidden', selectedEntryIds.size === 0);

    // Update row highlighting
    dailyLogTableBody.querySelectorAll('tr').forEach(row => {
        const rowId = Number(row.dataset.entryId);
        if (rowId) {
            row.classList.toggle('selected', selectedEntryIds.has(rowId));
        }
    });

    // Update checkboxes in rows
    dailyLogTableBody.querySelectorAll<HTMLInputElement>('.row-checkbox').forEach(cb => {
        const cbId = Number(cb.dataset.id);
        if (cbId) {
            cb.checked = selectedEntryIds.has(cbId);
        }
    });

    // Update select-all checkbox
    const selectAllCheckbox = document.getElementById('select-all-checkbox') as HTMLInputElement;
    if (selectAllCheckbox) {
        if (visibleEntryIds.length > 0 && visibleEntryIds.every(id => selectedEntryIds.has(id))) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else if (visibleEntryIds.some(id => selectedEntryIds.has(id))) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        }
    }
}

function renderBreakdownLists(
    listElementId: string,
    items: CashflowItem[],
    totalAmount: number
) {
    const listEl = document.getElementById(listElementId) as HTMLUListElement;
    if (!listEl) return;

    // Sort items by amount descending and take top 5
    const sortedItems = [...items].sort((a, b) => b.amount - a.amount).slice(0, 5);

    if (sortedItems.length === 0) {
        listEl.innerHTML = `<li class="no-data-message" style="padding:0; background:none;">No data for this period.</li>`;
        return;
    }

    listEl.innerHTML = sortedItems.map(item => {
        const percentage = totalAmount > 0 ? (item.amount / totalAmount) * 100 : 0;
        return `
            <li class="breakdown-item">
                <div class="breakdown-item-header">
                    <span class="breakdown-category">${item.category}</span>
                    <span class="breakdown-amount">${formatCurrency(item.amount)}</span>
                </div>
                <div class="breakdown-progress-bar">
                    <div style="width: ${percentage.toFixed(2)}%;"></div>
                </div>
            </li>
        `;
    }).join('');
}


function renderDailyLogTable(dataToRender: DailyCashflowLogEntry[]) {
    const dailyLogTableBody = document.getElementById('daily-log-body');
    if (!dailyLogTableBody) return;

    if (dataToRender.length === 0) {
        dailyLogTableBody.innerHTML = `<tr><td colspan="8" class="no-data-message">No transactions in this period.</td></tr>`;
        visibleEntryIds = [];
        updateBulkActionUI();
        updateSortHeadersUI(); // Also update headers for no data
        return;
    }

    const sortedLogForDisplay = [...dataToRender];

    if (activeSortKey) {
        sortedLogForDisplay.sort((a, b) => {
            let comparison = 0;
            switch (activeSortKey) {
                case 'date':
                    comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
                    break;
                case 'type':
                    comparison = a.type.localeCompare(b.type);
                    break;
                case 'category':
                    comparison = a.category.localeCompare(b.category);
                    break;
            }
            return activeSortDirection === 'asc' ? comparison : -comparison;
        });
    }
    
    dailyLogTableBody.innerHTML = sortedLogForDisplay.map(entry => {
        const typeClass = entry.type === 'income' ? 'log-type-income' : 'log-type-expense';
        const typeText = entry.type.charAt(0).toUpperCase() + entry.type.slice(1);
        const entryDate = new Date(entry.date + 'T00:00:00'); // Ensure date is parsed in local time zone

        return `
            <tr data-entry-id="${entry.id}">
                <td class="checkbox-cell"><input type="checkbox" class="row-checkbox" data-id="${entry.id}" aria-label="Select entry for ${entry.description}"></td>
                <td>${entryDate.toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                <td><span class="log-type ${typeClass}">${typeText}</span></td>
                <td>${entry.category}</td>
                <td>${entry.description}</td>
                <td>${formatCurrency(entry.amount)}</td>
                <td>${formatCurrency(entry.runningBalance ?? 0)}</td>
                <td class="actions-cell">
                    <button class="action-btn btn-revise" data-id="${entry.id}" aria-label="Revise entry">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                    <button class="action-btn btn-delete" data-id="${entry.id}" aria-label="Delete entry">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    visibleEntryIds = sortedLogForDisplay.map(entry => entry.id);
    updateBulkActionUI();
    updateSortHeadersUI();
}

function renderCashflowPage() {
    const totalIncomeEl = document.getElementById('cashflow-total-income');
    const totalExpensesEl = document.getElementById('cashflow-total-expenses');
    const netProfitEl = document.getElementById('cashflow-net-profit');
    const healthBarEl = document.getElementById('financial-health-bar');
    
    if (!localCashflowData || !totalIncomeEl || !totalExpensesEl || !netProfitEl || !healthBarEl) return;
    
    const { income, expenses, dailyLog } = localCashflowData;
    const totalIncome = income.reduce((sum, item) => sum + item.amount, 0);
    const totalExpenses = expenses.reduce((sum, item) => sum + item.amount, 0);
    const netProfit = totalIncome - totalExpenses;

    // Render Summary Header
    totalIncomeEl.textContent = formatCurrency(totalIncome);
    totalExpensesEl.textContent = formatCurrency(totalExpenses);
    netProfitEl.textContent = formatCurrency(netProfit);
    netProfitEl.style.color = netProfit >= 0 ? 'var(--accent-color)' : 'var(--status-red)';

    // Render Financial Health Bar
    const expenseRatio = totalIncome > 0 ? (totalExpenses / totalIncome) * 100 : (totalExpenses > 0 ? 100 : 0);
    healthBarEl.style.width = `${Math.min(expenseRatio, 100)}%`;
    healthBarEl.style.backgroundColor = expenseRatio > 80 ? 'var(--status-yellow)' : 'var(--status-red)';
    if (expenseRatio <= 80) healthBarEl.style.backgroundColor = 'var(--status-red)';
    if (expenseRatio <= 50) healthBarEl.style.backgroundColor = 'var(--status-green)';
    

    // Render Breakdown Lists
    renderBreakdownLists('cash-in-breakdown', income, totalIncome);
    renderBreakdownLists('cash-out-breakdown', expenses, totalExpenses);

    // Render Table
    renderDailyLogTable(dailyLog);
}

// --- SORTING LOGIC ---

function updateSortHeadersUI() {
    const headers = document.querySelectorAll('.sortable-header');
    headers.forEach(header => {
        const key = header.getAttribute('data-sort-key');
        header.classList.remove('asc', 'desc');
        if (key === activeSortKey) {
            header.classList.add(activeSortDirection);
        }
    });
}

function handleSort(key: SortKey) {
    if (!key) return;
    
    if (key === activeSortKey) {
        activeSortDirection = (activeSortDirection === 'asc') ? 'desc' : 'asc';
    } else {
        activeSortKey = key;
        activeSortDirection = 'asc';
    }
    renderCashflowPage();
}

// --- DATA REFRESH ---
async function fetchAndRenderCashflowData() {
    const dailyLogTableBody = document.getElementById('daily-log-body');
    const dateFromInput = document.getElementById('cashflow-date-from') as HTMLInputElement;
    const dateToInput = document.getElementById('cashflow-date-to') as HTMLInputElement;

    if (!dailyLogTableBody) return;

    dailyLogTableBody.innerHTML = `<tr><td colspan="8" class="no-data-message">Loading data...</td></tr>`;

    const params = new URLSearchParams();
    if (activeTimeframeFilter === 'custom' && dateFromInput.value && dateToInput.value) {
        params.append('from', dateFromInput.value);
        params.append('to', dateToInput.value);
    } else if (activeTimeframeFilter !== 'all' && activeTimeframeFilter !== 'custom') {
        params.append('period', activeTimeframeFilter);
    }

    try {
        const response = await fetch(`/api/cashflow?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch cashflow data from server.');
        localCashflowData = await response.json();
        renderCashflowPage();
    } catch (error) {
        console.error(error);
        alert((error as Error).message);
        dailyLogTableBody.innerHTML = `<tr><td colspan="8" class="no-data-message">Error loading data. Please try again.</td></tr>`;
    }
}

// --- EVENT LISTENERS & SETUP ---

async function updateCategoryDatalist() {
    const categoryDatalist = document.getElementById('cashflow-category-list');
    if (!categoryDatalist) return;
    try {
        const response = await fetch('/api/cashflow'); // Fetches all-time data
        const allData: CashflowData = await response.json();
        const allCategories = new Set([
            ...allData.income.map(i => i.category),
            ...allData.expenses.map(e => e.category),
        ]);
        categoryDatalist.innerHTML = Array.from(allCategories).map(cat => `<option value="${cat}"></option>`).join('');
    } catch (err) {
        console.error("Could not fetch categories for datalist", err)
    }
}

function setupCashflowEventListeners() {
    const filterGroup = document.querySelector('#cashflow .filter-group');
    const dateFromInput = document.getElementById('cashflow-date-from') as HTMLInputElement;
    const dateToInput = document.getElementById('cashflow-date-to') as HTMLInputElement;
    const applyDateRangeBtn = document.getElementById('apply-date-range-btn') as HTMLButtonElement;
    const addEntryBtn = document.getElementById('add-cashflow-entry-btn');
    const cashflowModal = document.getElementById('cashflow-entry-modal');
    const cashflowForm = document.getElementById('cashflow-entry-form') as HTMLFormElement;
    const dailyLogContainer = document.querySelector('.daily-cashflow-log');
    const bulkDeleteBtn = document.getElementById('bulk-delete-btn');

    if (!filterGroup || !applyDateRangeBtn || !addEntryBtn || !cashflowModal || !cashflowForm || !dailyLogContainer || !bulkDeleteBtn) {
        console.error("Could not set up cashflow event listeners: key elements are missing.");
        return;
    }

    // Filter Listeners
    filterGroup.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const button = target.closest('.btn-filter');
        if (!button) return;

        const period = button.getAttribute('data-period') as typeof activeTimeframeFilter;
        if (period === activeTimeframeFilter && period !== 'custom') return;

        activeTimeframeFilter = period;
        filterGroup.querySelectorAll('.btn-filter').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        dateFromInput.value = '';
        dateToInput.value = '';
        activeSortKey = 'date';
        activeSortDirection = 'desc';
        selectedEntryIds.clear();
        fetchAndRenderCashflowData();
    });

    applyDateRangeBtn.addEventListener('click', () => {
        if (dateFromInput.value && dateToInput.value && new Date(dateFromInput.value) <= new Date(dateToInput.value)) {
            activeTimeframeFilter = 'custom';
            filterGroup.querySelectorAll('.btn-filter').forEach(btn => btn.classList.remove('active'));
            activeSortKey = 'date';
            activeSortDirection = 'desc';
            selectedEntryIds.clear();
            fetchAndRenderCashflowData();
        } else {
            alert('Please select a valid date range.');
        }
    });
    
    [dateFromInput, dateToInput].forEach(input => input.addEventListener('input', () => {
        filterGroup.querySelectorAll('.btn-filter').forEach(btn => btn.classList.remove('active'));
    }));

    // Modal Listeners
    const modalTitle = document.getElementById('cashflow-modal-title');
    const modalSubmitBtn = document.getElementById('cashflow-modal-submit-btn') as HTMLButtonElement;
    const modalDateInput = document.getElementById('cashflow-date') as HTMLInputElement;

    const openModal = () => cashflowModal?.classList.remove('hidden');
    const closeModal = () => {
        cashflowForm.reset();
        currentEditingId = null;
        cashflowModal?.classList.add('hidden');
    };

    (document.getElementById('cashflow-modal-close-btn'))?.addEventListener('click', closeModal);
    (document.getElementById('cashflow-modal-cancel-btn'))?.addEventListener('click', closeModal);
    cashflowModal.addEventListener('click', (e) => { if (e.target === cashflowModal) closeModal(); });
    
    addEntryBtn.addEventListener('click', () => {
        currentEditingId = null;
        cashflowForm.reset();
        if (modalTitle) modalTitle.textContent = 'Add Cashflow Entry';
        if (modalSubmitBtn) modalSubmitBtn.textContent = 'Save Entry';
        modalDateInput.valueAsDate = new Date();
        updateCategoryDatalist();
        openModal();
    });

    // Table Interaction Listeners (Delegated)
    dailyLogContainer.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const sortHeader = target.closest('.sortable-header');
        const rowCheckbox = target.closest('.row-checkbox');
        const selectAllCheckbox = target.id === 'select-all-checkbox' ? target as HTMLInputElement : null;
        const reviseBtn = target.closest('.btn-revise');
        const deleteBtn = target.closest('.btn-delete');

        if (sortHeader) handleSort(sortHeader.getAttribute('data-sort-key') as SortKey);
        if (rowCheckbox) {
            const id = Number((rowCheckbox as HTMLInputElement).dataset.id);
            if ((rowCheckbox as HTMLInputElement).checked) selectedEntryIds.add(id);
            else selectedEntryIds.delete(id);
            updateBulkActionUI();
        }
        if (selectAllCheckbox) {
            if (selectAllCheckbox.checked) visibleEntryIds.forEach(id => selectedEntryIds.add(id));
            else visibleEntryIds.forEach(id => selectedEntryIds.delete(id));
            updateBulkActionUI();
        }
        if (reviseBtn && localCashflowData) {
            const id = Number(reviseBtn.getAttribute('data-id'));
            const entry = localCashflowData.dailyLog.find(log => log.id === id);
            if (!entry) return;

            currentEditingId = id;
            if (modalTitle) modalTitle.textContent = 'Revise Cashflow Entry';
            if (modalSubmitBtn) modalSubmitBtn.textContent = 'Save Changes';

            (document.getElementById('cashflow-date') as HTMLInputElement).value = entry.date;
            (document.getElementById('cashflow-type') as HTMLSelectElement).value = entry.type;
            (document.getElementById('cashflow-category') as HTMLInputElement).value = entry.category;
            (document.getElementById('cashflow-description') as HTMLTextAreaElement).value = entry.description;
            (document.getElementById('cashflow-amount') as HTMLInputElement).value = entry.amount.toString();

            updateCategoryDatalist();
            openModal();
        }
        if (deleteBtn) {
            const id = Number(deleteBtn.getAttribute('data-id'));
            if (confirm('Are you sure you want to delete this entry?')) {
                try {
                    await deleteCashflowEntryAPI(id);
                    await fetchAndRenderCashflowData();
                } catch(error) { alert((error as Error).message); }
            }
        }
    });

    bulkDeleteBtn.addEventListener('click', async () => {
        if (selectedEntryIds.size === 0) return;
        if (confirm(`Delete ${selectedEntryIds.size} selected entries?`)) {
            try {
                await bulkDeleteCashflowEntriesAPI(Array.from(selectedEntryIds));
                selectedEntryIds.clear();
                await fetchAndRenderCashflowData();
            } catch (error) { alert((error as Error).message); }
        }
    });

    cashflowForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const typeInput = document.getElementById('cashflow-type') as HTMLSelectElement;
        const categoryInput = document.getElementById('cashflow-category') as HTMLInputElement;
        const descriptionInput = document.getElementById('cashflow-description') as HTMLTextAreaElement;
        const amountInput = document.getElementById('cashflow-amount') as HTMLInputElement;

        const entryData: any = {
            date: modalDateInput.value,
            type: typeInput.value,
            category: categoryInput.value.trim(),
            description: descriptionInput.value.trim(),
            amount: parseInt(amountInput.value, 10),
            ...(currentEditingId && { id: currentEditingId }),
        };

        if (!entryData.date || !entryData.category || isNaN(entryData.amount) || entryData.amount <= 0) {
            alert('Please fill out date, category, and a valid positive amount.');
            return;
        }

        const originalBtnText = modalSubmitBtn.textContent;
        modalSubmitBtn.disabled = true;
        modalSubmitBtn.textContent = 'Saving...';
        
        try {
            if (currentEditingId) await updateCashflowEntryAPI(entryData);
            else await createCashflowEntryAPI(entryData);
            closeModal();
            await fetchAndRenderCashflowData();
        } catch (error) {
            alert((error as Error).message);
        } finally {
            modalSubmitBtn.disabled = false;
            modalSubmitBtn.textContent = originalBtnText;
        }
    });
}

export async function initCashflowPage() {
    await fetchAndRenderCashflowData();
    if (!isInitialized) {
        setupCashflowEventListeners();
        isInitialized = true;
    }
}
