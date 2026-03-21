if (!requireAuth()) throw new Error('unauthenticated');

const analyticsPalette = ['#0f766e', '#14b8a6', '#f59e0b', '#fb7185', '#2563eb', '#8b5cf6', '#ec4899', '#10b981'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysLeftInMonth() {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return lastDay - now.getDate();
}

// ── 3D Pie Chart ──────────────────────────────────────────────────────────────

function create3DPieChart(canvasId, labels, values, palette) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    // Custom plugin for pseudo-3D shadow/depth
    const shadow3dPlugin = {
        id: 'shadow3d',
        beforeDraw(chart) {
            const { ctx } = chart;
            ctx.save();
            ctx.shadowColor = 'rgba(15,118,110,0.35)';
            ctx.shadowBlur = 22;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 12;
        },
        afterDraw(chart) {
            chart.ctx.restore();
        },
    };

    return new Chart(canvas, {
        type: 'pie',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: palette,
                borderWidth: 3,
                borderColor: '#fff',
                hoverOffset: 16,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { animateRotate: true, duration: 900, easing: 'easeOutQuart' },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        boxWidth: 12,
                        font: { family: 'Manrope', weight: '700' },
                        padding: 16,
                    },
                },
                tooltip: {
                    callbacks: {
                        label(ctx) {
                            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = ((ctx.parsed / total) * 100).toFixed(1);
                            return ` ${ctx.label}: ₹${ctx.parsed.toLocaleString('en-IN')} (${pct}%)`;
                        },
                    },
                },
            },
        },
        plugins: [shadow3dPlugin],
    });
}

// ── Load Analytics ────────────────────────────────────────────────────────────

async function loadAnalytics() {
    const data = await apiFetch('/analytics');
    _analyticsData = data;

    document.getElementById('avgSpendMetric').textContent = formatCurrency(data.average_daily_spending);

    // "Money will last" — uses predicted_days_left (remaining balance ÷ avg daily spend)
    const survivalDays = data.predicted_days_left;
    document.getElementById('activeDaysMetric').textContent =
        survivalDays !== null && survivalDays !== undefined ? `${survivalDays} day${survivalDays !== 1 ? 's' : ''}` : '∞';

    // "Days left in month" computed client-side
    const dlm = daysLeftInMonth();
    document.getElementById('forecastMetric').textContent = `${dlm} day${dlm !== 1 ? 's' : ''}`;

    document.getElementById('averageSpendBadge').textContent = `Avg daily spend: ${formatCurrency(data.average_daily_spending)}`;

    const expenseEntries = Object.entries(data.expense_distribution);
    document.getElementById('topCategoryMetric').textContent = expenseEntries.length ? expenseEntries[0][0] : 'N/A';

    if (expenseEntries.length) {
        create3DPieChart(
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
                        (t) => `
                            <tr>
                                <td>${t.date}</td>
                                <td>${t.merchant}</td>
                                <td>${t.category}</td>
                                <td>${t.bucket}</td>
                                <td>${formatCurrency(t.amount)}</td>
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
