const fmt = n => '₮' + Number(n).toLocaleString('mn-MN', { maximumFractionDigits: 0 });
const fmtDate = d => new Date(d).toLocaleDateString('mn-MN', { year: 'numeric', month: 'short', day: 'numeric' });
const daysBetween = (a, b) => Math.ceil((new Date(b) - new Date(a)) / 86400000);

const PALETTE = ['#7c5cff', '#36e2c5', '#ff5d7a', '#ffb74a', '#5b8cff', '#42d392', '#ff8e53', '#b56cff', '#1a9aa6', '#e84a8a'];

let loans = [];
let filter = 'all';
let expanded = new Set();

async function fetchLoans() {
  const r = await fetch('/api/loans');
  loans = await r.json();
  render();
}

function calcInterest(loan) {
  const days = Math.max(0, daysBetween(loan.startDate, new Date()));
  return loan.amount * (loan.interestRate / 100) * (days / 365);
}
function totalWithInterest(loan) {
  return loan.amount + calcInterest(loan);
}
function paidSum(loan) {
  return (loan.payments || []).reduce((s, p) => s + p.amount, 0);
}
function remaining(loan) {
  return Math.max(0, totalWithInterest(loan) - paidSum(loan));
}

function render() {
  const list = document.getElementById('loanList');
  const empty = document.getElementById('emptyState');
  list.innerHTML = '';

  const active = loans.filter(l => !l.paid);
  const totalDebt = active.reduce((s, l) => s + totalWithInterest(l), 0);
  const totalPaid = active.reduce((s, l) => s + paidSum(l), 0);
  const totalRemaining = active.reduce((s, l) => s + remaining(l), 0);
  const totalInterest = active.reduce((s, l) => s + calcInterest(l), 0);

  document.getElementById('totalAmount').textContent = fmt(totalDebt);
  document.getElementById('totalInterest').textContent = fmt(totalInterest);
  document.getElementById('activeCount').textContent = active.length;
  document.getElementById('totalPaid').textContent = fmt(totalPaid);
  document.getElementById('totalRemaining').textContent = fmt(totalRemaining);

  const upcoming = active.slice().sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];
  document.getElementById('nextDue').textContent = upcoming
    ? `${upcoming.appName} — ${fmtDate(upcoming.dueDate)}`
    : '—';

  renderDonut(active, totalDebt, totalPaid, totalRemaining);

  let shown = loans;
  if (filter === 'active') shown = loans.filter(l => !l.paid);
  if (filter === 'paid') shown = loans.filter(l => l.paid);

  if (shown.length === 0) { empty.classList.add('show'); return; }
  empty.classList.remove('show');

  for (const l of shown) {
    const days = daysBetween(new Date(), l.dueDate);
    const overdue = days < 0 && !l.paid;
    const urgent = days >= 0 && days <= 7 && !l.paid;
    const cdClass = overdue ? 'urgent' : (urgent ? 'warn' : '');
    const cardClass = l.paid ? 'paid' : (overdue ? 'overdue' : (urgent ? 'urgent' : ''));
    const interest = calcInterest(l);
    const total = totalWithInterest(l);
    const rem = remaining(l);
    const paid = paidSum(l);
    const pct = total > 0 ? Math.min(100, (paid / total) * 100) : 0;
    const isExp = expanded.has(l._id);

    const el = document.createElement('div');
    el.className = 'loan ' + cardClass;
    el.innerHTML = `
      <div class="loan-info">
        <div class="app">${escapeHtml(l.appName)}</div>
        <div class="meta">
          <span>📅 ${fmtDate(l.startDate)} → ${fmtDate(l.dueDate)}</span>
          <span>💸 Хүү: ${fmt(interest)}</span>
          <span>✅ Төлсөн: ${fmt(paid)}</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        ${l.note ? `<div class="note">${escapeHtml(l.note)}</div>` : ''}
      </div>
      <div class="loan-amount">
        <div class="num">${fmt(rem)}</div>
        <div class="rate">/ ${fmt(total)} · ${l.interestRate}%</div>
      </div>
      <div class="countdown ${cdClass}">
        <div class="days">${overdue ? Math.abs(days) : days}</div>
        <div class="lbl">${l.paid ? 'төлсөн' : (overdue ? 'хоног хэтэрсэн' : 'хоног үлдсэн')}</div>
      </div>
      <div class="actions">
        <button class="icon-btn expand" data-act="expand" data-id="${l._id}" title="Төлбөр">💵</button>
        <button class="icon-btn pay" data-act="toggle" data-id="${l._id}" title="${l.paid ? 'Идэвхжүүлэх' : 'Бүгдийг төлсөн'}">${l.paid ? '↺' : '✓'}</button>
        <button class="icon-btn del" data-act="del" data-id="${l._id}" title="Устгах">✕</button>
      </div>
      <div class="loan-expand ${isExp ? 'show' : ''}" data-expand="${l._id}">
        <form class="pay-form" data-pay-form="${l._id}">
          <input name="amount" type="number" step="0.01" min="0" placeholder="Төлсөн дүн" required />
          <input name="date" type="date" value="${new Date().toISOString().slice(0,10)}" />
          <input name="note" placeholder="Тэмдэглэл (сонголтот)" />
          <button type="submit">+ Төлбөр нэмэх</button>
        </form>
        <div class="pay-list">
          ${(l.payments || []).length === 0
            ? '<div class="no-pay">Төлбөрийн түүх алга</div>'
            : l.payments.slice().reverse().map(p => `
                <div class="pay-row">
                  <span class="pay-amt">${fmt(p.amount)}</span>
                  <span class="pay-date">${fmtDate(p.date)}${p.note ? ' · ' + escapeHtml(p.note) : ''}</span>
                  <button data-act="del-pay" data-id="${l._id}" data-pid="${p._id}" title="Устгах">✕</button>
                </div>`).join('')}
        </div>
      </div>
    `;
    list.appendChild(el);
  }
}

function renderDonut(active, totalDebt, totalPaid, totalRemaining) {
  const svg = document.getElementById('donut');
  const legend = document.getElementById('donutLegend');
  const center = document.getElementById('donutCenter');
  const progress = document.getElementById('donutProgress');

  center.textContent = fmt(totalRemaining);
  const pct = totalDebt > 0 ? Math.round((totalPaid / totalDebt) * 100) : 0;
  progress.textContent = pct + '% төлсөн';

  svg.innerHTML = '';
  legend.innerHTML = '';

  const cx = 100, cy = 100, r = 80, c = 2 * Math.PI * r;

  // background ring
  svg.innerHTML += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="22"/>`;

  if (active.length === 0 || totalRemaining === 0) {
    legend.innerHTML = '<div class="no-pay">Идэвхтэй зээл алга</div>';
    return;
  }

  let offset = 0;
  active.forEach((l, i) => {
    const val = remaining(l);
    if (val <= 0) return;
    const frac = val / totalRemaining;
    const len = c * frac;
    const color = PALETTE[i % PALETTE.length];
    svg.innerHTML += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
      stroke="${color}" stroke-width="22"
      stroke-dasharray="${len} ${c - len}"
      stroke-dashoffset="${-offset}"
      stroke-linecap="butt"/>`;
    offset += len;

    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `
      <span class="legend-dot" style="background:${color}"></span>
      <span class="legend-name">${escapeHtml(l.appName)}</span>
      <span class="legend-val">${fmt(val)} · ${(frac*100).toFixed(0)}%</span>
    `;
    legend.appendChild(item);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

document.getElementById('loanForm').addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = Object.fromEntries(fd);
  if (!data.startDate) data.startDate = new Date().toISOString().slice(0, 10);
  data.amount = parseFloat(data.amount);
  data.interestRate = parseFloat(data.interestRate);
  await fetch('/api/loans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  e.target.reset();
  document.querySelector('input[name="startDate"]').value = new Date().toISOString().slice(0, 10);
  fetchLoans();
});

document.getElementById('loanList').addEventListener('click', async e => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.dataset.id;
  const act = btn.dataset.act;
  if (act === 'del') {
    if (!confirm('Энэ зээлийг устгах уу?')) return;
    await fetch('/api/loans/' + id, { method: 'DELETE' });
  } else if (act === 'toggle') {
    const loan = loans.find(l => l._id === id);
    await fetch('/api/loans/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paid: !loan.paid })
    });
  } else if (act === 'expand') {
    if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
    render();
    return;
  } else if (act === 'del-pay') {
    if (!confirm('Энэ төлбөрийг устгах уу?')) return;
    await fetch(`/api/loans/${id}/payments/${btn.dataset.pid}`, { method: 'DELETE' });
  }
  fetchLoans();
});

document.getElementById('loanList').addEventListener('submit', async e => {
  const form = e.target.closest('form[data-pay-form]');
  if (!form) return;
  e.preventDefault();
  const id = form.dataset.payForm;
  const fd = new FormData(form);
  const data = Object.fromEntries(fd);
  data.amount = parseFloat(data.amount);
  if (!data.amount || data.amount <= 0) return;
  await fetch(`/api/loans/${id}/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  form.reset();
  fetchLoans();
});

document.querySelectorAll('.chip').forEach(c => {
  c.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach(x => x.classList.remove('active'));
    c.classList.add('active');
    filter = c.dataset.filter;
    render();
  });
});

document.querySelector('input[name="startDate"]').value = new Date().toISOString().slice(0, 10);

fetchLoans();
setInterval(fetchLoans, 60000);
