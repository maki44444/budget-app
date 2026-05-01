function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const SUPABASE_URL = 'https://rltkkpbiyiltyuzxbhij.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsdGtrcGJpeWlsdHl1enhiaGlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NTcwMDAsImV4cCI6MjA5MjUzMzAwMH0.-loGvpylbjq-saSk2-jvzMwACH4Jhdh1d3fSDBAYtLM';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentType = 'expense';
let selectedCategory = null;
let allCategories = [];
let currentPeriod = 'month';
let pieChart = null;
let categoryEditMode = false;
let transactionsCache = [];
let editingTransactionId = null;
let editType = 'expense';
let editSelectedCategory = null;
let currentBudgets = {};
let currentMonthSpending = {};
let budgetEditCategoryId = null;

// ТЕМА
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  const btn = document.getElementById('theme-btn');
  if (!btn) return;
  if (theme === 'light') {
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  } else {
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
  }
}

// ИНИЦИАЛИЗАЦИЯ
document.addEventListener('DOMContentLoaded', async () => {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);

  const dateInput = document.getElementById('date');
  dateInput.value = localDate();

  await loadCategories();
  await loadHome();
});

// НАВИГАЦИЯ
function showPage(name, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  btn.classList.add('active');

  if (name === 'home') loadHome();
  if (name === 'analytics') loadAnalytics();
  if (name === 'budget') loadBudget();
  if (name === 'add') renderCategories();
}

// ГЛАВНАЯ
async function loadHome() {
  const now = new Date();
  const start = localDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const end = localDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  const { data } = await db.from('transactions')
    .select('*, categories(name, icon)')
    .gte('date', start).lte('date', end)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (!data) return;
  transactionsCache = data;

  const monthStr = now.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  const monthEl = document.getElementById('home-month-label');
  if (monthEl) monthEl.textContent = monthStr.charAt(0).toUpperCase() + monthStr.slice(1);

  const income = data.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const expense = data.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

  document.getElementById('total-income').textContent = fmt(income);
  document.getElementById('total-expense').textContent = fmt(expense);
  document.getElementById('balance').textContent = fmt(income - expense);

  const list = document.getElementById('transactions-list');
  if (data.length === 0) {
    list.innerHTML = '<div class="empty-state">Нет операций. Добавь первую!</div>';
    return;
  }

  list.innerHTML = data.slice(0, 7).map(t => txCard(t)).join('');

  const wrap = document.getElementById('all-tx-btn-wrap');
  if (wrap) wrap.style.display = data.length > 7 ? 'block' : 'none';
}

// ТИП ОПЕРАЦИИ
function setType(type) {
  currentType = type;
  selectedCategory = null;
  categoryEditMode = false;
  const toggle = document.getElementById('cat-edit-toggle');
  if (toggle) toggle.textContent = 'Изменить';
  document.getElementById('btn-expense').classList.toggle('active', type === 'expense');
  document.getElementById('btn-income').classList.toggle('active', type === 'income');
  renderCategories();
}

// КАТЕГОРИИ
async function loadCategories() {
  const { data } = await db.from('categories').select('*').order('name');
  allCategories = data || [];
  renderCategories();
}

function renderCategories() {
  const filtered = allCategories.filter(c => c.type === currentType);
  const grid = document.getElementById('categories-grid');
  grid.innerHTML = filtered.map(c => `
    <div class="cat-btn ${selectedCategory?.id === c.id ? 'selected' : ''}"
      onclick="${categoryEditMode ? '' : `selectCategory('${c.id}')`}">
      <span class="cat-icon">${c.icon}</span>
      <span class="cat-name">${c.name}</span>
      ${categoryEditMode ? `<button class="cat-delete" onclick="deleteCategory('${c.id}', event)">✕</button>` : ''}
    </div>
  `).join('') + `
    <div class="cat-btn cat-add-btn" onclick="openCategoryModal()">
      <span class="cat-icon">＋</span>
      <span class="cat-name">Новая</span>
    </div>
  `;
}

function toggleCategoryEdit() {
  categoryEditMode = !categoryEditMode;
  document.getElementById('cat-edit-toggle').textContent = categoryEditMode ? 'Готово' : 'Изменить';
  if (!categoryEditMode) selectedCategory = null;
  renderCategories();
}

async function deleteCategory(id, e) {
  e.stopPropagation();
  if (!confirm('Удалить эту категорию?')) return;
  const { error } = await db.from('categories').delete().eq('id', id);
  if (error) return showToast('Ошибка удаления');
  showToast('Категория удалена');
  await loadCategories();
}

function openCategoryModal() {
  document.getElementById('cat-icon-input').value = '';
  document.getElementById('cat-name-input').value = '';
  document.getElementById('modal-category').classList.add('active');
}

function hideCategoryModal() {
  document.getElementById('modal-category').classList.remove('active');
}

function closeCategoryModal(e) {
  if (e.target.id === 'modal-category') hideCategoryModal();
}

async function saveNewCategory() {
  const icon = document.getElementById('cat-icon-input').value.trim() || '💰';
  const name = document.getElementById('cat-name-input').value.trim();

  if (!name) return showToast('Введи название категории');

  const { error } = await db.from('categories').insert({ name, icon, type: currentType });

  if (error) return showToast('Ошибка при создании');

  hideCategoryModal();
  showToast('Категория добавлена ✓');
  await loadCategories();
}

function selectCategory(id) {
  selectedCategory = allCategories.find(c => c.id === id);
  renderCategories();
}

// СОХРАНИТЬ ТРАНЗАКЦИЮ
async function saveTransaction() {
  const amount = parseFloat(document.getElementById('amount').value);
  const date = document.getElementById('date').value;
  const note = document.getElementById('note').value.trim();

  if (!amount || amount <= 0) return showToast('Введи сумму');
  if (!selectedCategory) return showToast('Выбери категорию');
  if (!date) return showToast('Укажи дату');

  const { error } = await db.from('transactions').insert({
    amount, type: currentType, category_id: selectedCategory.id, note, date
  });

  if (error) return showToast('Ошибка сохранения');

  showToast('Сохранено ✓');
  document.getElementById('amount').value = '';
  document.getElementById('note').value = '';
  selectedCategory = null;
  renderCategories();
  loadHome();
}

// АНАЛИТИКА
async function loadAnalytics() {
  const { start, end } = getPeriodDates(currentPeriod);

  const { data } = await db.from('transactions')
    .select('*, categories(name, icon)')
    .gte('date', start).lte('date', end);

  if (!data) return;

  const income = data.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const expense = data.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

  document.getElementById('a-income').textContent = fmt(income);
  document.getElementById('a-expense').textContent = fmt(expense);

  // График по категориям расходов
  const byCategory = {};
  data.filter(t => t.type === 'expense').forEach(t => {
    const name = t.categories?.name || 'Прочее';
    const icon = t.categories?.icon || '💰';
    if (!byCategory[name]) byCategory[name] = { amount: 0, icon };
    byCategory[name].amount += Number(t.amount);
  });

  const sorted = Object.entries(byCategory).sort((a, b) => b[1].amount - a[1].amount);
  const maxVal = sorted[0]?.[1].amount || 1;

  // Pie chart
  if (pieChart) pieChart.destroy();
  if (sorted.length > 0) {
    const colors = ['#C4A67E','#78A88E','#BB7878','#7A96B5','#A888C0','#C4B878','#5AA89A','#C4887A','#8896C4','#B8A08A'];
    pieChart = new Chart(document.getElementById('chart-categories'), {
      type: 'doughnut',
      data: {
        labels: sorted.map(([name]) => name),
        datasets: [{ data: sorted.map(([,v]) => v.amount), backgroundColor: colors, borderWidth: 0 }]
      },
      options: {
        plugins: { legend: { labels: { color: '#888', font: { size: 11 } } } },
        cutout: '65%'
      }
    });
  }

  // Список категорий
  document.getElementById('categories-breakdown').innerHTML = sorted.map(([name, val]) => `
    <div class="breakdown-item">
      <div class="breakdown-top">
        <div class="breakdown-name">${val.icon} ${name}</div>
        <div class="breakdown-amount">${fmt(val.amount)}</div>
      </div>
      <div class="breakdown-bar-bg">
        <div class="breakdown-bar" style="width:${(val.amount / maxVal * 100).toFixed(1)}%"></div>
      </div>
    </div>
  `).join('') || '<div class="empty-state">Нет расходов за этот период</div>';
}

function setPeriod(period, btn) {
  currentPeriod = period;
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadAnalytics();
}

function getPeriodDates(period) {
  const now = new Date();
  let start, end;
  if (period === 'week') {
    const day = now.getDay() || 7;
    start = new Date(now); start.setDate(now.getDate() - day + 1);
    end = new Date(start); end.setDate(start.getDate() + 6);
  } else if (period === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else {
    start = new Date(now.getFullYear(), 0, 1);
    end = new Date(now.getFullYear(), 11, 31);
  }
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0]
  };
}

// РЕДАКТИРОВАНИЕ ТРАНЗАКЦИИ
function openEditTransaction(id) {
  hideAllModal();
  const t = transactionsCache.find(x => x.id === id);
  if (!t) return;

  editingTransactionId = id;
  editType = t.type;
  editSelectedCategory = allCategories.find(c => c.id === t.category_id) || null;

  document.getElementById('edit-amount').value = t.amount;
  document.getElementById('edit-date').value = t.date;
  document.getElementById('edit-note').value = t.note || '';
  document.getElementById('edit-btn-expense').classList.toggle('active', t.type === 'expense');
  document.getElementById('edit-btn-income').classList.toggle('active', t.type === 'income');

  renderEditCategories();
  document.getElementById('modal-edit').classList.add('active');
}

function hideEditModal() {
  document.getElementById('modal-edit').classList.remove('active');
}

function closeEditModal(e) {
  if (e.target.id === 'modal-edit') hideEditModal();
}

function setEditType(type) {
  editType = type;
  editSelectedCategory = null;
  document.getElementById('edit-btn-expense').classList.toggle('active', type === 'expense');
  document.getElementById('edit-btn-income').classList.toggle('active', type === 'income');
  renderEditCategories();
}

function renderEditCategories() {
  const filtered = allCategories.filter(c => c.type === editType);
  document.getElementById('edit-categories-grid').innerHTML = filtered.map(c => `
    <div class="cat-btn ${editSelectedCategory?.id === c.id ? 'selected' : ''}"
      onclick="selectEditCategory('${c.id}')">
      <span class="cat-icon">${c.icon}</span>
      <span class="cat-name">${c.name}</span>
    </div>
  `).join('');
}

function selectEditCategory(id) {
  editSelectedCategory = allCategories.find(c => c.id === id);
  renderEditCategories();
}

async function saveEditTransaction() {
  const amount = parseFloat(document.getElementById('edit-amount').value);
  const date = document.getElementById('edit-date').value;
  const note = document.getElementById('edit-note').value.trim();

  if (!amount || amount <= 0) return showToast('Введи сумму');
  if (!editSelectedCategory) return showToast('Выбери категорию');
  if (!date) return showToast('Укажи дату');

  const { error } = await db.from('transactions').update({
    amount, type: editType, category_id: editSelectedCategory.id, note, date
  }).eq('id', editingTransactionId);

  if (error) return showToast('Ошибка сохранения');

  hideEditModal();
  showToast('Изменено ✓');
  await loadHome();
}

// УДАЛЕНИЕ ТРАНЗАКЦИИ
async function deleteTransaction(id) {
  if (!confirm('Удалить эту операцию?')) return;
  const { error } = await db.from('transactions').delete().eq('id', id);
  if (error) return showToast('Ошибка удаления');
  showToast('Удалено');
  hideAllModal();
  await loadHome();
}

// БЮДЖЕТ
async function loadBudget() {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const start = localDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const end = localDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  document.getElementById('budget-month-label').textContent =
    now.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

  const [{ data: budgetsData }, { data: txData }] = await Promise.all([
    db.from('budgets').select('*').eq('month', month),
    db.from('transactions').select('category_id, amount').eq('type', 'expense').gte('date', start).lte('date', end)
  ]);

  currentBudgets = {};
  (budgetsData || []).forEach(b => { currentBudgets[b.category_id] = { limit_amount: b.limit_amount, id: b.id }; });

  currentMonthSpending = {};
  (txData || []).forEach(t => {
    currentMonthSpending[t.category_id] = (currentMonthSpending[t.category_id] || 0) + Number(t.amount);
  });

  renderBudget();
}

function renderBudget() {
  const cats = allCategories.filter(c => c.type === 'expense');
  const list = document.getElementById('budget-list');

  if (cats.length === 0) {
    list.innerHTML = '<div class="empty-state">Нет категорий расходов</div>';
    return;
  }

  list.innerHTML = cats.map(c => {
    const spent = currentMonthSpending[c.id] || 0;
    const budget = currentBudgets[c.id];

    if (budget) {
      const limit = budget.limit_amount;
      const pct = Math.min(spent / limit * 100, 100);
      const remaining = limit - spent;
      const color = pct >= 90 ? 'var(--expense)' : pct >= 70 ? '#f97316' : 'var(--income)';
      return `
        <div class="budget-card" onclick="openBudgetModal('${c.id}')">
          <div class="budget-card-top">
            <div class="budget-cat-info">
              <span class="budget-cat-icon">${c.icon}</span>
              <span class="budget-cat-name">${c.name}</span>
            </div>
            <div class="budget-amounts">
              <span class="budget-spent">${fmt(spent)}</span>
              <span class="budget-limit-label">/ ${fmt(limit)}</span>
            </div>
          </div>
          <div class="budget-bar-bg">
            <div class="budget-bar" style="width:${pct.toFixed(1)}%;background:${color}"></div>
          </div>
          <div class="budget-footer">
            <span class="budget-pct" style="color:${color}">${pct.toFixed(0)}%</span>
            <span class="budget-remaining">${remaining >= 0 ? 'Осталось: ' + fmt(remaining) : 'Перерасход: ' + fmt(-remaining)}</span>
          </div>
        </div>`;
    } else {
      return `
        <div class="budget-card no-limit" onclick="openBudgetModal('${c.id}')">
          <div class="budget-card-top">
            <div class="budget-cat-info">
              <span class="budget-cat-icon">${c.icon}</span>
              <span class="budget-cat-name">${c.name}</span>
            </div>
            <div class="budget-amounts">
              ${spent > 0 ? `<span class="budget-spent">${fmt(spent)}</span>` : ''}
              <span class="add-limit-hint">+ лимит</span>
            </div>
          </div>
        </div>`;
    }
  }).join('');
}

function openBudgetModal(categoryId) {
  budgetEditCategoryId = categoryId;
  const cat = allCategories.find(c => c.id === categoryId);
  const budget = currentBudgets[categoryId];

  document.getElementById('budget-modal-title').textContent = `${cat?.icon || ''} ${cat?.name || 'Лимит'}`;
  document.getElementById('budget-limit-input').value = budget ? budget.limit_amount : '';
  document.getElementById('budget-delete-btn').style.display = budget ? 'block' : 'none';
  document.getElementById('modal-budget').classList.add('active');
}

function hideBudgetModal() {
  document.getElementById('modal-budget').classList.remove('active');
}

function closeBudgetModal(e) {
  if (e.target.id === 'modal-budget') hideBudgetModal();
}

async function saveBudgetLimit() {
  const amount = parseFloat(document.getElementById('budget-limit-input').value);
  if (!amount || amount <= 0) return showToast('Введи сумму лимита');

  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const existing = currentBudgets[budgetEditCategoryId];

  let error;
  if (existing) {
    ({ error } = await db.from('budgets').update({ limit_amount: amount }).eq('id', existing.id));
  } else {
    ({ error } = await db.from('budgets').insert({ category_id: budgetEditCategoryId, month, limit_amount: amount }));
  }

  if (error) return showToast('Ошибка сохранения');
  hideBudgetModal();
  showToast('Лимит установлен ✓');
  await loadBudget();
}

async function deleteBudgetLimit() {
  const existing = currentBudgets[budgetEditCategoryId];
  if (!existing) return;
  const { error } = await db.from('budgets').delete().eq('id', existing.id);
  if (error) return showToast('Ошибка удаления');
  hideBudgetModal();
  showToast('Лимит убран');
  await loadBudget();
}

// ВСЕ ОПЕРАЦИИ
function txCard(t) {
  return `
    <div class="transaction-item" id="t-${t.id}" onclick="openEditTransaction('${t.id}')">
      <div class="t-icon">${t.categories?.icon || '💰'}</div>
      <div class="t-body">
        <div class="t-row-top">
          <span class="t-name">${t.categories?.name || '—'}</span>
          <span class="t-amount ${t.type}">${t.type === 'income' ? '+' : '−'}${fmt(t.amount)}</span>
        </div>
        <div class="t-row-bot">
          <span class="t-date">${formatDate(t.date)}${t.note ? ' · ' + t.note : ''}</span>
          <button class="t-delete" onclick="event.stopPropagation(); deleteTransaction('${t.id}')" title="Удалить">✕</button>
        </div>
      </div>
    </div>`;
}

function openAllTransactions() {
  const now = new Date();
  document.getElementById('all-modal-title').textContent =
    now.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  document.getElementById('all-transactions-list').innerHTML =
    transactionsCache.length ? transactionsCache.map(t => txCard(t)).join('') :
    '<div class="empty-state">Нет операций</div>';
  document.getElementById('modal-all').classList.add('active');
}

function hideAllModal() {
  document.getElementById('modal-all').classList.remove('active');
}

function closeAllModal(e) {
  if (e.target.id === 'modal-all') hideAllModal();
}

// УТИЛИТЫ
function fmt(n) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n);
}

function formatDate(str) {
  return new Date(str).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function showToast(msg) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
