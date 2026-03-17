if (!requireAuth()) throw new Error('unauthenticated');

// ── Render goal cards ────────────────────────────────────────────────────────

function renderGoalCards(goals) {
    const container = document.getElementById('goalsContainer');
    if (!goals.length) {
        container.innerHTML = '<div class="empty-state">No savings goals yet. Create one to begin tracking progress.</div>';
        return;
    }

    container.innerHTML = goals
        .map((goal) => {
            const progress = Math.min((goal.amount_saved / goal.target_amount) * 100, 100);
            const depositsHtml = goal.deposits && goal.deposits.length
                ? goal.deposits.map(d => `
                    <div class="deposit-entry">
                        <span class="dep-amount">+ ${formatCurrency(d.amount)}</span>
                        <span class="dep-date">${d.date}</span>
                    </div>`).join('')
                : '<div class="muted" style="font-size:0.85rem;padding:6px 0;">No deposits yet — add your first one below!</div>';

            return `
                <article class="card">
                    <div class="panel-header">
                        <div>
                            <h3>${goal.name}</h3>
                            <p class="muted">Created on ${goal.created_at}</p>
                        </div>
                        <div style="display:flex;gap:8px;align-items:center;">
                            <div class="badge">${progress.toFixed(0)}% funded</div>
                            <button class="goal-delete-btn" onclick="deleteGoal(${goal.id})">🗑️ Delete</button>
                        </div>
                    </div>
                    <div class="kpi-grid">
                        <div class="kpi-box">
                            <div class="metric-label">Target</div>
                            <div class="metric-value" style="font-size:1.15rem;">${formatCurrency(goal.target_amount)}</div>
                        </div>
                        <div class="kpi-box">
                            <div class="metric-label">💰 Saved</div>
                            <div class="metric-value" style="font-size:1.15rem;color:var(--success);">${formatCurrency(goal.total_deposited)}</div>
                        </div>
                        <div class="kpi-box">
                            <div class="metric-label">Remaining</div>
                            <div class="metric-value" style="font-size:1.15rem;">${formatCurrency(goal.remaining_amount)}</div>
                        </div>
                    </div>
                    <div style="margin-top: 18px;" class="progress-bar">
                        <div class="progress-fill" style="width: ${progress}%;"></div>
                    </div>

                    <!-- Deposit history -->
                    <div class="deposit-section">
                        <strong style="font-size:0.88rem;color:var(--muted);">DEPOSIT HISTORY</strong>
                        <div class="deposit-history" id="depositHistory_${goal.id}">
                            ${depositsHtml}
                        </div>
                    </div>

                    <!-- Add deposit form -->
                    <div class="deposit-section">
                        <strong style="font-size:0.88rem;color:var(--muted);">ADD A DEPOSIT</strong>
                        <div class="deposit-row" style="margin-top:10px;">
                            <div class="field">
                                <label>Amount (₹)</label>
                                <input type="number" id="depAmount_${goal.id}" min="1" step="1" placeholder="e.g. 2000">
                            </div>
                            <div class="field">
                                <label>Date</label>
                                <input type="date" id="depDate_${goal.id}" value="${new Date().toISOString().slice(0,10)}">
                            </div>
                            <button class="btn primary" style="height:fit-content;align-self:flex-end;" onclick="addDeposit(${goal.id})">Add</button>
                        </div>
                        <div class="deposit-msg alert suggestion" id="depMsg_${goal.id}" style="display:none;"></div>
                    </div>
                </article>
            `;
        })
        .join('');
}

// ── Load Goals ───────────────────────────────────────────────────────────────

async function loadGoals() {
    const goals = await apiFetch('/goals');
    renderGoalCards(goals);
}

// ── Create Goal ───────────────────────────────────────────────────────────────

async function handleGoalSubmit(event) {
    event.preventDefault();

    const payload = {
        name: document.getElementById('goalName').value.trim(),
        target_amount: Number(document.getElementById('targetAmount').value),
    };

    try {
        await apiFetch('/goals', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        event.target.reset();
        renderAlerts(document.getElementById('goalMessage'), ['Goal created successfully!'], 'suggestion', '');
        await loadGoals();
    } catch (error) {
        renderAlerts(document.getElementById('goalMessage'), [error.message], 'warning', '');
    }
}

// ── Add Deposit ───────────────────────────────────────────────────────────────

async function addDeposit(goalId) {
    const amountInput = document.getElementById(`depAmount_${goalId}`);
    const dateInput = document.getElementById(`depDate_${goalId}`);
    const msgEl = document.getElementById(`depMsg_${goalId}`);

    const amount = parseFloat(amountInput.value);
    if (!amount || amount <= 0) {
        amountInput.style.borderColor = 'var(--danger)';
        return;
    }
    amountInput.style.borderColor = '';

    const payload = {
        amount,
        date: dateInput.value || null,
    };

    try {
        await apiFetch(`/goals/${goalId}/deposit`, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        amountInput.value = '';
        msgEl.textContent = `✅ Deposit of ${formatCurrency(amount)} saved!`;
        msgEl.style.display = 'block';
        setTimeout(() => { msgEl.style.display = 'none'; }, 3000);
        await loadGoals();
    } catch (error) {
        msgEl.textContent = `⚠️ ${error.message}`;
        msgEl.className = 'deposit-msg alert warning';
        msgEl.style.display = 'block';
    }
}

// ── Delete Goal ───────────────────────────────────────────────────────────────

async function deleteGoal(goalId) {
    if (!confirm('Delete this goal and all its deposits? This cannot be undone.')) return;
    try {
        await apiFetch(`/goals/${goalId}`, { method: 'DELETE' });
        await loadGoals();
    } catch (error) {
        alert(error.message);
    }
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function initGoalsPage() {
    document.getElementById('goalForm').addEventListener('submit', handleGoalSubmit);
    await loadGoals();
}

initGoalsPage();
