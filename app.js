/**
 * Daily Bank Ledger & Reconciliation Tool - Core Application Engine
 * Vanilla JavaScript (ES6) - Offline First
 */

// ==========================================================================
// 1. STATE & CONSTANTS DEFINITIONS
// ==========================================================================

const ACCOUNTS = [
  'Sami UBL',
  'Sami Faysal',
  'Us UBL',
  'Us Faysal',
  'My UBL',
  'My Faysal',
  'JazzCash',
  'Easypaisa',
  'SadaPay',
  'NayaPay'
];

// Initial state template
const INITIAL_STATE = {
  currentDate: getTodayString(),
  settings: {
    darkMode: true,
  },
  dailyRecords: {}, // Key: YYYY-MM-DD, Value: { notes, openingBalances: {}, transactions: [] }
  clientRegistry: [
    'Self Exchange',
    'Customer Walk-in',
    'Ahmed Khan',
    'Zainab Bibi',
    'Bilal Raza',
    'Fatima Ali',
    'Saeed Traders'
  ], // Autocomplete cache
  lastCreatedTxId: null // Support undo operation
};

// Global App State Reference
let appState = null;

// Routing State Reference
let currentView = 'dashboard';
let selectedBankName = ACCOUNTS[0]; // Currently viewed bank ledger details
let activeReportTab = 'tab-daily';

// ==========================================================================
// 2. LIFECYCLE & STORAGE MANAGERS
// ==========================================================================

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  initTheme();
  setupEventListeners();
  initRouter();
  
  // Set date picker value to today on startup
  const dateInput = document.getElementById('global-date');
  dateInput.value = appState.currentDate;
  document.getElementById('notes-current-date').textContent = formatDateFriendly(appState.currentDate);
  
  // Check and Rollover/Initialize active day record
  checkAndInitializeDateRecord(appState.currentDate);
  
  // Trigger initial UI rendering
  renderApp();
  
  // Register Message Listener for Calculator integration
  setupCalculatorIntegration();
});

// Load state from LocalStorage
function loadState() {
  const data = localStorage.getItem('exchange_ledger_state');
  if (data) {
    try {
      appState = JSON.parse(data);
      // Backwards compatibility check
      if (!appState.clientRegistry) appState.clientRegistry = INITIAL_STATE.clientRegistry;
      if (!appState.settings) appState.settings = INITIAL_STATE.settings;
      if (!appState.dailyRecords) appState.dailyRecords = {};
    } catch (e) {
      console.error('Failed to parse local storage state. Reinitializing.', e);
      appState = JSON.parse(JSON.stringify(INITIAL_STATE));
    }
  } else {
    appState = JSON.parse(JSON.stringify(INITIAL_STATE));
  }
}

// Save state to LocalStorage
function saveState() {
  localStorage.setItem('exchange_ledger_state', JSON.stringify(appState));
}

// Initialize active day's record in state (including opening balance rollover)
function checkAndInitializeDateRecord(dateStr) {
  if (!appState.dailyRecords[dateStr]) {
    // If no record exists for this date, find the most recent previous date with data
    const sortedDates = Object.keys(appState.dailyRecords).sort();
    let rolledOverBalances = {};
    
    // Default all accounts to 0.00 opening balance
    ACCOUNTS.forEach(acc => {
      rolledOverBalances[acc] = 0;
    });

    if (sortedDates.length > 0) {
      // Find the latest date that is chronologically before the target dateStr
      let latestPrevDate = null;
      for (let i = sortedDates.length - 1; i >= 0; i--) {
        if (sortedDates[i] < dateStr) {
          latestPrevDate = sortedDates[i];
          break;
        }
      }
      
      // If we found a previous active day, roll over its closing balances
      if (latestPrevDate) {
        const prevDay = appState.dailyRecords[latestPrevDate];
        ACCOUNTS.forEach(acc => {
          const opening = prevDay.openingBalances[acc] || 0;
          const txs = prevDay.transactions || [];
          const credits = txs.filter(t => t.account === acc && t.type === 'credit').reduce((sum, t) => sum + t.amount, 0);
          const debits = txs.filter(t => t.account === acc && t.type === 'debit').reduce((sum, t) => sum + t.amount, 0);
          
          // Closing = Opening + Credit - Debit
          rolledOverBalances[acc] = opening + credits - debits;
        });
      }
    }

    // Create the fresh day state
    appState.dailyRecords[dateStr] = {
      notes: '',
      openingBalances: rolledOverBalances,
      transactions: []
    };
    
    saveState();
    showToast(`Rolled balances over for ${formatDateFriendly(dateStr)}`);
  }
}

// Get today's local date in YYYY-MM-DD format
function getTodayString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Get current system time in HH:MM format
function getCurrentTimeString() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ==========================================================================
// 3. THE SPA ROUTER
// ==========================================================================

function initRouter() {
  window.addEventListener('hashchange', handleRouting);
  // Trigger initial route parsing
  handleRouting();
}

function handleRouting() {
  const hash = window.location.hash || '#dashboard';
  // Normalize hash: if it starts with "#/", convert it to "#" format to prevent splitting errors
  const normalizedHash = hash.startsWith('#/') ? '#' + hash.substring(2) : hash;
  const parts = normalizedHash.split('/');
  const route = parts[0];
  
  // Set all views to inactive
  document.querySelectorAll('.app-view').forEach(view => view.classList.remove('active'));
  document.querySelectorAll('.bottom-nav .nav-item').forEach(item => item.classList.remove('active'));
  
  if (route === '#dashboard') {
    currentView = 'dashboard';
    document.getElementById('view-dashboard').classList.add('active');
    document.getElementById('nav-dashboard').classList.add('active');
    renderMainDashboard();
  } 
  else if (route === '#bank-detail') {
    currentView = 'bank-detail';
    
    // Extract bank name from hash if present, e.g. #bank-detail/Sami%20UBL
    if (parts[1]) {
      selectedBankName = decodeURIComponent(parts[1]);
    }
    
    document.getElementById('view-bank-detail').classList.add('active');
    document.getElementById('nav-ledger').classList.add('active');
    renderBankDetail();
  } 
  else if (route === '#transaction-form') {
    currentView = 'transaction-form';
    
    // Check if edit parameter is present: #transaction-form/edit/:txId
    if (parts[1] === 'edit' && parts[2]) {
      setupTransactionForm(parts[2]); // Edit Mode
    } else {
      setupTransactionForm(null); // Add Mode
    }
    
    document.getElementById('view-transaction-form').classList.add('active');
  } 
  else if (route === '#reports') {
    currentView = 'reports';
    document.getElementById('view-reports').classList.add('active');
    document.getElementById('nav-reports').classList.add('active');
    renderReports();
  } 
  else if (route === '#search') {
    currentView = 'search';
    document.getElementById('view-search').classList.add('active');
    renderSearchPage();
  } 
else if (route === '#notes') {
  currentView = 'notes';

  document.getElementById('view-notes').classList.add('active');
  document.getElementById('nav-notes').classList.add('active');

  renderNotes();
}
  else if (route === '#settings') {
    currentView = 'settings';
    document.getElementById('view-settings').classList.add('active');
    document.getElementById('nav-settings').classList.add('active');
    renderSettings();
  } 
  else {
    // Fallback to dashboard
    window.location.hash = '#dashboard';
  }
  
  // Scroll main container to top on navigation
  document.querySelector('.app-container').scrollTop = 0;
}

// ==========================================================================
// 4. MAIN DASHBOARD RENDERER
// ==========================================================================

function renderMainDashboard() {
  const activeDate = appState.currentDate;
  const dayData = appState.dailyRecords[activeDate];
  
  if (!dayData) return;
  
  let grandTotalOpening = 0;
  let grandTotalCredit = 0;
  let grandTotalDebit = 0;
  let grandTotalClosing = 0;
  let totalTransactionsCount = 0;
  
  const accountsListContainer = document.getElementById('dashboard-accounts-list');
  accountsListContainer.innerHTML = '';
  
  ACCOUNTS.forEach(acc => {
    const opening = dayData.openingBalances[acc] || 0;
    const txs = dayData.transactions.filter(t => t.account === acc);
    
    const credit = txs.filter(t => t.type === 'credit').reduce((sum, t) => sum + t.amount, 0);
    const debit = txs.filter(t => t.type === 'debit').reduce((sum, t) => sum + t.amount, 0);
    const closing = opening + credit - debit;
    
    grandTotalOpening += opening;
    grandTotalCredit += credit;
    grandTotalDebit += debit;
    grandTotalClosing += closing;
    totalTransactionsCount += txs.length;
    
    // Find last transaction time
    let lastTime = '--:--';
    if (txs.length > 0) {
      const sortedTxs = [...txs].sort((a,b) => b.timestamp - a.timestamp);
      lastTime = sortedTxs[0].time;
    }
    
    // Create bank row list element
    const bankRow = document.createElement('a');
    bankRow.className = 'bank-row';
    bankRow.href = `#/bank-detail/${encodeURIComponent(acc)}`;
    
    const balanceDiff = credit - debit;
    let diffClass = 'text-muted';
    let diffSymbol = '';
    if (balanceDiff > 0) {
      diffClass = 'text-green';
      diffSymbol = '+';
    } else if (balanceDiff < 0) {
      diffClass = 'text-red';
      diffSymbol = '-';
    }
    
    bankRow.innerHTML = `
      <div class="bank-row-info">
        <span class="bank-row-name">${acc}</span>
        <span class="bank-row-meta">${txs.length} txs • Last: ${lastTime}</span>
      </div>
      <div class="bank-row-balances">
        <span class="bank-row-closing">${formatCurrency(closing)}</span>
        <span class="bank-row-diffs">
          <span class="text-muted">Op: ${formatCurrency(opening)}</span>
          <span class="${diffClass}">${diffSymbol}${formatCurrency(Math.abs(balanceDiff))}</span>
        </span>
      </div>
    `;
    accountsListContainer.appendChild(bankRow);
  });
  
  // Render Dashboard Top Stat Cards
  document.getElementById('total-opening').textContent = formatCurrency(grandTotalOpening);
  document.getElementById('total-credit').textContent = formatCurrency(grandTotalCredit);
  document.getElementById('total-debit').textContent = formatCurrency(grandTotalDebit);
  document.getElementById('total-closing').textContent = formatCurrency(grandTotalClosing);
  
  // Update transaction counter badge
  document.getElementById('tx-counter-badge').textContent = `${totalTransactionsCount} Transaction${totalTransactionsCount === 1 ? '' : 's'}`;
  
  // Toggle Undo Button state
  const undoBtn = document.getElementById('btn-undo-last');
  if (appState.lastCreatedTxId) {
    undoBtn.removeAttribute('disabled');
  } else {
    undoBtn.setAttribute('disabled', 'true');
  }
}

// ==========================================================================
// 5. BANK LEDGER VIEW RENDERER
// ==========================================================================

function renderBankDetail() {
  const activeDate = appState.currentDate;
  const dayData = appState.dailyRecords[activeDate];
  
  if (!dayData) return;
  
  // Update bank selector dropdown value
  const bankSelect = document.getElementById('bank-ledger-select');
  if (bankSelect) {
    bankSelect.value = selectedBankName;
  }
  
  document.getElementById('bank-detail-name').textContent = selectedBankName;
  document.getElementById('bank-detail-date').textContent = formatDateFriendly(activeDate);
  
  const opening = dayData.openingBalances[selectedBankName] || 0;
  const txs = dayData.transactions.filter(t => t.account === selectedBankName);
  
  // Sort transactions chronologically for running balance calculation
  const chronologicalTxs = [...txs].sort((a,b) => a.timestamp - b.timestamp);
  
  // Map transactions to calculate running balance
  let runningBalance = opening;
  const mappedTxs = chronologicalTxs.map(t => {
    if (t.type === 'credit') {
      runningBalance += t.amount;
    } else if (t.type === 'debit') {
      runningBalance -= t.amount;
    }
    return {
      ...t,
      currentRunningBalance: runningBalance
    };
  });
  
  // Totals calculations
  const totalCredit = txs.filter(t => t.type === 'credit').reduce((sum, t) => sum + t.amount, 0);
  const totalDebit = txs.filter(t => t.type === 'debit').reduce((sum, t) => sum + t.amount, 0);
  const expectedClosing = opening + totalCredit - totalDebit;
  
  // Find last transaction time
  let lastTime = '--:--';
  if (txs.length > 0) {
    const sortedTxs = [...txs].sort((a,b) => b.timestamp - a.timestamp);
    lastTime = sortedTxs[0].time;
  }
  
  // Inject values into profile statistics
  document.getElementById('bank-detail-opening').textContent = formatCurrency(opening);
  document.getElementById('bank-detail-credit').textContent = formatCurrency(totalCredit);
  document.getElementById('bank-detail-debit').textContent = formatCurrency(totalDebit);
  document.getElementById('bank-detail-closing').textContent = formatCurrency(expectedClosing);
  document.getElementById('bank-detail-tx-count').textContent = txs.length;
  document.getElementById('bank-detail-last-time').textContent = lastTime;
  
  // Dynamic Ledger History Rendering with Search & Filter
  const searchQuery = document.getElementById('ledger-search').value.toLowerCase().trim();
  const filterType = document.querySelector('.ledger-filter-chips .chip.active').dataset.type; // 'all', 'credit', 'debit'
  
  const ledgerContainer = document.getElementById('ledger-entries-list');
  ledgerContainer.innerHTML = '';
  
  // For UI listing: We reverse chronological mapped transactions to show newest first!
  const uiListedTxs = [...mappedTxs].reverse();
  
  // Apply filters
  const filteredTxs = uiListedTxs.filter(t => {
    // Type Filter
    if (filterType !== 'all' && t.type !== filterType) return false;
    
    // Search query match (Client or Remarks)
    if (searchQuery) {
      const matchClient = t.client.toLowerCase().includes(searchQuery);
      const matchRemarks = t.remarks.toLowerCase().includes(searchQuery);
      return matchClient || matchRemarks;
    }
    
    return true;
  });
  
  if (filteredTxs.length === 0) {
    ledgerContainer.innerHTML = `
      <div class="empty-state">
        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <h4>No transactions found</h4>
        <p>${searchQuery ? 'Try clearing search filters.' : 'Add your first transaction of the day.'}</p>
      </div>
    `;
    return;
  }
  
  filteredTxs.forEach(t => {
    const entryRow = document.createElement('div');
    // Differentiate system adjustments visually
    const isAdjustment = t.remarks.includes('Reconciliation') || t.remarks.includes('Correction') || t.remarks.includes('Adjustment');
    entryRow.className = `ledger-row type-${isAdjustment ? 'adjustment' : t.type}`;
    
    const formattedAmount = formatCurrency(t.amount);
    const amountPrefix = t.type === 'credit' ? '+' : '-';
    
    entryRow.innerHTML = `
      <div class="ledger-row-client">
        <span class="client-name-val">${t.client}</span>
        <span class="remarks-val">${t.remarks || '---'}</span>
      </div>
      <div class="ledger-row-amount">
        <span>${amountPrefix}${formattedAmount}</span>
        <span class="ledger-row-time">${t.time}</span>
      </div>
      <div class="ledger-row-balance">
        <span class="running-balance-val">${formatCurrency(t.currentRunningBalance)}</span>
        <div class="ledger-row-actions">
          <button class="btn-action-icon btn-edit" data-id="${t.id}" title="Edit Transaction">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"></path>
            </svg>
          </button>
          <button class="btn-action-icon btn-delete" data-id="${t.id}" title="Delete Transaction">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </div>
      </div>
    `;
    
    // Attach event listeners to buttons dynamically
    entryRow.querySelector('.btn-edit').addEventListener('click', () => {
      window.location.hash = `#/transaction-form/edit/${t.id}`;
    });
    
    entryRow.querySelector('.btn-delete').addEventListener('click', () => {
      showDeleteConfirmationModal(t);
    });
    
    ledgerContainer.appendChild(entryRow);
  });
}

// ==========================================================================
// 6. TRANSACTION FORM RENDERER & ACTIONS
// ==========================================================================

function setupTransactionForm(editTxId = null) {
  const activeDate = appState.currentDate;
  const form = document.getElementById('tx-form');
  form.reset();
  
  // Hide Duplicate warning initially
  document.getElementById('duplicate-warning').classList.add('hidden');
  
  // Populate Bank select dropdown
  const bankDropdown = document.getElementById('tx-bank');
  bankDropdown.innerHTML = '';
  ACCOUNTS.forEach(acc => {
    const opt = document.createElement('option');
    opt.value = acc;
    opt.textContent = acc;
    bankDropdown.appendChild(opt);
  });

  // Pre-select current active bank
  bankDropdown.value = selectedBankName;

  if (editTxId) {
    // EDIT MODE
    document.getElementById('form-title').textContent = 'Edit Transaction';
    
    // Locate transaction in history
    let matchedTx = null;
    let matchedDate = null;
    
    // Iterate daily logs to find the transaction
    for (const date in appState.dailyRecords) {
      const found = appState.dailyRecords[date].transactions.find(t => t.id === editTxId);
      if (found) {
        matchedTx = found;
        matchedDate = date;
        break;
      }
    }
    
    if (matchedTx) {
      document.getElementById('tx-id').value = matchedTx.id;
      document.getElementById('tx-date').value = matchedDate;
      document.getElementById('tx-time').value = matchedTx.time;
      document.getElementById('tx-bank').value = matchedTx.account;
      document.getElementById('tx-amount').value = matchedTx.amount;
      document.getElementById('tx-client').value = matchedTx.client;
      document.getElementById('tx-remarks').value = matchedTx.remarks;
      
      if (matchedTx.type === 'credit') {
        document.getElementById('type-credit').checked = true;
      } else {
        document.getElementById('type-debit').checked = true;
      }
    } else {
      showToast('Error: Transaction not found.');
      window.location.hash = '#dashboard';
    }
  } else {
    // ADD MODE
    document.getElementById('form-title').textContent = 'Add Transaction';
    document.getElementById('tx-id').value = '';
    document.getElementById('tx-date').value = activeDate;
    document.getElementById('tx-time').value = getCurrentTimeString();
    document.getElementById('type-credit').checked = true;
  }
  
  // Update suggestions chips
  renderClientSuggestions();
}

// Client Suggestion Chips Rendering
function renderClientSuggestions() {
  const recentChipsContainer = document.getElementById('frequent-clients-chips');
  recentChipsContainer.innerHTML = '';
  
  // Deduplicate and get the top 5 recently/frequently used clients
  // We can scan the recent transactions for client names
  const allTxs = [];
  for (const date in appState.dailyRecords) {
    allTxs.push(...appState.dailyRecords[date].transactions);
  }
  
  // Sort all transactions by timestamp descending
  allTxs.sort((a,b) => b.timestamp - a.timestamp);
  
  const recentClients = [];
  for (let i = 0; i < allTxs.length; i++) {
    const cName = allTxs[i].client;
    if (cName && !recentClients.includes(cName)) {
      recentClients.push(cName);
      if (recentClients.length >= 5) break;
    }
  }
  
  // Fallback to default suggestions if we have fewer than 3 recent entries
  const suggestList = recentClients.length >= 3 ? recentClients : appState.clientRegistry.slice(0, 5);
  
  suggestList.forEach(clientName => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'suggest-chip';
    chip.textContent = clientName;
    chip.addEventListener('click', () => {
      document.getElementById('tx-client').value = clientName;
      // Close autocomplete list if open
      document.getElementById('client-autocomplete-list').style.display = 'none';
      checkDuplicateTransaction();
    });
    recentChipsContainer.appendChild(chip);
  });
}

// Check for duplicate transaction within the same day and bank account
function checkDuplicateTransaction() {
  const txId = document.getElementById('tx-id').value;
  const dateVal = document.getElementById('tx-date').value;
  const bankVal = document.getElementById('tx-bank').value;
  const typeVal = document.querySelector('input[name="tx-type"]:checked').value;
  const amountVal = parseFloat(document.getElementById('tx-amount').value) || 0;
  const clientVal = document.getElementById('tx-client').value.trim().toLowerCase();
  
  const warningContainer = document.getElementById('duplicate-warning');
  
  if (!bankVal || !clientVal || amountVal <= 0) {
    warningContainer.classList.add('hidden');
    return;
  }
  
  const dayData = appState.dailyRecords[dateVal];
  if (!dayData) {
    warningContainer.classList.add('hidden');
    return;
  }
  
  // Find match in transactions on this date for the selected bank account
  const duplicate = dayData.transactions.find(t => {
    // Skip if it's the transaction we are currently editing
    if (txId && t.id === txId) return false;
    
    return t.account === bankVal && 
           t.type === typeVal && 
           t.amount === amountVal && 
           t.client.toLowerCase() === clientVal;
  });
  
  if (duplicate) {
    warningContainer.classList.remove('hidden');
  } else {
    warningContainer.classList.add('hidden');
  }
}

// Save/Post Transaction from Form submission
function handleTransactionSubmit(event) {
  event.preventDefault();
  
  const txId = document.getElementById('tx-id').value;
  const dateVal = document.getElementById('tx-date').value;
  const timeVal = document.getElementById('tx-time').value;
  const bankVal = document.getElementById('tx-bank').value;
  const typeVal = document.querySelector('input[name="tx-type"]:checked').value;
  const amountVal = parseFloat(document.getElementById('tx-amount').value);
  const clientVal = document.getElementById('tx-client').value.trim();
  const remarksVal = document.getElementById('tx-remarks').value.trim();
  
  if (!dateVal || !timeVal || !bankVal || isNaN(amountVal) || amountVal <= 0 || !clientVal) {
    showToast('Please fill out all required fields with valid data.');
    return;
  }
  
  // Initialize date record if needed (just in case they picked a future date)
  checkAndInitializeDateRecord(dateVal);
  
  // Compose date timestamp
  const dateParts = dateVal.split('-');
  const timeParts = timeVal.split(':');
  const timestamp = new Date(dateParts[0], dateParts[1] - 1, dateParts[2], timeParts[0], timeParts[1]).getTime();
  
  // Create state structure
  const txData = {
    id: txId || 'tx-' + Date.now() + Math.random().toString(36).substr(2, 4),
    timestamp,
    time: timeVal,
    account: bankVal,
    type: typeVal,
    amount: amountVal,
    client: clientVal,
    remarks: remarksVal
  };
  
  // Check if client name is in the registry, if not, add it
  if (!appState.clientRegistry.some(c => c.toLowerCase() === clientVal.toLowerCase())) {
    appState.clientRegistry.unshift(clientVal); // Add to autocomplete suggestions
    if (appState.clientRegistry.length > 100) appState.clientRegistry.pop(); // Cap it
  }
  
  const activeRecord = appState.dailyRecords[dateVal];
  
  if (txId) {
    // EDIT RECORD
    // Remove from whichever date record it was originally under
    for (const dt in appState.dailyRecords) {
      const idx = appState.dailyRecords[dt].transactions.findIndex(t => t.id === txId);
      if (idx !== -1) {
        appState.dailyRecords[dt].transactions.splice(idx, 1);
        break;
      }
    }
    // Append to current date record
    activeRecord.transactions.push(txData);
    showToast('Transaction updated successfully.');
  } else {
    // ADD RECORD
    activeRecord.transactions.push(txData);
    appState.lastCreatedTxId = txData.id; // Save for Undo
    showToast('Transaction added successfully.');
  }
  
  // Sort day's transactions chronologically to keep ledger orderly
  activeRecord.transactions.sort((a,b) => a.timestamp - b.timestamp);
  
  saveState();
  
  // Routing back: If selected bank matches, go back to ledger view, else go back to dashboard
  selectedBankName = bankVal;
  window.location.hash = `#/bank-detail/${encodeURIComponent(bankVal)}`;
}

// Undo Last Posted Transaction
function undoLastTransaction() {
  if (!appState.lastCreatedTxId) return;
  
  const undoId = appState.lastCreatedTxId;
  let matchedTx = null;
  let matchedDate = null;
  
  for (const date in appState.dailyRecords) {
    const idx = appState.dailyRecords[date].transactions.findIndex(t => t.id === undoId);
    if (idx !== -1) {
      matchedTx = appState.dailyRecords[date].transactions[idx];
      appState.dailyRecords[date].transactions.splice(idx, 1);
      matchedDate = date;
      break;
    }
  }
  
  if (matchedTx) {
    showToast(`Undone: ${matchedTx.client} (${formatCurrency(matchedTx.amount)}) deleted.`);
    appState.lastCreatedTxId = null; // Clear undo cache
    saveState();
    renderApp();
  } else {
    showToast('No transaction found to undo.');
  }
}

// Confirm Delete Dialog Modal
let transactionToDelete = null;
function showDeleteConfirmationModal(tx) {
  transactionToDelete = tx;
  const summaryDiv = document.getElementById('delete-tx-details');
  summaryDiv.innerHTML = `
    <strong>Bank Account:</strong> ${tx.account}<br>
    <strong>Client:</strong> ${tx.client}<br>
    <strong>Type:</strong> ${tx.type.toUpperCase()}<br>
    <strong>Amount:</strong> ${formatCurrency(tx.amount)}<br>
    <strong>Time:</strong> ${tx.time}
  `;
  openModal('modal-delete-confirm');
}

function executeTransactionDelete() {
  if (!transactionToDelete) return;
  
  const txId = transactionToDelete.id;
  let deleted = false;
  
  for (const date in appState.dailyRecords) {
    const idx = appState.dailyRecords[date].transactions.findIndex(t => t.id === txId);
    if (idx !== -1) {
      appState.dailyRecords[date].transactions.splice(idx, 1);
      deleted = true;
      break;
    }
  }
  
  if (deleted) {
    showToast('Transaction deleted successfully.');
    // Clear last transaction cache if this was the one deleted
    if (appState.lastCreatedTxId === txId) {
      appState.lastCreatedTxId = null;
    }
    saveState();
    closeAllModals();
    renderApp();
  }
  
  transactionToDelete = null;
}

// ==========================================================================
// 7. FINANCIAL REPORTS GENERATOR
// ==========================================================================

function renderReports() {
  // Initialize report controls with selected date
  const dailyReportDateInput = document.getElementById('report-daily-date');
  if (!dailyReportDateInput.value) {
    dailyReportDateInput.value = appState.currentDate;
  }
  
  const bankSelect = document.getElementById('report-bank-select');
  if (bankSelect.children.length === 0) {
    ACCOUNTS.forEach(acc => {
      const opt = document.createElement('option');
      opt.value = acc;
      opt.textContent = acc;
      bankSelect.appendChild(opt);
    });
    
    // Set default bank-wise start/end date range (Start: beginning of current month, End: today)
    const d = new Date();
    const startStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
    document.getElementById('report-bank-start').value = startStr;
    document.getElementById('report-bank-end').value = appState.currentDate;
    
    // Add same date range to client-wise search
    document.getElementById('report-daily-date').value = appState.currentDate;
  }

  // Trigger active report tab layout loading
  triggerReportGeneration();
}

function triggerReportGeneration() {
  if (activeReportTab === 'tab-daily') {
    generateDailyReport();
  } else if (activeReportTab === 'tab-bank') {
    generateBankReport();
  } else if (activeReportTab === 'tab-client') {
    generateClientReport();
  }
}

// Tab 1: Daily Summary Report
function generateDailyReport() {
  const targetDate = document.getElementById('report-daily-date').value;
  const tableBody = document.querySelector('#report-daily-table tbody');
  const tableFoot = document.querySelector('#report-daily-table tfoot');
  
  tableBody.innerHTML = '';
  tableFoot.innerHTML = '';
  
  const dayData = appState.dailyRecords[targetDate];
  if (!dayData) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5" class="text-muted" style="text-align: center; padding: 24px;">
          No financial logs found for ${formatDateFriendly(targetDate)}.
        </td>
      </tr>
    `;
    return;
  }
  
  let grandOpening = 0;
  let grandCredit = 0;
  let grandDebit = 0;
  let grandClosing = 0;
  
  ACCOUNTS.forEach(acc => {
    const opening = dayData.openingBalances[acc] || 0;
    const txs = dayData.transactions.filter(t => t.account === acc);
    const credit = txs.filter(t => t.type === 'credit').reduce((sum,t) => sum+t.amount, 0);
    const debit = txs.filter(t => t.type === 'debit').reduce((sum,t) => sum+t.amount, 0);
    const closing = opening + credit - debit;
    
    grandOpening += opening;
    grandCredit += credit;
    grandDebit += debit;
    grandClosing += closing;
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${acc}</strong></td>
      <td class="text-right text-blue">${formatCurrency(opening)}</td>
      <td class="text-right text-green">${formatCurrency(credit)}</td>
      <td class="text-right text-red">${formatCurrency(debit)}</td>
      <td class="text-right">${formatCurrency(closing)}</td>
    `;
    tableBody.appendChild(tr);
  });
  
  // Footer aggregate totals
  tableFoot.innerHTML = `
    <tr>
      <td><strong>TOTALS</strong></td>
      <td class="text-right text-blue">${formatCurrency(grandOpening)}</td>
      <td class="text-right text-green">${formatCurrency(grandCredit)}</td>
      <td class="text-right text-red">${formatCurrency(grandDebit)}</td>
      <td class="text-right" style="font-size: 1rem;">${formatCurrency(grandClosing)}</td>
    </tr>
  `;
}

// Tab 2: Bank-wise Ledger Report (spanning custom dates)
function generateBankReport() {
  const bankName = document.getElementById('report-bank-select').value;
  const startDate = document.getElementById('report-bank-start').value;
  const endDate = document.getElementById('report-bank-end').value;
  
  const statsContainer = document.getElementById('report-bank-stats');
  const tableBody = document.querySelector('#report-bank-table tbody');
  
  statsContainer.innerHTML = '';
  tableBody.innerHTML = '';
  
  if (!bankName || !startDate || !endDate) return;
  
  // Find all active records within our selected dates
  const sortedDates = Object.keys(appState.dailyRecords).sort();
  const dateRange = sortedDates.filter(d => d >= startDate && d <= endDate);
  
  let collectedTxs = [];
  
  // Loop date ranges and collect matching bank transactions
  dateRange.forEach(dateStr => {
    const dayData = appState.dailyRecords[dateStr];
    const dayOpening = dayData.openingBalances[bankName] || 0;
    
    const dayTxs = dayData.transactions.filter(t => t.account === bankName).map(t => ({
      ...t,
      dateString: dateStr,
      dayOpening: dayOpening
    }));
    
    collectedTxs.push(...dayTxs);
  });
  
  // Sort collected transactions chronologically
  collectedTxs.sort((a,b) => {
    if (a.dateString !== b.dateString) {
      return a.dateString.localeCompare(b.dateString);
    }
    return a.timestamp - b.timestamp;
  });
  
  if (collectedTxs.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" class="text-muted" style="text-align: center; padding: 24px;">
          No transactions recorded for ${bankName} within selected dates.
        </td>
      </tr>
    `;
    return;
  }
  
  // Calculate running balances chronologically
  let runBal = 0;
  let lastDate = null;
  let totalCredit = 0;
  let totalDebit = 0;
  
  const renderedRows = collectedTxs.map(t => {
    // If we transition to a new date, reset running balance starting from that date's opening balance
    if (t.dateString !== lastDate) {
      runBal = t.dayOpening;
      lastDate = t.dateString;
    }
    
    if (t.type === 'credit') {
      runBal += t.amount;
      totalCredit += t.amount;
    } else if (t.type === 'debit') {
      runBal -= t.amount;
      totalDebit += t.amount;
    }
    
    return {
      ...t,
      runningVal: runBal
    };
  });
  
  // Inject summary stats cards
  const netChange = totalCredit - totalDebit;
  const netClass = netChange >= 0 ? 'text-green' : 'text-red';
  const netSymbol = netChange >= 0 ? '+' : '';
  
  statsContainer.innerHTML = `
    <div class="stat-panel-card">
      <h4>Total Credit</h4>
      <span class="stat-val text-green">${formatCurrency(totalCredit)}</span>
    </div>
    <div class="stat-panel-card">
      <h4>Total Debit</h4>
      <span class="stat-val text-red">${formatCurrency(totalDebit)}</span>
    </div>
    <div class="stat-panel-card">
      <h4>Net Position</h4>
      <span class="stat-val ${netClass}">${netSymbol}${formatCurrency(netChange)}</span>
    </div>
  `;
  
  // Render table rows (Chronological view)
  renderedRows.forEach(row => {
    const tr = document.createElement('tr');
    const displayDate = row.dateString.substring(5); // Show MM-DD for compact layout
    
    const crVal = row.type === 'credit' ? formatCurrency(row.amount) : '---';
    const dbVal = row.type === 'debit' ? formatCurrency(row.amount) : '---';
    
    const crClass = row.type === 'credit' ? 'text-green' : 'text-muted';
    const dbClass = row.type === 'debit' ? 'text-red' : 'text-muted';
    
    tr.innerHTML = `
      <td><span class="text-muted" style="font-size:0.75rem;">${displayDate}</span> ${row.time}</td>
      <td><strong>${row.client}</strong></td>
      <td class="text-right ${crClass}">${crVal}</td>
      <td class="text-right ${dbClass}">${dbVal}</td>
      <td class="text-right"><strong>${formatCurrency(row.runningVal)}</strong></td>
      <td><span class="text-muted" style="font-size:0.78rem;">${row.remarks || '---'}</span></td>
    `;
    tableBody.appendChild(tr);
  });
}

// Tab 3: Client-wise Summary Report
function generateClientReport() {
  const clientName = document.getElementById('report-client-input').value.trim();
  const statsContainer = document.getElementById('report-client-stats');
  const tableBody = document.querySelector('#report-client-table tbody');
  
  statsContainer.innerHTML = '';
  tableBody.innerHTML = '';
  
  if (!clientName) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5" class="text-muted" style="text-align: center; padding: 24px;">
          Type a client name above to view histories.
        </td>
      </tr>
    `;
    return;
  }
  
  let matchingTxs = [];
  
  // Search client transactions across all historical dates
  for (const date in appState.dailyRecords) {
    const dayTxs = appState.dailyRecords[date].transactions.filter(t => 
      t.client.toLowerCase() === clientName.toLowerCase()
    ).map(t => ({
      ...t,
      dateString: date
    }));
    matchingTxs.push(...dayTxs);
  }
  
  // Sort chronologically
  matchingTxs.sort((a,b) => {
    if (a.dateString !== b.dateString) {
      return a.dateString.localeCompare(b.dateString);
    }
    return a.timestamp - b.timestamp;
  });
  
  if (matchingTxs.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5" class="text-muted" style="text-align: center; padding: 24px;">
          No records found for client "${clientName}".
        </td>
      </tr>
    `;
    return;
  }
  
  let totalCredit = 0;
  let totalDebit = 0;
  
  matchingTxs.forEach(t => {
    if (t.type === 'credit') totalCredit += t.amount;
    if (t.type === 'debit') totalDebit += t.amount;
    
    const tr = document.createElement('tr');
    const crVal = t.type === 'credit' ? formatCurrency(t.amount) : '---';
    const dbVal = t.type === 'debit' ? formatCurrency(t.amount) : '---';
    
    tr.innerHTML = `
      <td><span class="text-muted" style="font-size:0.75rem;">${t.dateString}</span> ${t.time}</td>
      <td><strong>${t.account}</strong></td>
      <td class="text-right text-green">${crVal}</td>
      <td class="text-right text-red">${dbVal}</td>
      <td><span class="text-muted" style="font-size:0.78rem;">${t.remarks || '---'}</span></td>
    `;
    tableBody.appendChild(tr);
  });
  
  // Client balance metrics
  statsContainer.innerHTML = `
    <div class="stat-panel-card">
      <h4>Total Inbound (Credit)</h4>
      <span class="stat-val text-green">${formatCurrency(totalCredit)}</span>
    </div>
    <div class="stat-panel-card">
      <h4>Total Outbound (Debit)</h4>
      <span class="stat-val text-red">${formatCurrency(totalDebit)}</span>
    </div>
    <div class="stat-panel-card">
      <h4>Net Balance Flow</h4>
      <span class="stat-val ${totalCredit - totalDebit >= 0 ? 'text-green' : 'text-red'}">
        ${totalCredit - totalDebit >= 0 ? '+' : ''}${formatCurrency(totalCredit - totalDebit)}
      </span>
    </div>
  `;
}

// ==========================================================================
// 8. GLOBAL SEARCH & ADVANCED FILTER PANEL
// ==========================================================================

function renderSearchPage() {
  // Populate filter dropdowns if empty
  const filterBankSelect = document.getElementById('filter-bank');
  if (filterBankSelect.children.length === 1) { // Only holds 'All Accounts' option
    ACCOUNTS.forEach(acc => {
      const opt = document.createElement('option');
      opt.value = acc;
      opt.textContent = acc;
      filterBankSelect.appendChild(opt);
    });
    
    // Set default filter date ranges to current day
    document.getElementById('filter-start-date').value = appState.currentDate;
    document.getElementById('filter-end-date').value = appState.currentDate;
  }
  
  executeGlobalSearch();
}

function executeGlobalSearch() {
  const bankVal = document.getElementById('filter-bank').value;
  const typeVal = document.getElementById('filter-type').value;
  const startVal = document.getElementById('filter-start-date').value;
  const endVal = document.getElementById('filter-end-date').value;
  const clientQuery = document.getElementById('filter-client').value.toLowerCase().trim();
  
  const resultsContainer = document.getElementById('search-results-list');
  const badgeEl = document.getElementById('search-results-badge');
  resultsContainer.innerHTML = '';
  
  let searchPool = [];
  
  // 1. Filter Date Ranges
  for (const date in appState.dailyRecords) {
    if (startVal && date < startVal) continue;
    if (endVal && date > endVal) continue;
    
    const dayTxs = appState.dailyRecords[date].transactions.map(t => ({
      ...t,
      dateString: date
    }));
    searchPool.push(...dayTxs);
  }
  
  // 2. Filter Bank, Type, and Client Matches
  const results = searchPool.filter(t => {
    if (bankVal && t.account !== bankVal) return false;
    if (typeVal && t.type !== typeVal) return false;
    if (clientQuery && !t.client.toLowerCase().includes(clientQuery)) return false;
    return true;
  });
  
  // Sort Results (Newest Date/Time first)
  results.sort((a,b) => {
    if (a.dateString !== b.dateString) {
      return b.dateString.localeCompare(a.dateString);
    }
    return b.timestamp - a.timestamp;
  });
  
  badgeEl.textContent = `${results.length} found`;
  
  if (results.length === 0) {
    resultsContainer.innerHTML = `
      <div class="empty-state">
        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <h4>No transactions match search filters</h4>
        <p>Try clearing filters to expand matches.</p>
      </div>
    `;
    return;
  }
  
  // Render Result Rows
  results.forEach(t => {
    const row = document.createElement('div');
    row.className = `ledger-row search-layout type-${t.type}`;
    
    const amtPrefix = t.type === 'credit' ? '+' : '-';
    
    row.innerHTML = `
      <div class="ledger-row-client">
        <span class="client-name-val">${t.client}</span>
        <span class="remarks-val" style="font-size:0.72rem;">${t.dateString} • <strong>${t.account}</strong></span>
      </div>
      <div class="ledger-row-amount">
        <span>${amtPrefix}${formatCurrency(t.amount)}</span>
        <span class="ledger-row-time">${t.time}</span>
      </div>
      <div class="ledger-row-balance" style="flex-direction:row; justify-content:flex-end;">
        <button class="btn-action-icon btn-edit" data-id="${t.id}" title="Edit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"></path></svg>
        </button>
      </div>
    `;
    
    row.querySelector('.btn-edit').addEventListener('click', () => {
      window.location.hash = `#/transaction-form/edit/${t.id}`;
    });
    
    resultsContainer.appendChild(row);
  });
}

// ==========================================================================
// 9. APP TOOLS & SETTINGS RENDERER
// ==========================================================================

function renderNotes() {
  const activeDate = appState.currentDate;
  const dayData = appState.dailyRecords[activeDate];

  document.getElementById('notes-current-date').textContent =
    formatDateFriendly(activeDate);

  const notesBox = document.getElementById('daily-notes');

  if (dayData) {
    notesBox.value = dayData.notes || '';
  } else {
    notesBox.value = '';
  }
}
function renderSettings() {
  const activeDate = appState.currentDate;
  const dayData = appState.dailyRecords[activeDate];
  
  if (dayData) {
    document.getElementById('settings-day-notes').value = dayData.notes || '';
  }
}

// Save Daily notes
function saveDailyNotes() {
  const activeDate = appState.currentDate;
  const notesBox = document.getElementById('daily-notes');

if (!notesBox) return;

const notesText = notesBox.value.trim();
  
  if (appState.dailyRecords[activeDate]) {
    appState.dailyRecords[activeDate].notes = notesText;
    saveState();
  }
}

// ==========================================================================
// 10. BACKUP & EXPORTS UTILITIES
// ==========================================================================

// JSON Backup Export
function exportJSONBackup() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appState, null, 2));
  const dlAnchorElem = document.createElement('a');
  dlAnchorElem.setAttribute("href", dataStr);
  
  const timestamp = new Date().toISOString().slice(0,10);
  dlAnchorElem.setAttribute("download", `exchange_ledger_backup_${timestamp}.json`);
  dlAnchorElem.click();
  showToast('JSON backup file downloaded.');
}

// JSON Backup Import
function importJSONBackup(event) {
  const fileReader = new FileReader();
  const file = event.target.files[0];
  
  if (!file) return;
  
  fileReader.onload = function(e) {
    try {
      const parsedData = JSON.parse(e.target.result);
      
      // Basic schema validations
      if (parsedData.dailyRecords && parsedData.clientRegistry) {
        appState = parsedData;
        saveState();
        showToast('Data imported and restored successfully.');
        
        // Refresh page inputs to imported data date
        const dateInput = document.getElementById('global-date');
        dateInput.value = appState.currentDate;
        
        renderApp();
      } else {
        showToast('Import Failed: Invalid backup file schema.');
      }
    } catch (err) {
      console.error(err);
      showToast('Import Failed: Parsing error.');
    }
  };
  fileReader.readAsText(file);
}

// CSV Exporter (Helper)
function downloadCSV(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Export Daily Report to CSV
function exportDailyReportCSV() {
  const targetDate = document.getElementById('report-daily-date').value;
  const dayData = appState.dailyRecords[targetDate];
  
  if (!dayData) {
    showToast('No data to export.');
    return;
  }
  
  let csv = 'Bank Account,Opening Balance,Total Credit,Total Debit,Closing Balance\r\n';
  
  let grandOpening = 0;
  let grandCredit = 0;
  let grandDebit = 0;
  let grandClosing = 0;
  
  ACCOUNTS.forEach(acc => {
    const opening = dayData.openingBalances[acc] || 0;
    const txs = dayData.transactions.filter(t => t.account === acc);
    const credit = txs.filter(t => t.type === 'credit').reduce((sum,t) => sum+t.amount, 0);
    const debit = txs.filter(t => t.type === 'debit').reduce((sum,t) => sum+t.amount, 0);
    const closing = opening + credit - debit;
    
    grandOpening += opening;
    grandCredit += credit;
    grandDebit += debit;
    grandClosing += closing;
    
    csv += `"${acc}",${opening},${credit},${debit},${closing}\r\n`;
  });
  
  csv += `TOTALS,${grandOpening},${grandCredit},${grandDebit},${grandClosing}\r\n`;
  
  downloadCSV(csv, `daily_report_${targetDate}.csv`);
  showToast('Daily Report CSV exported.');
}

// Export Bank-wise Ledger Report to CSV
function exportBankReportCSV() {
  const bankName = document.getElementById('report-bank-select').value;
  const startDate = document.getElementById('report-bank-start').value;
  const endDate = document.getElementById('report-bank-end').value;
  
  if (!bankName || !startDate || !endDate) return;
  
  const sortedDates = Object.keys(appState.dailyRecords).sort();
  const dateRange = sortedDates.filter(d => d >= startDate && d <= endDate);
  
  let collectedTxs = [];
  dateRange.forEach(dateStr => {
    const dayData = appState.dailyRecords[dateStr];
    const dayOpening = dayData.openingBalances[bankName] || 0;
    
    const dayTxs = dayData.transactions.filter(t => t.account === bankName).map(t => ({
      ...t,
      dateString: dateStr,
      dayOpening: dayOpening
    }));
    
    collectedTxs.push(...dayTxs);
  });
  
  collectedTxs.sort((a,b) => {
    if (a.dateString !== b.dateString) {
      return a.dateString.localeCompare(b.dateString);
    }
    return a.timestamp - b.timestamp;
  });
  
  if (collectedTxs.length === 0) {
    showToast('No records to export in this range.');
    return;
  }
  
  let csv = 'Date,Time,Client Name,Credit (In),Debit (Out),Running Balance,Remarks\r\n';
  
  let runBal = 0;
  let lastDate = null;
  
  collectedTxs.forEach(t => {
    if (t.dateString !== lastDate) {
      runBal = t.dayOpening;
      lastDate = t.dateString;
    }
    
    if (t.type === 'credit') runBal += t.amount;
    if (t.type === 'debit') runBal -= t.amount;
    
    const crAmt = t.type === 'credit' ? t.amount : 0;
    const dbAmt = t.type === 'debit' ? t.amount : 0;
    
    csv += `${t.dateString},${t.time},"${t.client.replace(/"/g, '""')}",${crAmt},${dbAmt},${runBal},"${(t.remarks || '').replace(/"/g, '""')}"\r\n`;
  });
  
  downloadCSV(csv, `${bankName.replace(/\s+/g, '_')}_ledger_${startDate}_to_${endDate}.csv`);
  showToast('Bank Ledger CSV exported.');
}

// Export Client-wise Ledger Report to CSV
function exportClientReportCSV() {
  const clientName = document.getElementById('report-client-input').value.trim();
  if (!clientName) return;
  
  let matchingTxs = [];
  for (const date in appState.dailyRecords) {
    const dayTxs = appState.dailyRecords[date].transactions.filter(t => 
      t.client.toLowerCase() === clientName.toLowerCase()
    ).map(t => ({
      ...t,
      dateString: date
    }));
    matchingTxs.push(...dayTxs);
  }
  
  matchingTxs.sort((a,b) => {
    if (a.dateString !== b.dateString) {
      return a.dateString.localeCompare(b.dateString);
    }
    return a.timestamp - b.timestamp;
  });
  
  if (matchingTxs.length === 0) {
    showToast('No client transactions to export.');
    return;
  }
  
  let csv = 'Date,Time,Bank Account,Credit (In),Debit (Out),Remarks\r\n';
  
  matchingTxs.forEach(t => {
    const crAmt = t.type === 'credit' ? t.amount : 0;
    const dbAmt = t.type === 'debit' ? t.amount : 0;
    csv += `${t.dateString},${t.time},"${t.account}",${crAmt},${dbAmt},"${(t.remarks || '').replace(/"/g, '""')}"\r\n`;
  });
  
  downloadCSV(csv, `client_${clientName.replace(/\s+/g, '_')}_report.csv`);
  showToast('Client records CSV exported.');
}

// Factory Reset App Data
function executeFactoryReset() {
  if (confirm('Are you absolutely sure you want to delete all ledger history? This cannot be undone.')) {
    localStorage.removeItem('exchange_ledger_state');
    appState = JSON.parse(JSON.stringify(INITIAL_STATE));
    saveState();
    
    // Refresh parameters
    const dateInput = document.getElementById('global-date');
    dateInput.value = appState.currentDate;
    
    checkAndInitializeDateRecord(appState.currentDate);
    showToast('All app data has been factory reset.');
    
    window.location.hash = '#dashboard';
    renderApp();
  }
}

// ==========================================================================
// 11. MORNING OPENING BALANCES MODAL LOGIC
// ==========================================================================

function openMorningOpeningModal() {
  const activeDate = appState.currentDate;
  const dayData = appState.dailyRecords[activeDate];
  
  if (!dayData) return;
  
  document.getElementById('opening-date-label').textContent = formatDateFriendly(activeDate);
  
  const container = document.getElementById('opening-fields-container');
  container.innerHTML = '';
  
  ACCOUNTS.forEach(acc => {
    const rawValue = dayData.openingBalances[acc];
    const val = rawValue === 0 ? '' : (rawValue ?? '');
    
    const fieldBox = document.createElement('div');
    fieldBox.className = 'opening-input-box';
    fieldBox.innerHTML = `
      <label for="op-${acc.replace(/\s+/g, '')}">${acc}</label>
      <input type="number" id="op-${acc.replace(/\s+/g, '')}" data-bank="${acc}" value="${val}" placeholder="0" step="any">
    `;
    container.appendChild(fieldBox);
  });
  
  openModal('modal-opening-balances');
}

function handleMorningOpeningSubmit(event) {
  event.preventDefault();
  const activeDate = appState.currentDate;
  const dayData = appState.dailyRecords[activeDate];
  
  if (!dayData) return;
  
  // Read inputs
  const inputs = document.querySelectorAll('#opening-fields-container input');
  inputs.forEach(input => {
    const bankName = input.dataset.bank;
    const value = parseFloat(input.value) || 0;
    dayData.openingBalances[bankName] = value;
  });
  
  saveState();
  showToast('Morning opening balances saved successfully.');
  closeAllModals();
  renderApp();
}

// Edit Single Bank Opening Balance
function openSingleOpeningModal() {
  const activeDate = appState.currentDate;
  const dayData = appState.dailyRecords[activeDate];
  
  if (!dayData) return;
  
  const currentVal = dayData.openingBalances[selectedBankName] || 0;
  
  document.getElementById('single-opening-bank-name').textContent = selectedBankName;
  document.getElementById('single-opening-bank-id').value = selectedBankName;
  document.getElementById('single-opening-amount').value = currentVal;
  
  openModal('modal-edit-single-opening');
}

function handleSingleOpeningSubmit(event) {
  event.preventDefault();
  const activeDate = appState.currentDate;
  const bankId = document.getElementById('single-opening-bank-id').value;
  const newValue = parseFloat(document.getElementById('single-opening-amount').value) || 0;
  
  if (appState.dailyRecords[activeDate] && bankId) {
    appState.dailyRecords[activeDate].openingBalances[bankId] = newValue;
    saveState();
    showToast(`Opening balance for ${bankId} updated.`);
    closeAllModals();
    renderApp();
  }
}

// Balance Adjustment Modal Entry
function openBalanceAdjustmentModal() {
  document.getElementById('adjust-bank-name').textContent = selectedBankName;
  document.getElementById('adjust-bank-id').value = selectedBankName;
  document.getElementById('form-balance-adjust').reset();
  openModal('modal-balance-adjust');
}

function handleBalanceAdjustmentSubmit(event) {
  event.preventDefault();
  
  const activeDate = appState.currentDate;
  const bankId = document.getElementById('adjust-bank-id').value;
  const adjustType = document.querySelector('input[name="adjust-type"]:checked').value;
  const amount = parseFloat(document.getElementById('adjust-amount').value) || 0;
  const reason = document.getElementById('adjust-reason').value;
  const remarks = document.getElementById('adjust-remarks').value.trim();
  
  if (!bankId || amount <= 0 || !reason || !remarks) {
    showToast('Please fill out all adjustment fields.');
    return;
  }
  
  // Build a transaction representing this adjustment
  const txData = {
    id: 'tx-' + Date.now() + Math.random().toString(36).substr(2, 4),
    timestamp: Date.now(),
    time: getCurrentTimeString(),
    account: bankId,
    type: adjustType,
    amount: amount,
    client: `[ADJUST] ${reason}`,
    remarks: remarks
  };
  
  if (appState.dailyRecords[activeDate]) {
    appState.dailyRecords[activeDate].transactions.push(txData);
    appState.dailyRecords[activeDate].transactions.sort((a,b) => a.timestamp - b.timestamp);
    saveState();
    showToast('Balance adjustment transaction posted.');
    closeAllModals();
    renderApp();
  }
}

// ==========================================================================
// 12. CALCULATOR postMessage INTEGRATION & API
// ==========================================================================

function setupCalculatorIntegration() {
  window.addEventListener('message', (event) => {
    // Process only authorized message sources
    if (event.data && event.data.source === 'currency-exchange-calc') {
      const action = event.data.action;
      
      if (action === 'ADD_TRANSACTION') {
        const payload = event.data.transaction;
        
        if (!payload) return;
        
        const account = payload.account;
        const type = payload.type; // 'credit' or 'debit'
        const amount = parseFloat(payload.amount);
        const client = payload.client || 'Calculator Deal';
        const remarks = payload.remarks || 'Auto-synced deal';
        
        // Basic validation
        if (!ACCOUNTS.includes(account)) {
          console.warn(`Sync Warning: Account "${account}" is not a recognized bank account.`);
          event.source.postMessage({ source: 'bank-ledger-api', status: 'error', message: 'Unknown bank account name' }, '*');
          return;
        }
        
        if (type !== 'credit' && type !== 'debit') {
          event.source.postMessage({ source: 'bank-ledger-api', status: 'error', message: 'Invalid transaction type' }, '*');
          return;
        }
        
        if (isNaN(amount) || amount <= 0) {
          event.source.postMessage({ source: 'bank-ledger-api', status: 'error', message: 'Invalid amount value' }, '*');
          return;
        }
        
        // Trigger auto transaction entry for today's active date
        const activeDate = appState.currentDate;
        checkAndInitializeDateRecord(activeDate);
        
        const newTx = {
          id: 'tx-api-' + Date.now() + Math.random().toString(36).substr(2, 4),
          timestamp: Date.now(),
          time: getCurrentTimeString(),
          account,
          type,
          amount,
          client,
          remarks
        };
        
        appState.dailyRecords[activeDate].transactions.push(newTx);
        appState.dailyRecords[activeDate].transactions.sort((a,b) => a.timestamp - b.timestamp);
        appState.lastCreatedTxId = newTx.id;
        
        // Add client name to registry if unique
        if (!appState.clientRegistry.some(c => c.toLowerCase() === client.toLowerCase())) {
          appState.clientRegistry.unshift(client);
        }
        
        saveState();
        showToast(`Auto-Synced deal: ${client} (${formatCurrency(amount)}) posted to ${account}`);
        
        // Re-render UI views
        renderApp();
        
        // Reply confirming message processed
        if (event.source) {
          event.source.postMessage({ source: 'bank-ledger-api', status: 'success', transactionId: newTx.id }, '*');
        }
      }
    }
  });
}

// Trigger Local test postMessage (Simulator)
function triggerTestCalculatorMessage() {
  const testMessage = {
    source: 'currency-exchange-calc',
    action: 'ADD_TRANSACTION',
    transaction: {
      account: 'Sami UBL',
      type: 'credit',
      amount: 150000,
      client: 'Test Sync Client',
      remarks: 'Mock auto integration test transaction'
    }
  };
  
  // Post message to self to execute local listener
  window.postMessage(testMessage, '*');
}

// ==========================================================================
// 13. DOM BINDINGS & EVENT LISTENERS
// ==========================================================================

function setupEventListeners() {
  // Theme Toggle Button click
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  
  // Datepicker value changed listener
  document.getElementById('global-date').addEventListener('change', (e) => {
    const newDate = e.target.value;
    if (newDate) {
      appState.currentDate = newDate;
      document.getElementById('notes-current-date').textContent = formatDateFriendly(newDate);
      saveState();
      checkAndInitializeDateRecord(newDate);
      renderApp();
    }
  });
  
  // Main Dashboard buttons
  document.getElementById('btn-quick-opening').addEventListener('click', openMorningOpeningModal);
  document.getElementById('btn-undo-last').addEventListener('click', undoLastTransaction);
  
  // Bank details buttons
  document.getElementById('btn-edit-single-opening').addEventListener('click', openSingleOpeningModal);
  document.getElementById('btn-manual-adjust').addEventListener('click', openBalanceAdjustmentModal);
  document.getElementById('btn-add-tx-from-bank').addEventListener('click', () => {
    window.location.hash = '#transaction-form';
  });
  
  // Bank switcher dropdown change listener
  document.getElementById('bank-ledger-select').addEventListener('change', (e) => {
    window.location.hash = `#/bank-detail/${encodeURIComponent(e.target.value)}`;
  });
  
  // Ledger inline Search keyup (with debounce simulation)
  let searchTimeout = null;
  document.getElementById('ledger-search').addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      renderBankDetail();
    }, 150);
  });
  
  // Ledger view filter chips
  document.querySelectorAll('.ledger-filter-chips .chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      document.querySelectorAll('.ledger-filter-chips .chip').forEach(c => c.classList.remove('active'));
      e.target.classList.add('active');
      renderBankDetail();
    });
  });
  
  // Transaction submission
  document.getElementById('tx-form').addEventListener('submit', handleTransactionSubmit);
  
  // Auto-fill warnings bindings
  document.getElementById('tx-amount').addEventListener('input', checkDuplicateTransaction);
  document.getElementById('tx-client').addEventListener('input', checkDuplicateTransaction);
  document.getElementById('tx-bank').addEventListener('change', checkDuplicateTransaction);
  document.querySelectorAll('input[name="tx-type"]').forEach(radio => {
    radio.addEventListener('change', checkDuplicateTransaction);
  });
  
  // Autocomplete Client List logic
  const clientInput = document.getElementById('tx-client');
  const autocompleteList = document.getElementById('client-autocomplete-list');
  
  clientInput.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase().trim();
    autocompleteList.innerHTML = '';
    
    if (!val) {
      autocompleteList.style.display = 'none';
      return;
    }
    
    const matches = appState.clientRegistry.filter(client => 
      client.toLowerCase().includes(val)
    );
    
    if (matches.length === 0) {
      autocompleteList.style.display = 'none';
      return;
    }
    
    matches.slice(0, 8).forEach(match => {
      const item = document.createElement('div');
      item.className = 'autocomplete-item';
      item.textContent = match;
      item.addEventListener('click', () => {
        clientInput.value = match;
        autocompleteList.style.display = 'none';
        checkDuplicateTransaction();
      });
      autocompleteList.appendChild(item);
    });
    
    autocompleteList.style.display = 'block';
  });
  
  // Close autocomplete list if user clicks outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.autocomplete-container')) {
      autocompleteList.style.display = 'none';
      document.getElementById('report-client-autocomplete').style.display = 'none';
    }
  });

  // Client-wise Report Autocomplete Search binding
  const reportClientInput = document.getElementById('report-client-input');
  const reportClientAutocomplete = document.getElementById('report-client-autocomplete');
  
  reportClientInput.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase().trim();
    reportClientAutocomplete.innerHTML = '';
    
    if (!val) {
      reportClientAutocomplete.style.display = 'none';
      generateClientReport();
      return;
    }
    
    const matches = appState.clientRegistry.filter(client => 
      client.toLowerCase().includes(val)
    );
    
    if (matches.length === 0) {
      reportClientAutocomplete.style.display = 'none';
      generateClientReport();
      return;
    }
    
    matches.slice(0, 8).forEach(match => {
      const item = document.createElement('div');
      item.className = 'autocomplete-item';
      item.textContent = match;
      item.addEventListener('click', () => {
        reportClientInput.value = match;
        reportClientAutocomplete.style.display = 'none';
        generateClientReport();
      });
      reportClientAutocomplete.appendChild(item);
    });
    
    reportClientAutocomplete.style.display = 'block';
  });
  
  // Report Tab toggles
  document.querySelectorAll('.tab-link').forEach(tabBtn => {
    tabBtn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-link').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      e.target.classList.add('active');
      const tabId = e.target.dataset.tab;
      document.getElementById(tabId).classList.add('active');
      activeReportTab = tabId;
      
      triggerReportGeneration();
    });
  });
  
  // Report inputs change binds
  document.getElementById('report-daily-date').addEventListener('change', generateDailyReport);
  document.getElementById('report-bank-select').addEventListener('change', generateBankReport);
  document.getElementById('report-bank-start').addEventListener('change', generateBankReport);
  document.getElementById('report-bank-end').addEventListener('change', generateBankReport);
  
  // Exports buttons binds
  document.getElementById('btn-export-daily').addEventListener('click', exportDailyReportCSV);
  document.getElementById('btn-export-bank-wise').addEventListener('click', exportBankReportCSV);
  document.getElementById('btn-export-client-wise').addEventListener('click', exportClientReportCSV);
  
  // Advanced Filter panel binding
  document.getElementById('btn-apply-filters').addEventListener('click', executeGlobalSearch);
  document.getElementById('btn-clear-filters').addEventListener('click', () => {
    document.getElementById('filter-bank').value = '';
    document.getElementById('filter-type').value = '';
    document.getElementById('filter-start-date').value = appState.currentDate;
    document.getElementById('filter-end-date').value = appState.currentDate;
    document.getElementById('filter-client').value = '';
    executeGlobalSearch();
  });
  
  // Modal dialog generic closures
  document.querySelectorAll('.modal-close-btn, .btn-close-modal').forEach(btn => {
    btn.addEventListener('click', closeAllModals);
  });
  
  // Modal specific submit triggers
  document.getElementById('form-morning-opening').addEventListener('submit', handleMorningOpeningSubmit);
  document.getElementById('form-edit-single-opening').addEventListener('submit', handleSingleOpeningSubmit);
  document.getElementById('form-balance-adjust').addEventListener('submit', handleBalanceAdjustmentSubmit);
  document.getElementById('btn-confirm-delete').addEventListener('click', executeTransactionDelete);
  
 let notesSaveTimer;

document.getElementById('daily-notes').addEventListener('input', () => {
    clearTimeout(notesSaveTimer);

    notesSaveTimer = setTimeout(() => {
        saveDailyNotes();
    }, 800);
});
 // Settings buttons bindings
  document.getElementById('btn-save-day-notes').addEventListener('click', saveDailyNotes);
  document.getElementById('btn-backup-export').addEventListener('click', exportJSONBackup);
  document.getElementById('btn-backup-import').addEventListener('change', importJSONBackup);
  document.getElementById('btn-factory-reset').addEventListener('click', executeFactoryReset);
  document.getElementById('btn-trigger-test-msg').addEventListener('click', triggerTestCalculatorMessage);
}

// ==========================================================================
// 12. GENERIC UTILITIES & UI POLISH
// ==========================================================================

// Central renderer router
function renderApp() {
  if (currentView === 'dashboard') {
    renderMainDashboard();
  } else if (currentView === 'bank-detail') {
    renderBankDetail();
  } else if (currentView === 'reports') {
    renderReports();
  } else if (currentView === 'search') {
    executeGlobalSearch();
  } else if (currentView === 'settings') {
    renderSettings();
  }
}

// Format numbers as currency with commas
function formatCurrency(amount) {
  return Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// Friendly date formatting: e.g. "Jul 6, 2026"
function formatDateFriendly(dateStr) {
  if (!dateStr) return '';
  const dateParts = dateStr.split('-');
  const date = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

// Toast Notifications
let toastTimeout = null;
function showToast(message) {
  const toast = document.getElementById('toast');
  document.getElementById('toast-message').textContent = message;
  
  toast.classList.remove('hidden');
  
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.add('hidden');
  }, 3500);
}

// Modal open/close actions
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
  }
}

function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.classList.remove('active');
  });
}

// Theme Handlers
function initTheme() {
  if (appState.settings.darkMode) {
    document.body.classList.add('dark-mode');
    document.body.classList.remove('light-mode');
  } else {
    document.body.classList.add('light-mode');
    document.body.classList.remove('dark-mode');
  }
}

function toggleTheme() {
  appState.settings.darkMode = !appState.settings.darkMode;
  saveState();
  initTheme();
  showToast(`Switched to ${appState.settings.darkMode ? 'Dark' : 'Light'} Mode`);
}
