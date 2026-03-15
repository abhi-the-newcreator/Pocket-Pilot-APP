const dashboardPalette = ['#0f766e', '#f59e0b', '#14b8a6', '#fb7185', '#2563eb', '#8b5cf6', '#84cc16'];

if (!requireAuth()) throw new Error('unauthenticated');

function renderDashBudget(b) {
    document.getElementById('dashBudgetLabel').textContent = `Budget – ${b.month_name}`;
    const daysEl = document.getElementById('dashDaysBadge');
    daysEl.textContent = `${b.days_left} days left in month`;
    daysEl.style.color = b.days_left <= 5 ? 'var(--danger)' : 'var(--primary)';
    document.getElementById('dashSpent').textContent = formatCurrency(b.spent_this_month);
    document.getElementById('dashBudgetTotal').textContent =
        b.budget_amount > 0 ? formatCurrency(b.budget_amount) : 'not set';
    const rem = document.getElementById('dashRemaining');
    if (b.budget_amount > 0) {
        rem.textContent = formatCurrency(b.remaining);
        rem.style.color = b.remaining <= 0 ? 'var(--danger)' : 'var(--success)';
    } else {
        rem.textContent = '—';
        rem.style.color = 'var(--muted)';
    }
    const bar = document.getElementById('dashBudgetBar');
    bar.style.width = `${Math.min(b.percent_used, 100)}%`;
    if (b.percent_used >= 90) bar.style.background = 'linear-gradient(90deg,#c2410c,#f97316)';
}

async function loadDashboard() {
    try {
        const data = await apiFetch('/dashboard');
        const totals = data.totals;

        document.getElementById('expensesMetric').textContent = formatCurrency(totals.expenses);
        document.getElementById('savingsMetric').textContent = formatCurrency(totals.savings);
        document.getElementById('investmentsMetric').textContent = formatCurrency(totals.investments);
        document.getElementById('balanceMetric').textContent = formatCurrency(totals.remaining_balance);

        const balanceStatus = document.getElementById('balanceStatus');
        if (totals.remaining_balance >= 0) {
            balanceStatus.textContent = 'You are still cash-positive this cycle';
            balanceStatus.className = 'metric-trend success';
        } else {
            balanceStatus.textContent = 'Your outflows exceed your current savings inflow';
            balanceStatus.className = 'metric-trend danger';
        }

        const predictionBadge = document.getElementById('predictionBadge');
        predictionBadge.textContent = data.predicted_days_left
            ? `${data.predicted_days_left} days of balance left at current pace`
            : 'Add more transactions to unlock a stronger forecast';

        const labels = Object.keys(data.category_distribution);
        const values = Object.values(data.category_distribution);
        if (labels.length) {
            createDoughnutChart('categoryChart', labels, values, dashboardPalette);
        } else {
            document.querySelector('#categoryChart').parentElement.innerHTML = '<div class="empty-state">No transactions yet. Add one to see your spending map.</div>';
        }

        const transactionContainer = document.getElementById('recentTransactions');
        if (!data.recent_transactions.length) {
            transactionContainer.innerHTML = '<div class="empty-state">No transactions recorded yet.</div>';
        } else {
            transactionContainer.innerHTML = data.recent_transactions
                .map((transaction) => {
                    const tagClass = transaction.bucket.toLowerCase();
                    return `
                        <div class="list-item">
                            <div>
                                <strong>${transaction.merchant}</strong>
                                <span class="muted">${transaction.category} · ${transaction.date}</span>
                            </div>
                            <div style="text-align: right;">
                                <strong>${formatCurrency(transaction.amount)}</strong>
                                <span class="tag ${tagClass}">${transaction.bucket}</span>
                            </div>
                        </div>
                    `;
                })
                .join('');
        }

        if (data.budget) renderDashBudget(data.budget);

        renderAlerts(document.getElementById('warningsList'), data.warnings, 'warning', 'No major financial risk signals detected yet.');
        renderAlerts(document.getElementById('suggestionsList'), data.suggestions, 'suggestion', 'Suggestions will appear once transactions are available.');
    } catch (error) {
        document.getElementById('warningsList').innerHTML = `<div class="alert warning">${error.message}</div>`;
    }
}

loadDashboard();
