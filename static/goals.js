if (!requireAuth()) throw new Error('unauthenticated');

function renderGoalCards(goals) {
    const container = document.getElementById('goalsContainer');
    if (!goals.length) {
        container.innerHTML = '<div class="empty-state">No savings goals yet. Create one to begin tracking progress.</div>';
        return;
    }

    container.innerHTML = goals
        .map((goal) => {
            const progress = Math.min((goal.amount_saved / goal.target_amount) * 100, 100);
            return `
                <article class="card">
                    <div class="panel-header">
                        <div>
                            <h3>${goal.name}</h3>
                            <p class="muted">Created on ${goal.created_at}</p>
                        </div>
                        <div class="badge">${progress.toFixed(0)}% funded</div>
                    </div>
                    <div class="kpi-grid">
                        <div class="kpi-box">
                            <div class="metric-label">Saved</div>
                            <div class="metric-value">${formatCurrency(goal.amount_saved)}</div>
                        </div>
                        <div class="kpi-box">
                            <div class="metric-label">Remaining</div>
                            <div class="metric-value">${formatCurrency(goal.remaining_amount)}</div>
                        </div>
                        <div class="kpi-box">
                            <div class="metric-label">ETA</div>
                            <div class="metric-value">${goal.estimated_months} months</div>
                        </div>
                    </div>
                    <div style="margin-top: 18px;" class="progress-bar">
                        <div class="progress-fill" style="width: ${progress}%;"></div>
                    </div>
                </article>
            `;
        })
        .join('');
}

async function loadGoals() {
    const goals = await apiFetch('/goals');
    renderGoalCards(goals);
}

async function handleGoalSubmit(event) {
    event.preventDefault();

    const payload = {
        name: document.getElementById('goalName').value.trim(),
        target_amount: Number(document.getElementById('targetAmount').value),
        monthly_saving_amount: Number(document.getElementById('monthlySavingAmount').value),
    };

    try {
        await apiFetch('/goals', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        event.target.reset();
        renderAlerts(document.getElementById('goalMessage'), ['Goal created successfully.'], 'suggestion', '');
        await loadGoals();
    } catch (error) {
        renderAlerts(document.getElementById('goalMessage'), [error.message], 'warning', '');
    }
}

async function initGoalsPage() {
    document.getElementById('goalForm').addEventListener('submit', handleGoalSubmit);
    await loadGoals();
}

initGoalsPage();
