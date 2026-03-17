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

// ── AI Money Advisor ──────────────────────────────────────────────────────────

let _analyticsData = null;

async function getAIAdvice() {
    const keyInput = document.getElementById('geminiApiKey');
    let apiKey = keyInput.value.trim() || localStorage.getItem('pp_gemini_key');
    if (!apiKey) {
        keyInput.focus();
        keyInput.style.borderColor = 'var(--danger)';
        return;
    }
    localStorage.setItem('pp_gemini_key', apiKey);
    keyInput.style.borderColor = '';

    const output = document.getElementById('aiAdviceOutput');
    output.innerHTML = '<div style="color:var(--muted);font-weight:700;padding:12px 0;"><span class="ai-spinner"></span>Gemini is analysing your finances…</div>';

    if (!_analyticsData) {
        output.innerHTML = '<div class="alert warning">No spending data loaded yet. Please wait for the page to finish loading.</div>';
        return;
    }

    const { totals, average_daily_spending, expense_distribution } = _analyticsData;
    const topCategories = Object.entries(expense_distribution)
        .slice(0, 5)
        .map(([cat, amt]) => `${cat}: ₹${Math.round(amt)}`)
        .join(', ');

    const prompt = `You are a friendly financial advisor specialising in helping students in India save money. 
Here is the user's financial snapshot:
- Total expenses: ₹${totals.expenses}
- Total savings/income: ₹${totals.savings}
- Total investments: ₹${totals.investments}
- Remaining balance: ₹${totals.remaining_balance}
- Average daily spending: ₹${average_daily_spending}
- Top spending categories: ${topCategories}

Please give 4-5 concise, practical, student-friendly tips to help this person save more money and manage their spending better. Keep each tip to 1-2 sentences. Use simple language and be encouraging. Add an emoji to each tip.`;

    try {
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.7, maxOutputTokens: 600 },
                }),
            }
        );

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err?.error?.message || `API error ${res.status}`);
        }

        const json = await res.json();
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || 'No advice returned.';

        output.innerHTML = `
            <div class="alert suggestion" style="margin-top:4px;">
                <div class="ai-response">${text.replace(/\n/g, '<br>')}</div>
            </div>`;

        // Hide key row after success
        document.getElementById('aiKeyRow').style.display = 'none';

    } catch (err) {
        output.innerHTML = `<div class="alert warning">⚠️ ${err.message}</div>`;
    }
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

    // Restore saved Gemini key
    const savedKey = localStorage.getItem('pp_gemini_key');
    if (savedKey) document.getElementById('geminiApiKey').value = savedKey;

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
