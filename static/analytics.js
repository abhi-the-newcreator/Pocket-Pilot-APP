if (!requireAuth()) throw new Error('unauthenticated');

const analyticsPalette = ['#0f766e', '#14b8a6', '#f59e0b', '#fb7185', '#2563eb', '#8b5cf6'];

async function loadAnalytics() {
    const data = await apiFetch('/analytics');

    document.getElementById('avgSpendMetric').textContent = formatCurrency(data.average_daily_spending);
    document.getElementById('activeDaysMetric').textContent = data.active_days;
    document.getElementById('forecastMetric').textContent = data.predicted_days_left ? `${data.predicted_days_left} days` : 'N/A';
    document.getElementById('averageSpendBadge').textContent = `Avg daily spend: ${formatCurrency(data.average_daily_spending)}`;

    const expenseEntries = Object.entries(data.expense_distribution);
    document.getElementById('topCategoryMetric').textContent = expenseEntries.length ? expenseEntries[0][0] : 'N/A';

    if (expenseEntries.length) {
        createDoughnutChart(
            'expenseChart',
            expenseEntries.map(([label]) => label),
            expenseEntries.map(([, value]) => value),
            analyticsPalette,
        );
    } else {
        document.querySelector('#expenseChart').parentElement.innerHTML = '<div class="empty-state">No expense data yet.</div>';
    }

    renderAlerts(document.getElementById('analyticsWarnings'), [...data.warnings, ...data.suggestions], 'suggestion', 'No analytics generated yet.');

    const tableWrap = document.getElementById('analyticsTableWrap');
    if (!data.transactions.length) {
        tableWrap.innerHTML = '<div class="empty-state">No transactions available for analysis.</div>';
        return;
    }

    tableWrap.innerHTML = `
        <table class="table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Message</th>
                    <th>Merchant</th>
                    <th>Category</th>
                    <th>Bucket</th>
                    <th>Amount</th>
                </tr>
            </thead>
            <tbody>
                ${data.transactions
                    .slice()
                    .reverse()
                    .map(
                        (transaction) => `
                            <tr>
                                <td>${transaction.date}</td>
                                <td>${transaction.original_message}</td>
                                <td>${transaction.merchant}</td>
                                <td>${transaction.category}</td>
                                <td>${transaction.bucket}</td>
                                <td>${formatCurrency(transaction.amount)}</td>
                            </tr>
                        `,
                    )
                    .join('')}
            </tbody>
        </table>
    `;
}

loadAnalytics().catch((error) => {
    document.getElementById('analyticsWarnings').innerHTML = `<div class="alert warning">${error.message}</div>`;
});
