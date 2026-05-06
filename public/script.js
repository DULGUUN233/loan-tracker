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

// ========== STATEMENT / TRANSACTIONS ==========

const CAT_INFO = {
  food:        { label: 'Хоол',         color: '#ff8e53', icon: '🍔' },
  grocery:     { label: 'Хүнсний',      color: '#42d392', icon: '🛒' },
  transport:   { label: 'Тээвэр',       color: '#5b8cff', icon: '🚕' },
  qpay:        { label: 'QPay',         color: '#36e2c5', icon: '💳' },
  entertainment:{label: 'Зугаа',        color: '#b56cff', icon: '🎮' },
  telecom:     { label: 'Холбоо',       color: '#ffb74a', icon: '📱' },
  health:      { label: 'Эрүүл мэнд',   color: '#ff5d7a', icon: '💊' },
  service:     { label: 'Үйлчилгээ',    color: '#7c5cff', icon: '🧺' },
  rent:        { label: 'Түрээс',       color: '#3056d3', icon: '🏠' },
  loan:        { label: 'Зээл/StorePay',color: '#e84a8a', icon: '💰' },
  fee:         { label: 'Шимтгэл',      color: '#888aa0', icon: '📎' },
  transfer_out:{ label: 'Шилжүүлэг',    color: '#a08b6c', icon: '↗️' },
  transfer_in: { label: 'Орсон',        color: '#42d392', icon: '↙️' },
  salary:      { label: 'Цалин',        color: '#1a9aa6', icon: '💵' },
  income:      { label: 'Орлого',       color: '#42d392', icon: '💵' },
  other:       { label: 'Бусад',        color: '#9aa3bf', icon: '•' }
};

let txns = [];
let statements = [];
let txnPeriod = 'all';

async function fetchStatements() {
  const r = await fetch('/api/statements');
  statements = await r.json();
  renderStmts();
}
async function fetchTxns() {
  const r = await fetch('/api/transactions?limit=5000');
  txns = (await r.json()).map(t => ({ ...t, date: new Date(t.date) }));
  renderStmtUI();
}

function renderStmts() {
  const el = document.getElementById('statementsList');
  if (statements.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = statements.map(s => `
    <div class="stmt-chip">
      <span>📄 ${escapeHtml(s.fileName || 'statement')}</span>
      <span class="stmt-period">${fmtDate(s.periodStart)} → ${fmtDate(s.periodEnd)} · ${s.txCount} гүйлгээ</span>
      <button data-stmt-del="${s._id}" title="Устгах">✕</button>
    </div>
  `).join('');
}

function periodFilter(t) {
  if (txnPeriod === 'all') return true;
  const days = txnPeriod === 'week' ? 7 : 30;
  const cutoff = new Date(Date.now() - days * 86400000);
  return t.date >= cutoff;
}

function renderStmtUI() {
  const filtered = txns.filter(periodFilter);
  const inc = filtered.filter(t => t.type === 'income');
  const exp = filtered.filter(t => t.type === 'expense');
  const totalInc = inc.reduce((s, t) => s + t.amount, 0);
  const totalExp = exp.reduce((s, t) => s + t.amount, 0);

  document.getElementById('sIncome').textContent = fmt(totalInc);
  document.getElementById('sExpense').textContent = fmt(totalExp);
  const net = totalInc - totalExp;
  document.getElementById('sNet').textContent = (net >= 0 ? '+' : '−') + fmt(Math.abs(net));
  document.getElementById('sCount').textContent = filtered.length;

  // Category donut
  const byCat = {};
  for (const t of exp) byCat[t.category] = (byCat[t.category] || 0) + t.amount;
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

  const svg = document.getElementById('catDonut');
  const legend = document.getElementById('catLegend');
  document.getElementById('catTotal').textContent = fmt(totalExp);
  svg.innerHTML = '';
  legend.innerHTML = '';
  const cx = 100, cy = 100, r = 78, c = 2 * Math.PI * r;
  svg.innerHTML += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="22"/>`;
  let off = 0;
  if (totalExp > 0) {
    for (const [cat, val] of cats) {
      const info = CAT_INFO[cat] || CAT_INFO.other;
      const len = c * (val / totalExp);
      svg.innerHTML += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${info.color}" stroke-width="22" stroke-dasharray="${len} ${c-len}" stroke-dashoffset="${-off}"/>`;
      off += len;
      legend.innerHTML += `<div class="legend-item">
        <span class="legend-dot" style="background:${info.color}"></span>
        <span class="legend-name">${info.icon} ${info.label}</span>
        <span class="legend-val">${fmt(val)} · ${(val/totalExp*100).toFixed(0)}%</span>
      </div>`;
    }
  } else {
    legend.innerHTML = '<div class="no-pay">Зарлага алга</div>';
  }
  svg.style.transform = 'rotate(-90deg)';

  // Daily bar
  const byDay = {};
  for (const t of exp) {
    const k = new Date(t.date).toISOString().slice(0, 10);
    byDay[k] = (byDay[k] || 0) + t.amount;
  }
  const days = Object.entries(byDay).sort();
  const bar = document.getElementById('dailyBar');
  bar.innerHTML = '';
  if (days.length > 0) {
    const max = Math.max(...days.map(d => d[1]));
    const w = 600, h = 200, pad = 20;
    const bw = (w - pad * 2) / days.length;
    days.forEach(([d, v], i) => {
      const bh = (v / max) * (h - pad - 20);
      const x = pad + i * bw;
      const y = h - pad - bh;
      bar.innerHTML += `<rect x="${x+1}" y="${y}" width="${Math.max(bw-2,1)}" height="${bh}" fill="url(#barGrad)" rx="2"><title>${d}: ${fmt(v)}</title></rect>`;
    });
    bar.innerHTML = `<defs><linearGradient id="barGrad" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#7c5cff"/><stop offset="100%" stop-color="#36e2c5"/></linearGradient></defs>` + bar.innerHTML;
    document.getElementById('dailyMeta').textContent = `${days.length} өдөр · дундаж ₮${Math.round(totalExp/days.length).toLocaleString('mn-MN')}/өдөр · хамгийн их ${fmt(max)}`;
  } else {
    document.getElementById('dailyMeta').textContent = '';
  }

  // Top merchants
  const byMerch = {};
  for (const t of exp) {
    const key = t.merchant || categorizeFallback(t.description);
    if (!key) continue;
    if (!byMerch[key]) byMerch[key] = { count: 0, total: 0 };
    byMerch[key].count++;
    byMerch[key].total += t.amount;
  }
  const top = Object.entries(byMerch).sort((a, b) => b[1].total - a[1].total).slice(0, 10);
  document.getElementById('topMerchants').innerHTML = top.length === 0
    ? '<div class="no-pay">Дата алга</div>'
    : top.map(([n, v]) => `<div class="merchant-row">
        <span class="m-name">${escapeHtml(n)}</span>
        <span class="m-cnt">${v.count}x</span>
        <span class="m-amt">${fmt(v.total)}</span>
      </div>`).join('');

  // Insights
  renderInsights(filtered, inc, exp, totalInc, totalExp, byCat, byDay);

  // Txn list
  const list = document.getElementById('txnList');
  list.innerHTML = filtered.slice(0, 200).map(t => {
    const info = CAT_INFO[t.category] || CAT_INFO.other;
    return `<div class="txn-row ${t.type}">
      <span class="t-date">${fmtDate(t.date)}</span>
      <span class="t-desc">${escapeHtml(t.merchant || t.description.slice(0, 60))}</span>
      <span class="t-cat" style="background:${info.color}33;color:${info.color}">${info.icon} ${info.label}</span>
      <span class="t-amt">${t.type==='income'?'+':'−'}${fmt(t.amount)}</span>
    </div>`;
  }).join('') || '<div class="no-pay">PDF upload хийгээд эхлээрэй</div>';
}

function categorizeFallback(d) {
  return (d || '').slice(0, 30);
}

function renderInsights(all, inc, exp, totalInc, totalExp, byCat, byDay) {
  const ins = document.getElementById('insights');
  const out = [];
  const net = totalInc - totalExp;
  if (totalExp > 0) {
    if (net < 0) out.push({ type: 'danger', text: `Зарлага орлогоос <strong>${fmt(Math.abs(net))}</strong>-р их байна. Хэрэглээгээ хянах хэрэгтэй.` });
    else if (net > 0) out.push({ type: 'ok', text: `Цэвэр хадгаламж <strong>${fmt(net)}</strong>. Сайн байна! 👏` });
  }
  const days = Object.keys(byDay).length;
  if (days > 0) {
    const avg = totalExp / days;
    out.push({ type: '', text: `Өдөрт дунджаар <strong>${fmt(Math.round(avg))}</strong> зарцуулж байна.` });
  }
  const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  if (sorted[0]) {
    const [cat, val] = sorted[0];
    const info = CAT_INFO[cat] || CAT_INFO.other;
    const pct = (val / totalExp * 100).toFixed(0);
    out.push({ type: 'warn', text: `Хамгийн их зарцуулалт: <strong>${info.icon} ${info.label}</strong> — ${fmt(val)} (${pct}%)` });
  }
  const fees = exp.filter(t => t.category === 'fee').reduce((s, t) => s + t.amount, 0);
  if (fees > 1000) out.push({ type: 'warn', text: `Гүйлгээний шимтгэлд <strong>${fmt(fees)}</strong> алджээ. SocialPay ашигла, шимтгэлгүй.` });
  const loans = exp.filter(t => t.category === 'loan').reduce((s, t) => s + t.amount, 0);
  if (loans > 0) out.push({ type: 'danger', text: `Зээлийн төлбөрт <strong>${fmt(loans)}</strong> явсан.` });
  ins.innerHTML = out.length === 0
    ? '<div class="insight">Дата хүлээгдэж байна. PDF upload хийгээрэй.</div>'
    : out.map(o => `<div class="insight ${o.type}">${o.text}</div>`).join('');
}

document.getElementById('uploadForm').addEventListener('change', async e => {
  const f = e.target.files?.[0];
  if (!f) return;
  await uploadPdf(f);
});

const uz = document.querySelector('.upload-zone');
uz.addEventListener('dragover', e => { e.preventDefault(); uz.classList.add('drag'); });
uz.addEventListener('dragleave', () => uz.classList.remove('drag'));
uz.addEventListener('drop', async e => {
  e.preventDefault();
  uz.classList.remove('drag');
  const f = e.dataTransfer.files?.[0];
  if (f) await uploadPdf(f);
});

async function uploadPdf(file) {
  const status = document.getElementById('uploadStatus');
  status.className = 'upload-status loading';
  status.textContent = '⏳ Боловсруулж байна...';
  const fd = new FormData();
  fd.append('pdf', file);
  try {
    const r = await fetch('/api/statements/upload', { method: 'POST', body: fd });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'upload failed');
    status.className = 'upload-status ok';
    status.textContent = `✓ ${j.inserted} шинэ гүйлгээ оруулсан · ${j.duplicates} давхардсан`;
    document.getElementById('pdfFile').value = '';
    await Promise.all([fetchStatements(), fetchTxns()]);
  } catch (e) {
    status.className = 'upload-status err';
    status.textContent = '✗ ' + e.message;
  }
}

document.getElementById('statementsList').addEventListener('click', async e => {
  const btn = e.target.closest('button[data-stmt-del]');
  if (!btn) return;
  if (!confirm('Энэ хуулга болон бүх гүйлгээг устгах уу?')) return;
  await fetch('/api/statements/' + btn.dataset.stmtDel, { method: 'DELETE' });
  await Promise.all([fetchStatements(), fetchTxns()]);
});

document.querySelectorAll('.chip.period').forEach(c => {
  c.addEventListener('click', () => {
    document.querySelectorAll('.chip.period').forEach(x => x.classList.remove('active'));
    c.classList.add('active');
    txnPeriod = c.dataset.period;
    renderStmtUI();
  });
});

// ========== APP CODES ==========
let codes = [];
let codeSearch = '';
let revealed = new Set();

async function fetchCodes() {
  const r = await fetch('/api/codes');
  codes = await r.json();
  renderCodes();
}

function renderCodes() {
  const list = document.getElementById('codesList');
  const empty = document.getElementById('codesEmpty');
  const q = codeSearch.trim().toLowerCase();
  const shown = q
    ? codes.filter(c => (c.appName + ' ' + c.username + ' ' + c.note).toLowerCase().includes(q))
    : codes;
  if (shown.length === 0) { list.innerHTML = ''; empty.classList.add('show'); return; }
  empty.classList.remove('show');
  list.innerHTML = shown.map(c => {
    const isRev = revealed.has(c._id);
    const masked = '•'.repeat(Math.min(c.code.length, 12));
    return `<div class="code-card">
      <div class="code-head">
        <div class="code-name">
          <span class="code-icon">${escapeHtml(c.appName.charAt(0).toUpperCase())}</span>
          ${escapeHtml(c.appName)}
        </div>
        <div class="code-actions">
          <button data-act="reveal" data-id="${c._id}" title="${isRev ? 'Нуух' : 'Харах'}">${isRev ? '🙈' : '👁'}</button>
          <button data-act="copy" data-id="${c._id}" title="Хуулах">📋</button>
          <button class="del" data-act="del-code" data-id="${c._id}" title="Устгах">✕</button>
        </div>
      </div>
      ${c.username ? `<div class="code-row">
        <span class="lbl">User</span>
        <span class="val">${escapeHtml(c.username)}</span>
      </div>` : ''}
      <div class="code-row">
        <span class="lbl">Code</span>
        <span class="val ${isRev ? '' : 'masked'}">${isRev ? escapeHtml(c.code) : masked}</span>
      </div>
      ${c.note ? `<div class="code-row note">${escapeHtml(c.note)}</div>` : ''}
    </div>`;
  }).join('');
}

function showToast(msg) {
  let toast = document.getElementById('copyToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'copyToast';
    toast.className = 'copy-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove('show'), 1500);
}

document.getElementById('codeForm').addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = Object.fromEntries(fd);
  await fetch('/api/codes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  e.target.reset();
  fetchCodes();
});

document.getElementById('codesList').addEventListener('click', async e => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.dataset.id;
  const c = codes.find(x => x._id === id);
  if (btn.dataset.act === 'reveal') {
    if (revealed.has(id)) revealed.delete(id); else revealed.add(id);
    renderCodes();
  } else if (btn.dataset.act === 'copy') {
    await navigator.clipboard.writeText(c.code);
    showToast('✓ Хуулсан');
  } else if (btn.dataset.act === 'del-code') {
    if (!confirm(`"${c.appName}" код устгах уу?`)) return;
    await fetch('/api/codes/' + id, { method: 'DELETE' });
    revealed.delete(id);
    fetchCodes();
  }
});

document.getElementById('codeSearch').addEventListener('input', e => {
  codeSearch = e.target.value;
  renderCodes();
});

document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    document.getElementById('tab-' + t.dataset.tab).classList.add('active');
  });
});

fetchStatements();
fetchTxns();
fetchCodes();
