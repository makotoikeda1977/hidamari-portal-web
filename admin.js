/* ひだまりグループ 社内ポータル — 管理画面（PCブラウザ） */

const A = { me: null, month: '', dash: null };
const $ = (id) => document.getElementById(id);

window.addEventListener('DOMContentLoaded', async () => {
  if (!API.token()) {
    // 検証環境なら、そのまま管理者で入れるようにしておく
    const demo = (window.PORTAL_DEMO || []).find(u => /総務/.test(u.label));
    if (demo) {
      try {
        const r = await API.call('login', { login_id: demo.id, password: demo.pw });
        API.setToken(r.token);
      } catch (e) { return location.href = 'index.html'; }
    } else {
      return location.href = 'index.html';
    }
  }
  try {
    const d = await API.call('me');
    A.me = d.me; A.month = d.month;
  } catch (e) { return location.href = 'index.html'; }
  if (A.me.role !== 'admin' && A.me.role !== 'manager') {
    document.body.innerHTML = '<div class="app" style="padding:40px"><div class="card">'
      + '<h2>権限がありません</h2><p class="muted">管理画面は総務・管理者のみが使えます。</p>'
      + '<a class="btn" href="index.html">社員画面へ</a></div></div>';
    return;
  }
  $('whoami').textContent = `${A.me.name}（${A.me.role === 'admin' ? '管理者' : A.me.office + ' 管理'}）`;
  $('monthPick').value = A.month;
  $('monthPick').onchange = () => { A.month = $('monthPick').value; render(current); };
  $('btnStaff').onclick = () => location.href = 'index.html';
  $('btnLogout').onclick = async () => {
    if (!confirm('ログアウトしますか？')) return;
    try { await API.call('logout'); } catch (e) { }
    API.setToken(''); location.href = 'index.html';
  };
  document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => render(b.dataset.v));
  render('dash');
});

let current = 'dash';
function render(v) {
  current = v;
  document.querySelectorAll('.view').forEach(s => s.classList.remove('active'));
  $('v-' + v).classList.add('active');
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  ({ dash: renderDash, leaves: renderLeaves, corr: renderCorrections, dev: renderDev,
     leave: renderLeave,
     chat: renderChat, apply: renderApplications, exp: renderExpenses, docs: renderDocs,
     emps: renderEmps, offices: renderOffices, kaonavi: renderKaonavi,
     treat: renderTreatments, drive: renderDrives, incident: renderIncidents,
     contract: renderContracts, pledge: renderPledge, assets: renderAssets,
     notice: renderNotice, audit: renderAudit })[v]();
}

function openSheet(html) {
  $('sheet').innerHTML = html;
  $('sheetBg').classList.add('open');
  $('sheetBg').onclick = (e) => { if (e.target === $('sheetBg')) closeSheet(); };
}
function closeSheet() { $('sheetBg').classList.remove('open'); }

function setCount(id, n) {
  const e = $(id);
  e.style.display = n ? '' : 'none';
  e.textContent = n;
}

/* ============================ ダッシュボード ============================ */

async function renderDash() {
  const v = $('v-dash');
  v.innerHTML = '<div class="loading">読み込み中…</div>';
  try {
    const d = await API.call('admin.dashboard', { month: A.month });
    A.dash = d;
    // サイドナビの件数は、ここでまとめて出しておく
    setCount('cLeave', d.counts.pending_leave + (d.counts.pending_overtime || 0));
    setCount('cChat', d.counts.unread_chat);
    setCount('cDocs', d.counts.docs_pending);
    setCount('cExp', d.counts.pending_expense || 0);
    setCount('cCorr', d.counts.pending_correction || 0);
    setCount('cApply', d.counts.pending_apply || 0);
    setCount('cDev', d.counts.unreported_reason || 0);

    v.innerHTML = `
      <div id="monthlyBox"></div>
      <div class="kpis">
        <div class="kpi"><b>${d.counts.employees}</b><span>在籍</span></div>
        <div class="kpi ${d.counts.unregistered ? 'alert' : ''}"><b>${d.counts.unregistered}</b><span>アプリ未登録</span></div>
        <div class="kpi ${d.counts.not_submitted ? 'alert' : ''}"><b>${d.counts.not_submitted}</b><span>勤怠 未提出</span></div>
        <div class="kpi ${d.counts.pending_leave ? 'alert' : ''}"><b>${d.counts.pending_leave}</b><span>有給 承認待ち</span></div>
        <div class="kpi ${d.counts.pending_overtime ? 'alert' : ''}"><b>${d.counts.pending_overtime}</b><span>残業 承認待ち</span></div>
        <div class="kpi ${d.counts.unapproved_overtime ? 'alert' : ''}"><b>${d.counts.unapproved_overtime}</b><span>申請なしの超過</span></div>
        <div class="kpi ${d.counts.unread_chat ? 'alert' : ''}"><b>${d.counts.unread_chat}</b><span>未読の連絡</span></div>
        <div class="kpi ${d.counts.docs_pending ? 'alert' : ''}"><b>${d.counts.docs_pending}</b><span>書類 未確認</span></div>
        <div class="kpi ${d.counts.pending_expense ? 'alert' : ''}"><b>${d.counts.pending_expense}</b><span>交通費 承認待ち</span></div>
        <div class="kpi ${d.counts.missing_expense ? 'alert' : ''}"><b>${d.counts.missing_expense}</b><span>交通費 未提出</span></div>
        <div class="kpi ${d.counts.pending_correction ? 'alert' : ''}"><b>${d.counts.pending_correction}</b><span>打刻の申告</span></div>
        <div class="kpi ${d.counts.pending_apply ? 'alert' : ''}"><b>${d.counts.pending_apply}</b><span>届出・証明書</span></div>
        <div class="kpi ${d.counts.unreported_reason ? 'alert' : ''}"><b>${d.counts.unreported_reason}</b><span>遅刻の理由 未報告</span></div>
      </div>

      <div class="card-head">
        <h2>${d.month} の提出状況</h2>
        <div style="display:flex; gap:8px;">
          <button class="btn sm" id="btnCsv">給与計算用CSV</button>
          <button class="btn sm" id="btnCopy">表をコピー</button>
          <button class="btn sm primary" id="btnClose">この月を締める</button>
        </div>
      </div>
      <div class="table-wrap">
        <table class="grid">
          <thead><tr>
            <th>コード</th><th>氏名</th><th>法人</th><th>事業所</th>
            <th class="num">未入力</th><th class="num">出勤</th><th class="num">有給</th>
            <th class="num">有給残</th>
            <th class="num">欠勤</th><th class="num">総労働h</th>
            <th class="num">残業h</th><th class="num">申請なし超過</th>
            <th>締め</th><th>カオナビ</th><th></th>
          </tr></thead>
          <tbody>${d.rows.map(r => `<tr>
            <td>${esc(r.code)}</td>
            <td>${esc(r.name)}${r.registered ? '' : ' <span class="badge warn">未登録</span>'}</td>
            <td>${esc(r.company)}</td><td>${esc(r.office)}</td>
            <td class="num" style="${r.missing ? 'color:var(--warn); font-weight:700' : ''}">${r.missing}</td>
            <td class="num">${r.work_days}</td><td class="num">${r.paid_days}</td>
            <td class="num">${r.leave_remain === undefined ? '' : r.leave_remain}</td>
            <td class="num">${r.absent_days}</td><td class="num">${r.total_hours}</td>
            <td class="num">${r.overtime_hours || ''}</td>
            <td class="num" style="${r.unapproved_hours ? 'color:var(--warn); font-weight:700' : ''}">${r.unapproved_hours || ''}</td>
            <td>${r.final ? '<span class="badge ok">済</span>' : '<span class="badge">—</span>'}</td>
            <td>${r.pushed ? '<span class="badge ok">投入済</span>' : '<span class="badge">—</span>'}</td>
            <td><button class="btn sm" data-detail="${esc(r.code)}">明細</button>
                ${r.final ? `<button class="btn sm ghost" data-unlock="${esc(r.code)}">差戻し</button>` : ''}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`;

    renderMonthlySteps();
    $('btnCsv').onclick = downloadCsv;
    $('btnClose').onclick = async () => {
      const rest = d.rows.filter(r => !r.final).length;
      if (!confirm(`${d.month} の勤怠を締めます。\n`
        + (rest ? `まだ締めていない方が ${rest}名 います。\n` : '')
        + `締めると社員は申告できなくなります。よろしいですか？`)) return;
      try {
        const r = await API.call('admin.close', { month: A.month });
        toast(`${r.closed}名分を締めました`);
        renderDash();
      } catch (e) { toast(e.message, 'err'); }
    };
    $('btnCopy').onclick = copyTable;
    v.querySelectorAll('[data-detail]').forEach(b => b.onclick = () => openDetail(b.dataset.detail));
    v.querySelectorAll('[data-unlock]').forEach(b => b.onclick = async () => {
      if (!confirm('本人が編集できるように差し戻します。よろしいですか？')) return;
      try {
        await API.call('admin.unlock', { code: b.dataset.unlock, month: A.month });
        toast('差し戻しました'); renderDash();
      } catch (e) { toast(e.message, 'err'); }
    });
  } catch (e) {
    v.innerHTML = `<div class="card"><p class="muted">${esc(e.message)}</p></div>`;
  }
}

/** 社労士（グランディス）へ渡す給与計算用のCSV。法人ごとに分けて出せる */
async function downloadCsv() {
  let d;
  try { d = await API.call('admin.export', { month: A.month, record: false }); }
  catch (e) { return toast(e.message, 'err'); }

  openSheet(`
    <div class="sheet-title"><h2>給与計算用のCSV</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <p class="muted">社労士がそのまま計算に使える形で出します。
      割増の単価が違うもの（法定内残業・法定外残業・深夜・休日）は列を分けてあります。
      時間はすべて「時間」の小数第1位までです。</p>

    <label class="field"><span>法人</span>
      <select id="exCompany">
        <option value="">すべて（1つのファイル）</option>
        ${(d.companies || []).map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
      </select></label>
    <p class="muted" style="margin-top:-6px;">
      DC宮原とひだまり倶楽部で分けて返ってくる運用なら、法人ごとに出すほうが確実です。</p>

    <label style="display:flex; align-items:center; gap:8px; margin:12px 0;">
      <input type="checkbox" id="exWithExpense" style="width:auto;">
      通勤交通費も同じファイルに入れる</label>
    <p class="muted" style="margin-top:-6px;">
      入れないときは、交通費タブから別ファイルで出せます（いまの運用はこちら）。</p>

    <div class="card" style="margin:14px 0;">
      <h3 style="margin-bottom:6px;">出てくる列</h3>
      <p class="muted" style="word-break:break-all;">${esc((d.header || []).join('／'))}</p>
    </div>

    <button class="btn primary block" id="exGo">ダウンロード</button>`);

  $('exGo').onclick = async () => {
    const company = $('exCompany').value;
    const withExpense = $('exWithExpense').checked;
    const b = $('exGo'); b.disabled = true; b.textContent = '作成中…';
    try {
      const r = await API.call('admin.export',
        { month: A.month, company, with_expense: withExpense });
      if (!r.rows.length) { toast('対象の方がいません', 'err'); return; }
      const blob = new Blob(['\ufeff' + r.csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `勤怠_${A.month}${company ? '_' + company : ''}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      closeSheet();
      toast(`${r.rows.length}名分を書き出しました`);
    } catch (e) { toast(e.message, 'err'); }
    finally { b.disabled = false; b.textContent = 'ダウンロード'; }
  };
}

async function copyTable() {
  try {
    const d = await API.call('admin.export', { month: A.month });
    const tsv = [d.header.join('\t')].concat(d.rows.map(r => r.join('\t'))).join('\n');
    await navigator.clipboard.writeText(tsv);
    toast('コピーしました。Excelにそのまま貼れます');
  } catch (e) { toast(e.message, 'err'); }
}

async function openDetail(code) {
  try {
    const k = await API.call('attendance.month', { month: A.month, code });
    const emp = A.dash.rows.find(r => r.code === code) || {};
    const dates = Object.keys(k.days).sort();
    openSheet(`
      <div class="sheet-title"><h2>${esc(emp.name)} — ${A.month}</h2>
        <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
      <div class="kpis" style="margin-bottom:14px;">
        <div class="kpi"><b>${k.summary.work_days}</b><span>出勤</span></div>
        <div class="kpi"><b>${Math.round(k.summary.total_min / 6) / 10}</b><span>総労働h</span></div>
        <div class="kpi"><b>${k.summary.paid_days}</b><span>有給</span></div>
        <div class="kpi"><b>${k.balance.remain}</b><span>有給残</span></div>
      </div>
      <div class="table-wrap" style="max-height:52vh; overflow-y:auto;">
        <table class="grid">
          <thead><tr><th>日</th><th>区分</th><th>出勤</th><th>退勤</th><th class="num">休憩</th>
            <th class="num">実働h</th><th>メモ</th></tr></thead>
          <tbody>${dates.map(d => {
            const r = k.days[d];
            return `<tr><td>${Number(d.slice(8, 10))}日</td><td>${esc(r.kind)}</td>
              <td>${esc(r.start || '')}</td><td>${esc(r.end || '')}</td>
              <td class="num">${esc(r.break_min || '')}</td>
              <td class="num">${r.work_min ? Math.round(r.work_min / 6) / 10 : ''}</td>
              <td>${esc(r.note || '')}</td></tr>`;
          }).join('')}</tbody>
        </table>
      </div>
      ${dates.length ? '' : '<div class="empty-state">入力がありません</div>'}`);
  } catch (e) { toast(e.message, 'err'); }
}

/* ============================ 有給の承認 ============================ */

async function renderLeave() {
  const v = $('v-leave');
  v.innerHTML = '<div class="loading">読み込み中…</div>';
  try {
    const [d, ot, un] = await Promise.all([
      API.call('admin.leave.pending'),
      API.call('admin.overtime.pending'),
      API.call('admin.overtime.unapproved', { month: A.month })
    ]);
    setCount('cLeave', d.requests.length + ot.requests.length);
    v.innerHTML = `
      <h2 style="margin-bottom:10px;">残業の申請</h2>
      ${ot.requests.length ? `<div class="table-wrap" style="margin-bottom:8px;"><table class="grid">
        <thead><tr><th>申請日</th><th>氏名</th><th>事業所</th><th>対象日</th><th>区分</th>
          <th class="num">見込み</th><th>実績</th><th class="num">実際の超過</th>
          <th>理由</th><th></th></tr></thead>
        <tbody>${ot.requests.map(r => `<tr>
          <td>${fmtDateTime(r.created_at)}</td><td>${esc(r.name)}</td><td>${esc(r.office)}</td>
          <td>${fmtDate(r.date)}</td>
          <td><span class="badge ${r.timing === '事後' ? 'warn' : ''}">${esc(r.timing)}</span></td>
          <td class="num">${fmtMin(r.minutes)}</td>
          <td>${esc(r.actual_start || '')}${r.actual_end ? '〜' + esc(r.actual_end) : ''}</td>
          <td class="num">${r.actual_over ? fmtMin(r.actual_over) : '—'}</td>
          <td>${esc(r.reason || '')}</td>
          <td style="white-space:nowrap;">
            <button class="btn sm primary" data-otok="${esc(r.id)}"
              data-min="${esc(r.minutes)}" data-over="${esc(r.actual_over || '')}">承認</button>
            <button class="btn sm danger" data-otng="${esc(r.id)}">却下</button></td>
        </tr>`).join('')}</tbody></table></div>
        <p class="muted" style="margin-bottom:24px;">
          承認する時間は変更できます。実際の超過より多く申請されている場合は、実績に合わせてください。</p>`
        : '<div class="empty-state" style="margin-bottom:24px;">残業の承認待ちはありません</div>'}

      ${un.rows.length ? `
        <h2 style="margin-bottom:10px;">申請がないまま所定を超えている日（${un.month}）</h2>
        <div class="table-wrap" style="margin-bottom:8px;"><table class="grid">
          <thead><tr><th>日付</th><th>氏名</th><th>事業所</th><th>出勤</th><th>退勤</th>
            <th class="num">超過</th><th class="num">承認ずみ</th><th>入力</th><th>退勤の打刻</th></tr></thead>
          <tbody>${un.rows.map(r => `<tr>
            <td>${esc(r.date.slice(5))}</td><td>${esc(r.name)}</td><td>${esc(r.office)}</td>
            <td>${esc(r.start || '')}</td><td>${esc(r.end || '')}</td>
            <td class="num" style="color:var(--warn); font-weight:700;">${Math.round(r.raw / 6) / 10}h</td>
            <td class="num">${r.approved ? Math.round(r.approved / 6) / 10 + 'h' : '—'}</td>
            <td><span class="badge ${r.source === 'punch' ? 'ok' : 'warn'}">${r.source === 'punch' ? '打刻' : '手入力'}</span></td>
            <td>${esc(r.punch_out_at || '—')}</td>
          </tr>`).join('')}</tbody></table></div>
        <p class="muted" style="margin-bottom:24px;">
          この分は残業として計上されません。退勤の押し忘れであれば本人に時刻を直してもらい、
          実際に働いていたのであれば本人から事後申請を出してもらってください。</p>` : ''}

      <h2 style="margin-bottom:10px;">休暇の申請</h2>` + (d.requests.length ? `
      <div class="table-wrap"><table class="grid">
        <thead><tr><th>申請日</th><th>氏名</th><th>事業所</th><th>種類</th><th>期間</th>
          <th class="num">日数</th><th class="num">残</th><th>理由</th><th></th></tr></thead>
        <tbody>${d.requests.map(r => `<tr>
          <td>${fmtDateTime(r.created_at)}</td><td>${esc(r.name)}</td><td>${esc(r.office)}</td>
          <td>${esc(r.type)}</td>
          <td>${fmtDate(r.start_date)}${r.start_date !== r.end_date ? '〜' + fmtDate(r.end_date) : ''}</td>
          <td class="num">${esc(r.days)}</td><td class="num">${r.balance}</td>
          <td>${esc(r.reason || '')}</td>
          <td style="white-space:nowrap;">
            <button class="btn sm primary" data-ok="${esc(r.id)}">承認</button>
            <button class="btn sm danger" data-ng="${esc(r.id)}">却下</button></td>
        </tr>`).join('')}</tbody></table></div>
      <p class="muted" style="margin-top:12px;">
        承認すると、その日の勤怠が自動で「有給」になります（二重入力は不要です）。</p>`
      : '<div class="empty-state">休暇の承認待ちはありません</div>');

    v.querySelectorAll('[data-ok]').forEach(b => b.onclick = () => decide(b.dataset.ok, '承認'));
    v.querySelectorAll('[data-ng]').forEach(b => b.onclick = () => decide(b.dataset.ng, '却下'));
    v.querySelectorAll('[data-otok]').forEach(b => b.onclick = () => decideOt(b.dataset.otok, '承認', b.dataset.min, b.dataset.over));
    v.querySelectorAll('[data-otng]').forEach(b => b.onclick = () => decideOt(b.dataset.otng, '却下'));
  } catch (e) { v.innerHTML = `<div class="card"><p class="muted">${esc(e.message)}</p></div>`; }
}

async function decide(id, decision) {
  const comment = decision === '却下' ? (prompt('理由を入力してください（本人に通知されます）') || '') : '';
  if (decision === '却下' && !comment) return;
  try {
    await API.call('admin.leave.decide', { id, decision, comment });
    toast(decision + 'しました');
    renderLeave();
  } catch (e) { toast(e.message, 'err'); }
}

async function decideOt(id, decision, minutes, actualOver) {
  let min = minutes, comment = '';
  if (decision === '承認') {
    const suggest = actualOver || minutes;
    const input = prompt(`承認する残業時間（分）\n申請 ${minutes}分`
      + (actualOver ? ` ／ 実際の超過 ${actualOver}分` : ''), suggest);
    if (input === null) return;
    min = Number(input);
    if (!(min > 0)) return toast('分数が正しくありません', 'err');
  } else {
    comment = prompt('却下の理由を入力してください（本人に通知されます）') || '';
    if (!comment) return;
  }
  try {
    await API.call('admin.overtime.decide', { id, decision, minutes: min, comment });
    toast(decision + 'しました');
    renderLeave();
  } catch (e) { toast(e.message, 'err'); }
}

/* ============================ 総務への連絡 ============================ */

async function renderChat() {
  const v = $('v-chat');
  v.innerHTML = '<div class="loading">読み込み中…</div>';
  try {
    const d = await API.call('chat.threads');
    setCount('cChat', d.threads.filter(t => t.unread).length);
    v.innerHTML = d.threads.length ? `
      <div class="table-wrap"><table class="grid">
        <thead><tr><th>更新</th><th>氏名</th><th>事業所</th><th>種類</th><th>件名</th>
          <th>状態</th><th></th></tr></thead>
        <tbody>${d.threads.map(t => `<tr>
          <td>${fmtDateTime(t.updated_at)}</td>
          <td>${esc(t.name)}${t.unread ? ' <span class="badge dot">新着</span>' : ''}</td>
          <td>${esc(t.office)}</td><td>${esc(t.category)}</td><td>${esc(t.subject)}</td>
          <td><span class="badge ${t.status === '完了' ? 'ok' : ''}">${esc(t.status)}</span></td>
          <td><button class="btn sm" data-t="${esc(t.id)}">開く</button></td>
        </tr>`).join('')}</tbody></table></div>`
      : '<div class="empty-state">やりとりはありません</div>';
    v.querySelectorAll('[data-t]').forEach(b => b.onclick = () => openThread(b.dataset.t));
  } catch (e) { v.innerHTML = `<div class="card"><p class="muted">${esc(e.message)}</p></div>`; }
}

async function openThread(id) {
  try {
    const d = await API.call('chat.messages', { id });
    openSheet(`
      <div class="sheet-title">
        <div><h2>${esc(d.thread.subject)}</h2>
          <div class="muted">${esc(d.employee.name)}（${esc(d.employee.office)}）・${esc(d.thread.category)}</div></div>
        <div style="display:flex; gap:8px;">
          ${d.thread.status !== '完了' ? `<button class="btn sm" id="tClose">対応完了</button>` : ''}
          <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
      </div>
      <div class="chat" style="max-height:46vh; overflow-y:auto;">
        ${d.messages.map(m => `<div class="bubble ${m.from_side === 'admin' ? 'staff' : 'admin'}">
          <div class="who">${m.from_side === 'admin' ? '総務 ' + esc(m.from_name) : esc(m.from_name)}</div>
          ${esc(m.body)}
          ${m.file_url ? `<div style="margin-top:6px;"><a href="${esc(m.file_url)}" target="_blank"
             rel="noopener" style="color:inherit;">📎 ${esc(m.file_name)}</a></div>` : ''}
          <div class="time">${fmtDateTime(m.created_at)}</div></div>`).join('')}
      </div>
      <div style="margin-top:14px;">
        <textarea id="mBody" placeholder="返信を書く"></textarea>
        <button class="btn primary block" id="mSend" style="margin-top:8px;">返信する</button>
      </div>`);
    $('mSend').onclick = async () => {
      try {
        await API.call('chat.post', { thread_id: id, body: $('mBody').value });
        closeSheet(); toast('返信しました'); renderChat();
      } catch (e) { toast(e.message, 'err'); }
    };
    if ($('tClose')) $('tClose').onclick = async () => {
      try { await API.call('chat.close', { id }); closeSheet(); toast('完了にしました'); renderChat(); }
      catch (e) { toast(e.message, 'err'); }
    };
  } catch (e) { toast(e.message, 'err'); }
}

/* ============================ 提出書類 ============================ */

async function renderDocs() {
  const v = $('v-docs');
  v.innerHTML = '<div class="loading">読み込み中…</div>';
  try {
    const d = await API.call('admin.docs');
    setCount('cDocs', d.documents.filter(x => x.status === '提出済').length);
    v.innerHTML = `
      <p class="muted">提出された書類は ${esc(window.DOC_MAIL_TO || 'sadame1999@icloud.com')}
        へ自動でメール送信され、Driveにも保管されます。</p>
      ${d.documents.length ? `<div class="table-wrap"><table class="grid">
        <thead><tr><th>提出日時</th><th>氏名</th><th>事業所</th><th>書類</th><th>状態</th>
          <th>ファイル</th><th></th></tr></thead>
        <tbody>${d.documents.map(x => `<tr>
          <td>${fmtDateTime(x.uploaded_at)}</td><td>${esc(x.name)}</td><td>${esc(x.office)}</td>
          <td>${esc(x.label)}</td>
          <td><span class="badge ${x.status === '確認済' ? 'ok' : x.status === '再提出' ? 'warn' : ''}">${esc(x.status)}</span></td>
          <td><a href="${esc(x.file_url)}" target="_blank" rel="noopener">開く</a></td>
          <td style="white-space:nowrap;">
            <button class="btn sm primary" data-ok="${esc(x.id)}">確認済</button>
            <button class="btn sm ghost" data-re="${esc(x.id)}">再提出</button></td>
        </tr>`).join('')}</tbody></table></div>`
      : '<div class="empty-state">提出された書類はありません</div>'}`;

    v.querySelectorAll('[data-ok]').forEach(b => b.onclick = async () => {
      try { await API.call('doc.check', { id: b.dataset.ok, status: '確認済' }); toast('確認済にしました'); renderDocs(); }
      catch (e) { toast(e.message, 'err'); }
    });
    v.querySelectorAll('[data-re]').forEach(b => b.onclick = async () => {
      const note = prompt('再提出の理由（本人に通知されます）');
      if (!note) return;
      try { await API.call('doc.check', { id: b.dataset.re, status: '再提出', note }); toast('再提出を依頼しました'); renderDocs(); }
      catch (e) { toast(e.message, 'err'); }
    });
  } catch (e) { v.innerHTML = `<div class="card"><p class="muted">${esc(e.message)}</p></div>`; }
}

/* ============================ 社員 ============================ */

let EMP_FILTER = '';

async function renderEmps() {
  const v = $('v-emps');
  if (A.me.role !== 'admin') { v.innerHTML = '<div class="empty-state">管理者のみ</div>'; return; }
  v.innerHTML = '<div class="loading">読み込み中…</div>';
  try {
    const d = await API.call('admin.employees');
    const emps = d.employees.filter(e => e.status !== '退職');

    // 事業部ごとにまとめる。打刻のしかたはここで決まるので、いちばん上に出す
    const byOffice = {};
    emps.forEach(e => {
      const k = e.office || '（未設定）';
      (byOffice[k] = byOffice[k] || []).push(e);
    });
    const offices = Object.keys(byOffice).sort((a, b) => byOffice[b].length - byOffice[a].length);
    const MODE_LABEL = { onsite: '事業所勤務', field: '直行直帰', free: '制限なし' };

    const shown = EMP_FILTER ? emps.filter(e => (e.office || '（未設定）') === EMP_FILTER) : emps;

    v.innerHTML = `
      <div class="card-head">
        <h2>社員</h2>
        <div class="btn-row" style="margin:0;">
          <button class="btn sm primary" id="empInvite">入社前の方を招く</button>
          <button class="btn sm" id="empImport">カオナビから取り込む</button>
        </div>
      </div>

      ${(() => {
        const pre = emps.filter(e => e.pre_hire);
        if (!pre.length) return '';
        return `<div class="card">
          <h2>入社前の方（${pre.length}名）</h2>
          <p class="muted">アプリのご案内を送った方です。書類がそろったか、ここで見られます。</p>
          <div class="table-wrap"><table class="grid">
            <thead><tr><th>入社予定日</th><th>氏名</th><th>事業部</th><th>メール</th>
              <th>登録</th><th></th></tr></thead>
            <tbody>${pre.sort((a, b) => (a.join_date || '').localeCompare(b.join_date || ''))
              .map(e => `<tr>
              <td>${esc(e.join_date || '')}</td><td>${esc(e.name)}</td>
              <td>${esc(e.office || '')}</td><td>${esc(e.email || '')}</td>
              <td>${e.login_id ? '<span class="badge ok">ずみ</span>'
                               : '<span class="badge warn">まだ</span>'}</td>
              <td><button class="btn sm" data-reinv="${esc(e.code)}">案内を再送</button></td>
            </tr>`).join('')}</tbody></table></div>
        </div>`;
      })()}

      <div class="card">
        <h2>事業部ごとの打刻のしかた</h2>
        <p class="muted">出退勤のボタンは、この設定で変わります。
          事業所に設定があればそれを使い、社員ごとに決めればそちらが優先されます。</p>
        <div class="chip-row" style="margin-top:10px;">
          <button class="chip ${EMP_FILTER ? '' : 'on'}" data-of="">すべて（${emps.length}）</button>
          ${offices.map(o => {
            const list = byOffice[o];
            const modes = [...new Set(list.map(e => e.effective_mode))];
            const m = modes.length === 1 ? MODE_LABEL[modes[0]] : 'まちまち';
            return `<button class="chip ${EMP_FILTER === o ? 'on' : ''}" data-of="${esc(o)}">
              ${esc(o)}（${list.length}）<span class="muted"> ${esc(m)}</span></button>`;
          }).join('')}
        </div>
      </div>

      ${EMP_FILTER ? `<div class="card">
        <h2>「${esc(EMP_FILTER)}」の ${shown.length}名 をまとめて変える</h2>
        <div class="cols">
          <label class="field"><span>事業部（所属）を変える</span>
            <input type="text" id="asOffice" placeholder="${esc(EMP_FILTER)}"></label>
          <label class="field"><span>打刻のしかたを決める</span>
            <select id="asMode">
              <option value="">— 変えない —</option>
              <option value="onsite">事業所勤務（QR・位置で確認）</option>
              <option value="field">直行直帰（現場直行ボタン）</option>
              <option value="free">制限なし</option>
            </select></label>
        </div>
        <button class="btn primary" id="asGo">この ${shown.length}名 に反映する</button>
      </div>` : ''}

      <div class="table-wrap"><table class="grid">
        <thead><tr><th>社員番号</th><th>氏名</th><th>事業部</th><th>法人</th><th>区分</th>
          <th>打刻</th><th>権限</th><th>在籍</th><th>所定時刻</th><th>登録</th><th></th></tr></thead>
        <tbody>${shown.map(e => `<tr>
          <td>${esc(e.code)}</td><td>${esc(e.name)}</td>
          <td>${e.office ? esc(e.office) : '<span class="badge warn">未設定</span>'}</td>
          <td>${esc(e.company || '')}</td><td>${esc(e.employment || '')}</td>
          <td><span class="badge ${e.punch_mode ? 'ok' : ''}">${
            esc(MODE_LABEL[e.effective_mode] || '')}</span>${
            e.punch_mode ? '<br><span class="muted">個別に設定</span>' : ''}</td>
          <td><span class="badge ${e.role === 'admin' ? 'ok' : ''}">${esc(e.role || 'staff')}</span></td>
          <td><span class="badge ${e.status === '要確認' ? 'warn' : ''}">${esc(e.status)}</span></td>
          <td>${e.shift_start ? esc(e.shift_start) + '〜' + esc(e.shift_end || '')
            : '<span class="muted">事業所に従う</span>'}</td>
          <td>${e.login_id ? '<span class="badge ok">ずみ</span>' : '<span class="badge">まだ</span>'}</td>
          <td><button class="btn sm" data-edit="${esc(e.code)}">編集</button></td>
        </tr>`).join('')}</tbody></table></div>`;

    $('empImport').onclick = openEmployeeImport;
    $('empInvite').onclick = () => openInviteForm(d.app_url || '');
    v.querySelectorAll('[data-reinv]').forEach(b => b.onclick = async () => {
      const e = d.employees.find(x => x.code === b.dataset.reinv);
      if (!confirm(`${e.name} さんに、ご案内メールをもう一度送ります。よろしいですか？`)) return;
      try {
        const r = await API.call('admin.staff.reinvite', { code: e.code });
        toast(r.mailed ? '送りました' : '送信できませんでした。アドレスをご確認ください',
              r.mailed ? '' : 'err');
        renderEmps();
      } catch (err) { toast(err.message, 'err'); }
    });
    v.querySelectorAll('[data-of]').forEach(b => b.onclick = () => {
      EMP_FILTER = b.dataset.of; renderEmps();
    });
    if ($('asGo')) $('asGo').onclick = async () => {
      const office = $('asOffice').value.trim();
      const mode = $('asMode').value;
      if (!office && !mode) return toast('変える内容を入れてください', 'err');
      if (!confirm(`${shown.length}名に反映します。よろしいですか？`)) return;
      try {
        const payload = { codes: shown.map(e => e.code) };
        if (office) payload.office = office;
        if (mode) payload.punch_mode = mode;
        const r = await API.call('admin.employees.assign', payload);
        toast(`${r.updated}名を変えました`);
        EMP_FILTER = office || EMP_FILTER;
        renderEmps();
      } catch (e) { toast(e.message, 'err'); }
    };
    v.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
      const e = d.employees.find(x => x.code === b.dataset.edit);
      openEmployeeForm(e);
    });
  } catch (e) { v.innerHTML = `<div class="card"><p class="muted">${esc(e.message)}</p></div>`; }
}

/** 入社が決まった方をお招きする（名簿に載せて、ご案内メールを送る） */
function openInviteForm(appUrl) {
  openSheet(`
    <div class="sheet-title"><h2>入社前の方を招く</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <p class="muted">名簿に「入社予定」で載せ、アプリのご案内をメールでお送りします。
      入社日までは、書類の提出と総務への連絡だけができます。
      入社日を過ぎると、打刻などが自動で使えるようになります。</p>
    ${appUrl ? '' : `<div class="card" style="border-color:var(--warn); margin-top:12px;">
      <b>アプリのURLがまだ登録されていません</b>
      <p class="muted" style="margin:6px 0 10px;">
        ご案内メールに載せるURLです。一度入れておけば、次からは自動で入ります。</p>
      <input type="url" id="ivUrl" placeholder="https://……">
      <button class="btn block" id="ivUrlSave" style="margin-top:8px;">このURLを登録する</button>
    </div>`}
    <div class="cols" style="margin-top:12px;">
      <label class="field"><span>お名前</span>
        <input type="text" id="ivName" placeholder="例）山田 花子"></label>
      <label class="field"><span>ふりがな</span>
        <input type="text" id="ivKana" placeholder="ヤマダ ハナコ"></label>
      <label class="field"><span>生年月日（本人確認に使います）</span>
        <input type="date" id="ivBirthday"></label>
      <label class="field"><span>入社予定日</span>
        <input type="date" id="ivJoin"></label>
      <label class="field"><span>ご案内を送るメールアドレス</span>
        <input type="email" id="ivEmail" placeholder="hanako@example.com"></label>
      <label class="field"><span>法人</span>
        <select id="ivCompany">
          <option value="">— 選んでください —</option>
          <option>株式会社DC宮原</option>
          <option>ひだまり倶楽部</option>
        </select></label>
      <label class="field"><span>事業部（所属）</span>
        <input type="text" id="ivOffice" placeholder="例）ひだまり訪問看護"></label>
      <label class="field"><span>雇用区分</span>
        <input type="text" id="ivEmployment" placeholder="正社員／パート など"></label>
      <label class="field"><span>社員番号（空なら自動で採番）</span>
        <input type="text" id="ivCode" inputmode="numeric" placeholder="自動"></label>
    </div>
    <button class="btn primary block" id="ivGo" style="margin-top:8px;">
      名簿に載せて、ご案内を送る</button>
    <p class="muted" style="margin-top:10px;">
      お名前と生年月日は、ご本人が登録するときの本人確認に使います。
      名簿どおりの表記で入れてください。</p>`);

  if ($('ivUrlSave')) $('ivUrlSave').onclick = async () => {
    const url = $('ivUrl').value.trim();
    if (!/^https?:\/\//.test(url)) return toast('https:// から始まるURLを入れてください', 'err');
    try {
      await API.call('admin.setting.save', { key: 'app_url', value: url });
      toast('登録しました');
      $('ivUrlSave').closest('.card').remove();
    } catch (e) { toast(e.message, 'err'); }
  };

  $('ivGo').onclick = async () => {
    const b = $('ivGo'); b.disabled = true; b.textContent = '送信中…';
    try {
      const r = await API.call('admin.staff.invite', {
        name: $('ivName').value.trim(), kana: $('ivKana').value.trim(),
        birthday: $('ivBirthday').value, join_date: $('ivJoin').value,
        email: $('ivEmail').value.trim(), company: $('ivCompany').value,
        office: $('ivOffice').value.trim(), employment: $('ivEmployment').value.trim(),
        code: $('ivCode').value.trim()
      });
      closeSheet();
      toast(r.mailed
        ? `社員番号 ${r.code} で登録し、ご案内を送りました`
        : `社員番号 ${r.code} で登録しました（メールは送れませんでした）`,
        r.mailed ? '' : 'err');
      renderEmps();
    } catch (err) {
      toast(err.message, 'err');
      b.disabled = false; b.textContent = '名簿に載せて、ご案内を送る';
    }
  };
}

function openEmployeeForm(e) {
  openSheet(`
    <div class="sheet-title"><h2>${esc(e.name)}</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <div class="cols">
      <label class="field"><span>事業部（所属）</span>
        <input type="text" id="eOffice" value="${esc(e.office || '')}"></label>
      <label class="field"><span>法人</span>
        <input type="text" id="eCompany" value="${esc(e.company || '')}"></label>
      <label class="field"><span>打刻のしかた</span>
        <select id="eMode">
          <option value="">事業所の設定に従う</option>
          <option value="onsite" ${e.punch_mode === 'onsite' ? 'selected' : ''}>事業所勤務（QR・位置で確認）</option>
          <option value="field" ${e.punch_mode === 'field' ? 'selected' : ''}>直行直帰（現場直行ボタン）</option>
          <option value="free" ${e.punch_mode === 'free' ? 'selected' : ''}>制限なし</option>
        </select></label>
      <label class="field"><span>メールアドレス（通知に使います）</span>
        <input type="email" id="eEmail" value="${esc(e.email || '')}"></label>
      <label class="field"><span>権限</span>
        <select id="eRole">
          <option value="staff" ${e.role === 'staff' ? 'selected' : ''}>staff（一般）</option>
          <option value="manager" ${e.role === 'manager' ? 'selected' : ''}>manager（事業所の管理）</option>
          <option value="admin" ${e.role === 'admin' ? 'selected' : ''}>admin（総務・全社）</option>
        </select></label>
      <label class="field"><span>在籍状態</span>
        <select id="eStatus">
          ${['在籍', '入社予定', '休職', '要確認', '退職'].map(s =>
            `<option ${e.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select></label>
      <label class="field"><span>生年月日（初回登録の本人確認に使います）</span>
        <input type="date" id="eBirthday" value="${esc(e.birthday || '')}"></label>
      <label class="field"><span>入社予定日（入社予定の方のみ）</span>
        <input type="date" id="eJoin" value="${esc(e.join_date || '')}"></label>
      <label class="field"><span>所定の始業（空なら事業所の設定）</span>
        <input type="time" id="eShiftStart" value="${esc(e.shift_start || '')}"></label>
      <label class="field"><span>所定の終業</span>
        <input type="time" id="eShiftEnd" value="${esc(e.shift_end || '')}"></label>
    </div>
    <div class="btn-row" style="margin-top:8px;">
      <button class="btn danger" id="eReset">ログイン情報をリセット</button>
      <button class="btn primary" id="eSave">保存</button>
    </div>
    <p class="muted" style="margin-top:10px;">
      リセットすると、本人が初回登録からやり直せます（パスワードを忘れた時に使います）。
      社員番号は変わりません。</p>`);

  $('eSave').onclick = async () => {
    try {
      await API.call('admin.employee.save', {
        code: e.code, office: $('eOffice').value, company: $('eCompany').value,
        punch_mode: $('eMode').value, email: $('eEmail').value, role: $('eRole').value,
        status: $('eStatus').value, birthday: $('eBirthday').value,
        join_date: $('eJoin').value,
        shift_start: $('eShiftStart').value, shift_end: $('eShiftEnd').value });
      closeSheet(); toast('保存しました'); renderEmps();
    } catch (err) { toast(err.message, 'err'); }
  };
  $('eReset').onclick = async () => {
    if (!confirm(`${e.name} さんのログイン情報をリセットします。よろしいですか？`)) return;
    try {
      await API.call('admin.employee.resetLogin', { code: e.code });
      closeSheet(); toast('リセットしました'); renderEmps();
    } catch (err) { toast(err.message, 'err'); }
  };
}

/* ============================ カオナビ連動 ============================ */

function renderKaonavi() {
  const v = $('v-kaonavi');
  if (A.me.role !== 'admin') { v.innerHTML = '<div class="empty-state">管理者のみ</div>'; return; }
  v.innerHTML = `
    <div class="cols">
      <div class="card">
        <h2>社員マスタの取り込み</h2>
        <p class="muted">カオナビの社員情報をこのアプリへ取り込みます（毎日4時に自動でも実行されます）。
          権限・メール・ログイン情報は上書きされません。</p>
        <button class="btn primary block" id="kSync">いま同期する</button>
        <div id="kSyncOut" class="muted" style="margin-top:10px;"></div>
      </div>

      <div class="card">
        <h2>月次勤怠の投入</h2>
        <p class="muted">本締めが終わった社員の勤怠を、カオナビ「勤怠情報（月次）」へ投入します。
          まず内容を確認してから実行してください。</p>
        <div class="btn-row">
          <button class="btn" id="kPreview">${A.month} の内容を確認</button>
          <button class="btn primary" id="kPush" disabled>投入する</button>
        </div>
        <div id="kPushOut" style="margin-top:12px;"></div>
      </div>

      <div class="card">
        <h2>有給の付与を取り込む</h2>
        <p class="muted">カオナビの有給シートから付与日数を取り込みます。
          取得日数はこのアプリの実績が正になります。</p>
        <button class="btn block" id="kLeave">内容を確認する</button>
        <div id="kLeaveOut" class="muted" style="margin-top:10px;"></div>
      </div>
    </div>`;

  $('kSync').onclick = async () => {
    $('kSyncOut').textContent = '同期中…';
    try {
      const r = await API.call('kaonavi.syncMembers');
      $('kSyncOut').innerHTML = `追加 ${r.added.length}名 ／ 更新 ${r.updated}名 ／ 要確認 ${r.missing.length}名`
        + (r.added.length ? `<br>新規: ${esc(r.added.join('、'))}` : '')
        + (r.missing.length ? `<br><span style="color:var(--warn)">カオナビに見つからない: ${esc(r.missing.join('、'))}</span>` : '');
      toast('同期しました');
    } catch (e) { $('kSyncOut').textContent = e.message; toast(e.message, 'err'); }
  };

  $('kPreview').onclick = async () => {
    $('kPushOut').innerHTML = '<span class="muted">確認中…</span>';
    try {
      const r = await API.call('kaonavi.pushKintai', { month: A.month, dry_run: true });
      $('kPushOut').innerHTML = r.count ? `
        <div class="table-wrap" style="max-height:320px; overflow-y:auto;">
          <table class="grid"><thead><tr><th>コード</th><th>氏名</th><th class="num">出勤</th>
            <th class="num">休出</th><th class="num">有給</th><th class="num">欠勤</th>
            <th class="num">総労働h</th><th>既存</th></tr></thead>
          <tbody>${r.preview.map(x => `<tr><td>${esc(x.code)}</td><td>${esc(x.name)}</td>
            <td class="num">${x.work_days}</td><td class="num">${x.holiday_work}</td>
            <td class="num">${x.paid_days}</td><td class="num">${x.absent_days}</td>
            <td class="num">${x.total_hours}</td>
            <td>${x.replaced ? '<span class="badge warn">上書き</span>' : '新規'}</td></tr>`).join('')}
          </tbody></table></div>
        <p class="muted" style="margin-top:8px;">${r.count}名分です。内容を確認して「投入する」を押してください。</p>`
        : '<p class="muted">本締めが終わった社員がいません。</p>';
      $('kPush').disabled = !r.count;
    } catch (e) { $('kPushOut').innerHTML = `<span class="muted">${esc(e.message)}</span>`; }
  };

  $('kPush').onclick = async () => {
    if (!confirm(`${A.month} の勤怠をカオナビへ投入します。よろしいですか？`)) return;
    try {
      const r = await API.call('kaonavi.pushKintai', { month: A.month, dry_run: false });
      $('kPushOut').innerHTML = `<p>投入しました（${r.applied}名・task ${esc(r.task_id)}）。</p>`;
      $('kPush').disabled = true;
      toast('カオナビへ投入しました');
    } catch (e) { toast(e.message, 'err'); }
  };

  $('kLeave').onclick = async () => {
    $('kLeaveOut').textContent = '確認中…';
    try {
      const r = await API.call('kaonavi.syncLeave', { dry_run: true });
      $('kLeaveOut').innerHTML = `${r.count}件の付与データが見つかりました。`
        + (r.count ? ` <button class="btn sm primary" id="kLeaveGo">取り込む</button>` : '')
        + `<br><span class="muted">${esc(r.note || '')}</span>`;
      if ($('kLeaveGo')) $('kLeaveGo').onclick = async () => {
        const rr = await API.call('kaonavi.syncLeave', { dry_run: false });
        $('kLeaveOut').textContent = `${rr.applied}件を取り込みました`;
        toast('取り込みました');
      };
    } catch (e) { $('kLeaveOut').textContent = e.message; }
  };
}

/* ============================ お知らせ ============================ */

async function renderNotice() {
  const v = $('v-notice');
  v.innerHTML = '<div class="loading">読み込み中…</div>';
  try {
    const d = await API.call('notice.list');
    v.innerHTML = `
      <div class="cols">
        <div class="card">
          <h2>お知らせを出す</h2>
          <label class="field"><span>件名</span><input type="text" id="nTitle"></label>
          <label class="field"><span>本文</span><textarea id="nBody"></textarea></label>
          <label class="field"><span>対象</span>
            <select id="nScope"><option value="全社">全社</option>
              <option value="法人">法人を指定</option><option value="事業所">事業所を指定</option></select></label>
          <div id="nTargetBox" style="display:none;">
            <label class="field"><span>対象の名前（法人名または事業所名）</span>
              <input type="text" id="nTarget" placeholder="例）ひだまり倶楽部 / TEENS2"></label>
          </div>
          <label class="field"><span>添付のURL（任意・Driveの共有リンクなど）</span>
            <input type="text" id="nUrl"></label>
          <label style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
            <input type="checkbox" id="nImp" style="width:auto;"> 重要なお知らせにする</label>
          <button class="btn primary block" id="nSave">お知らせを出す</button>
        </div>

        <div class="card">
          <h2>掲載中</h2>
          ${d.notices.length ? `<div class="list">${d.notices.map(n => `
            <div class="item" style="cursor:default;">
              <div class="grow">
                <div class="title">${n.important === 'yes' ? '<span class="badge warn">重要</span> ' : ''}${esc(n.title)}</div>
                <div class="meta">${fmtDateTime(n.published_at)} ・ ${esc(n.scope)}${esc(n.company || n.office || '')}</div>
              </div>
              <button class="btn sm danger" data-del="${esc(n.id)}">削除</button>
            </div>`).join('')}</div>`
          : '<div class="empty-state">お知らせはありません</div>'}
        </div>
      </div>`;

    $('nScope').onchange = () => {
      $('nTargetBox').style.display = $('nScope').value === '全社' ? 'none' : '';
    };
    $('nSave').onclick = async () => {
      if (!$('nTitle').value) return toast('件名を入れてください', 'err');
      const scope = $('nScope').value;
      const target = $('nTarget') ? $('nTarget').value : '';
      try {
        await API.call('notice.create', {
          title: $('nTitle').value, body: $('nBody').value, scope,
          company: scope === '法人' ? target : '', office: scope === '事業所' ? target : '',
          attachment_url: $('nUrl').value, important: $('nImp').checked });
        toast('掲載しました'); renderNotice();
      } catch (e) { toast(e.message, 'err'); }
    };
    v.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!confirm('削除しますか？')) return;
      try { await API.call('notice.delete', { id: b.dataset.del }); toast('削除しました'); renderNotice(); }
      catch (e) { toast(e.message, 'err'); }
    });
  } catch (e) { v.innerHTML = `<div class="card"><p class="muted">${esc(e.message)}</p></div>`; }
}

/* ============================ 操作ログ ============================ */

async function renderAudit() {
  const v = $('v-audit');
  if (A.me.role !== 'admin') { v.innerHTML = '<div class="empty-state">管理者のみ</div>'; return; }
  v.innerHTML = '<div class="loading">読み込み中…</div>';
  try {
    const d = await API.call('admin.audit', { limit: 300 });
    v.innerHTML = `<div class="table-wrap"><table class="grid">
      <thead><tr><th>日時</th><th>社員</th><th>操作</th><th>対象</th><th>内容</th></tr></thead>
      <tbody>${d.audit.map(a => `<tr><td>${fmtDateTime(a.ts)}</td><td>${esc(a.code)}</td>
        <td>${esc(a.action)}</td><td>${esc(a.target)}</td><td>${esc(a.detail)}</td></tr>`).join('')}
      </tbody></table></div>`;
  } catch (e) { v.innerHTML = `<div class="card"><p class="muted">${esc(e.message)}</p></div>`; }
}

/* ============================ 遅刻・早退 ============================ */

async function renderDev() {
  const v = $('v-dev');
  v.innerHTML = '<div class="loading">読み込み中…</div>';
  try {
    const d = await API.call('admin.deviations', { month: A.month });
    setCount('cDev', d.unreported);
    v.innerHTML = `
      <div class="kpis">
        <div class="kpi"><b>${d.rows.length}</b><span>${d.month} の件数</span></div>
        <div class="kpi ${d.unreported ? 'alert' : ''}"><b>${d.unreported}</b><span>理由の報告なし</span></div>
      </div>
      ${d.rows.length ? `<div class="table-wrap"><table class="grid">
        <thead><tr><th>日付</th><th>氏名</th><th>事業所</th><th>出勤</th><th>退勤</th>
          <th class="num">遅刻</th><th class="num">早退</th><th>打刻場所</th>
          <th>理由</th><th>遅延証明</th><th>入力</th></tr></thead>
        <tbody>${d.rows.map(r => `<tr>
          <td>${esc(r.date.slice(5))}</td><td>${esc(r.name)}</td><td>${esc(r.office)}</td>
          <td>${esc(r.start || '')}</td><td>${esc(r.end || '')}</td>
          <td class="num" style="${r.late_min ? 'color:var(--warn); font-weight:700' : ''}">${r.late_min ? fmtMin(r.late_min) : ''}</td>
          <td class="num" style="${r.early_min ? 'color:var(--warn); font-weight:700' : ''}">${r.early_min ? fmtMin(r.early_min) : ''}</td>
          <td>${placeCell(r)}</td>
          <td>${r.reported_at
            ? `${esc(r.reason_type || '')}${r.reason ? '<br><span class="muted">' + esc(r.reason) + '</span>' : ''}`
            : (r.late_min || r.early_min) ? '<span class="badge warn">報告なし</span>' : ''}</td>
          <td>${r.cert_url ? `<a href="${esc(r.cert_url)}" target="_blank" rel="noopener">開く</a>` : ''}</td>
          <td><span class="badge ${r.source === 'punch' ? 'ok' : 'warn'}">${r.source === 'punch' ? '打刻' : '手入力'}</span></td>
        </tr>`).join('')}</tbody></table></div>
        <p class="muted" style="margin-top:12px;">
          「手入力」は打刻ではなく本人が時刻を書いたものです。打刻し忘れのほか、
          あとから書き換えた可能性もあるので、続くようなら確認してください。</p>`
      : '<div class="empty-state">この月の遅刻・早退はありません</div>'}`;
  } catch (e) { v.innerHTML = `<div class="card"><p class="muted">${esc(e.message)}</p></div>`; }
}

function placeCell(r) {
  const one = (p, dist) => {
    if (!p) return '';
    const cls = p === '事業所' ? 'ok' : p === '訪問先' ? '' : 'warn';
    return `<span class="badge ${cls}">${esc(p)}${dist ? ' ' + dist + 'm' : ''}</span>`;
  };
  return [one(r.in_place, r.in_dist), one(r.out_place, r.out_dist)].filter(Boolean).join(' ');
}

/* ============================ 事業所・打刻設定 ============================ */

const PUNCH_MODES = [
  ['onsite', '事業所勤務（放課後デイなど）', '事業所に着かないと出勤の打刻ができません。前もって打刻するのを防げます。'],
  ['field', '直行直帰（訪問看護・訪問マッサージ・保育所等訪問）', 'どこからでも打刻できます。事業所の外は「訪問先」として記録し、異常としては扱いません。'],
  ['free', '制限なし', 'どこからでも打刻でき、場所は記録だけします。']
];

async function renderOffices() {
  const v = $('v-offices');
  if (A.me.role !== 'admin') { v.innerHTML = '<div class="empty-state">管理者のみ</div>'; return; }
  v.innerHTML = '<div class="loading">読み込み中…</div>';
  try {
    const d = await API.call('admin.offices');
    v.innerHTML = `
      <p class="muted">
        打刻の判定に使う設定です。位置は打刻したその瞬間だけ記録し、ふだんの居場所は追いません。
      </p>
      ${d.offices.length ? `<div class="table-wrap" style="margin-bottom:16px;"><table class="grid">
        <thead><tr><th>事業所</th><th>法人</th><th>勤務形態</th><th>所定</th>
          <th class="num">半径</th><th>位置</th><th>位置必須</th><th></th></tr></thead>
        <tbody>${d.offices.map(o => `<tr>
          <td>${esc(o.name)}</td><td>${esc(o.company)}</td>
          <td>${esc((PUNCH_MODES.find(m => m[0] === (o.punch_mode || 'free')) || [])[1] || '')}</td>
          <td>${o.shift_start ? esc(o.shift_start) + '〜' + esc(o.shift_end) : '<span class="muted">未設定</span>'}</td>
          <td class="num">${esc(o.radius_m || '')}m</td>
          <td>${o.lat ? '<span class="badge ok">登録ずみ</span>' : '<span class="badge warn">未登録</span>'}</td>
          <td>${o.require_location === 'yes' ? '必須' : '—'}</td>
          <td><button class="btn sm" data-edit="${esc(o.name)}">編集</button></td>
        </tr>`).join('')}</tbody></table></div>` : ''}

      ${d.unregistered.length ? `<div class="card">
        <h2>まだ設定していない事業所</h2>
        <p class="muted">
          <b>設定は、必要な事業所だけで構いません。</b>
          設定がなくても、その所属の方はふつうに打刻でき、アプリの機能も全部使えます。
          設定すると、遅刻・早退の判定と、打刻の場所の確認ができるようになります。
        </p>
        <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:12px;">
          ${d.unregistered.map(o => `<label style="display:flex; align-items:center; gap:6px;">
            <input type="checkbox" class="ofc" value="${esc(o.name)}" style="width:auto;" checked>
            ${esc(o.name)}</label>`).join('')}
        </div>
        <div class="btn-row">
          <button class="btn" id="ofBulk">選んだ事業所にまとめて設定する</button>
          ${d.unregistered.map(o => '').join('')}
        </div>
        <p class="muted" style="margin-top:8px;">
          個別に決めたい事業所は、下の一覧から1つずつ設定できます。</p>
        </div>` : ''}

      <button class="btn primary" id="newOffice">事業所を追加する</button>`;

    v.querySelectorAll('[data-edit]').forEach(b => b.onclick = () =>
      openOfficeForm(d.offices.find(o => o.name === b.dataset.edit)));
    if ($('ofBulk')) $('ofBulk').onclick = () => {
      const names = [...v.querySelectorAll('.ofc:checked')].map(x => x.value);
      if (!names.length) return toast('事業所を選んでください', 'err');
      openBulkOfficeForm(names);
    };
    $('newOffice').onclick = () => openOfficeForm({});
  } catch (e) { v.innerHTML = `<div class="card"><p class="muted">${esc(e.message)}</p></div>`; }
}

function openOfficeForm(o) {
  o = o || {};
  openSheet(`
    <div class="sheet-title"><h2>${o.name ? esc(o.name) : '事業所の追加'}</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <div class="cols">
      <label class="field"><span>事業所名（カオナビの所属名と同じにしてください）</span>
        <input type="text" id="oName" value="${esc(o.name || '')}"></label>
      <label class="field"><span>法人</span>
        <input type="text" id="oCompany" value="${esc(o.company || '')}"></label>
    </div>

    <label class="field"><span>勤務形態</span>
      <select id="oMode">${PUNCH_MODES.map(m =>
        `<option value="${m[0]}" ${(o.punch_mode || 'free') === m[0] ? 'selected' : ''}>${m[1]}</option>`).join('')}
      </select></label>
    <p class="muted" id="oModeHelp" style="margin-top:-6px;"></p>

    <div class="cols">
      <label class="field"><span>所定の始業</span>
        <input type="time" id="oStart" value="${esc(o.shift_start || '')}"></label>
      <label class="field"><span>所定の終業</span>
        <input type="time" id="oEnd" value="${esc(o.shift_end || '')}"></label>
      <label class="field"><span>休憩（分）</span>
        <input type="number" id="oBreak" value="${esc(o.break_min || '60')}"></label>
    </div>
    <p class="muted" style="margin-top:-6px;">
      ここが空だと、この事業所の人は遅刻・早退の判定をしません。
      シフトの人だけ社員ごとに別の時刻を登録できます。</p>

    <div class="cols">
      <label class="field"><span>緯度</span>
        <input type="text" id="oLat" value="${esc(o.lat || '')}" placeholder="35.9412"></label>
      <label class="field"><span>経度</span>
        <input type="text" id="oLng" value="${esc(o.lng || '')}" placeholder="139.6203"></label>
      <label class="field"><span>この距離まで（m）</span>
        <input type="number" id="oRadius" value="${esc(o.radius_m || '150')}"></label>
    </div>
    <label class="field"><span>住所から探す</span>
      <div style="display:flex; gap:8px;">
        <input type="text" id="oAddr" placeholder="さいたま市北区宮原町3-432-2"
               style="flex:1;" autocomplete="off">
        <button class="btn" id="oGeo" style="white-space:nowrap;">探す</button>
      </div></label>
    <p class="muted" id="oGeoOut" style="margin-top:-6px;"></p>

    <div class="btn-row" style="margin-bottom:12px;">
      <button class="btn sm" id="oHere">いまいる場所を使う</button>
      <span class="muted" id="oHereOut" style="align-self:center;"></span>
    </div>
    <p class="muted" style="margin-top:-6px;">
      住所で探すのがいちばん早いです（国土地理院の検索を使っています）。
      建物名まで入れると見つからないことがあるので、番地までで試してください。
      事業所にいるときは「いまいる場所を使う」が確実です。
      Googleマップで右クリックして出る数字を、そのまま貼っても構いません。<br>
      スマホのGPSは数十メートルずれることがあるので、放課後デイでも100〜150m程度に
      しておくと「着いているのに打刻できない」を防げます。
    </p>

    <label style="display:flex; align-items:center; gap:8px; margin:12px 0;">
      <input type="checkbox" id="oReq" style="width:auto;" ${o.require_location === 'yes' ? 'checked' : ''}>
      位置情報がオフだと打刻できないようにする</label>

    ${o.name ? `<div class="card" style="margin-top:14px;">
      <h3 style="margin-bottom:6px;">打刻用のQRコード</h3>
      <p class="muted">事業所に貼っておくと、社員はこれを読み取って打刻できます。
        読み取ったときの場所も確かめるので、写真に撮って持ち帰っても使えません。</p>
      <div class="btn-row" style="margin-top:10px;">
        <button class="btn" id="oQr">${o.qr_token ? 'QRを表示・印刷' : 'QRコードを作る'}</button>
        ${o.qr_token ? '<button class="btn ghost" id="oQrNew">作り直す</button>' : ''}
      </div>
      ${o.qr_token ? '<p class="muted" style="margin-top:8px;">作り直すと、いま貼ってあるQRは使えなくなります。</p>' : ''}
    </div>` : ''}

    <div class="btn-row" style="margin-top:14px;">
      ${o.name ? `<button class="btn danger" id="oDel">削除</button>` : ''}
      <button class="btn primary" id="oSave">保存</button>
    </div>`);

  $('oGeo').onclick = async () => {
    const q = $('oAddr').value.trim();
    if (!q) return toast('住所を入れてください', 'err');
    const out = $('oGeoOut');
    out.textContent = '探しています…';
    try {
      // 国土地理院の住所検索。鍵も申し込みも要らず、日本の住所に強い
      const r = await fetch('https://msearch.gsi.go.jp/address-search/AddressSearch?q='
        + encodeURIComponent(q));
      const list = await r.json();
      if (!list.length) {
        out.textContent = '見つかりませんでした。建物名を外して、番地までで試してみてください。';
        return;
      }
      const hit = list[0];
      const [lng, lat] = hit.geometry.coordinates;
      $('oLat').value = lat.toFixed(6);
      $('oLng').value = lng.toFixed(6);
      out.innerHTML = `${esc(hit.properties.title)} → ${lat.toFixed(6)}, ${lng.toFixed(6)}`
        + (list.length > 1 ? `<br>ほかに ${list.length - 1} 件見つかっています。`
                           + '違っていたら、番地まで詳しく入れ直してください。' : '');
    } catch (e) {
      out.textContent = '住所の検索につながりませんでした: ' + e.message;
    }
  };
  $('oAddr').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); $('oGeo').click(); } };

  if ($('oQr')) $('oQr').onclick = async () => {
    let token = o.qr_token;
    if (!token) {
      const r = await API.call('admin.office.qr', { name: o.name });
      token = r.token;
    }
    showOfficeQr(o.name, token);
  };
  if ($('oQrNew')) $('oQrNew').onclick = async () => {
    if (!confirm('新しいQRコードを作ります。いま貼ってあるQRは使えなくなります。よろしいですか？')) return;
    const r = await API.call('admin.office.qr', { name: o.name });
    showOfficeQr(o.name, r.token);
  };

  const help = () => {
    const m = PUNCH_MODES.find(x => x[0] === $('oMode').value);
    $('oModeHelp').textContent = m ? m[2] : '';
  };
  $('oMode').onchange = help; help();

  $('oHere').onclick = async () => {
    $('oHereOut').textContent = '取得中…';
    const pos = await getPosition();
    if (!pos) { $('oHereOut').textContent = '取得できませんでした'; return; }
    $('oLat').value = pos.lat; $('oLng').value = pos.lng;
    $('oHereOut').textContent = `おおよその誤差 ${pos.acc}m`;
  };
  $('oSave').onclick = async () => {
    try {
      await API.call('admin.office.save', {
        name: $('oName').value, company: $('oCompany').value,
        punch_mode: $('oMode').value,
        shift_start: $('oStart').value, shift_end: $('oEnd').value, break_min: $('oBreak').value,
        lat: $('oLat').value, lng: $('oLng').value, radius_m: $('oRadius').value,
        require_location: $('oReq').checked
      });
      closeSheet(); toast('保存しました'); renderOffices();
    } catch (e) { toast(e.message, 'err'); }
  };
  if ($('oDel')) $('oDel').onclick = async () => {
    if (!confirm(`${o.name} の打刻設定を削除しますか？`)) return;
    try { await API.call('admin.office.delete', { name: o.name }); closeSheet(); toast('削除しました'); renderOffices(); }
    catch (e) { toast(e.message, 'err'); }
  };
}

/* ============================ 有給の管理簿 ============================ */

async function renderLeaves() {
  const v = $('v-leaves');
  v.innerHTML = '<div class="loading">読み込み中…</div>';
  try {
    const d = await API.call('admin.leaves');
    setCount('cDuty', d.duty_alert);
    v.innerHTML = `
      <div class="kpis">
        <div class="kpi"><b>${d.rows.length}</b><span>対象者</span></div>
        <div class="kpi ${d.duty_alert ? 'alert' : ''}"><b>${d.duty_alert}</b><span>年5日が危ない人</span></div>
        <div class="kpi ${d.no_grant ? 'alert' : ''}"><b>${d.no_grant}</b><span>付与が未登録</span></div>
      </div>
      <div class="card-head">
        <h2>有給の管理簿</h2>
        <button class="btn sm" id="btnImport">事務方の管理簿から取り込む</button>
      </div>
      <div class="table-wrap"><table class="grid">
        <thead><tr><th>コード</th><th>氏名</th><th>法人</th><th>事業所</th><th>区分</th>
          <th class="num">付与</th><th class="num">取得</th><th class="num">申請中</th><th class="num">残</th>
          <th>年5日の義務</th><th></th></tr></thead>
        <tbody>${d.rows.map(r => `<tr>
          <td>${esc(r.code)}</td><td>${esc(r.name)}</td><td>${esc(r.company)}</td>
          <td>${esc(r.office)}</td><td>${esc(r.employment || '')}</td>
          <td class="num">${r.no_grant ? '<span class="badge warn">未登録</span>' : r.granted}</td>
          <td class="num">${r.used}</td><td class="num">${r.pending || ''}</td>
          <td class="num" style="font-weight:700;">${r.no_grant ? '—' : r.remain}</td>
          <td>${dutyCell(r.duty)}</td>
          <td><button class="btn sm" data-grant="${esc(r.code)}" data-name="${esc(r.name)}">付与を足す</button></td>
        </tr>`).join('')}</tbody></table></div>
      ${d.no_grant ? `<div class="card" style="border-color:var(--warn); margin-top:14px;">
        <b>付与がまだ入っていない方が ${d.no_grant}名 います</b>
        <p class="muted" style="margin:6px 0 0;">
          この方たちは残日数を「—」で表示しています（0日ではなく、分からない状態です）。
          社員のアプリにも「付与が未登録」と出ます。
          カオナビの有給シートに載っていない方なので、事務方の管理簿から取り込むか、
          右の「付与を足す」で1人ずつ入れてください。</p>
        <p class="muted" style="margin:8px 0 0;">${d.no_grant_names.map(esc).join('　／　')}</p>
      </div>` : ''}
      <p class="muted" style="margin-top:12px;">
        年10日以上付与された方は、基準日から1年のあいだに5日取得させる義務があります（労基法39条7項）。
        残り120日を切って未達の方を「危ない人」として数えています。<br>
        カオナビの有給シートには<b>付与日の項目がありません</b>。そのため
        「カオナビ連動 → 有給を引き継ぐ」で入るのは残日数だけで、年5日の義務は判定できません。
        判定まで行うには、付与日の入った事務方の管理簿を取り込んでください。
      </p>`;

    v.querySelectorAll('[data-grant]').forEach(b => b.onclick = () => openGrantForm(b.dataset.grant, b.dataset.name));
    $('btnImport').onclick = openLeaveImport;
  } catch (e) { v.innerHTML = `<div class="card"><p class="muted">${esc(e.message)}</p></div>`; }
}

function dutyCell(duty) {
  if (!duty) return '<span class="muted">付与が未登録</span>';
  if (!duty.target) return '<span class="muted">対象外（10日未満）</span>';
  if (duty.done) return `<span class="badge ok">達成 ${duty.taken}日</span>`;
  const urgent = duty.days_left <= 120;
  return `<span class="badge ${urgent ? 'warn' : ''}">あと${duty.need}日</span>
    <span class="muted"> ${fmtYmd(duty.to)}まで（残り${duty.days_left}日）</span>`;
}

function openGrantForm(code, name) {
  const today = new Date().toISOString().slice(0, 10);
  openSheet(`
    <div class="sheet-title"><h2>${esc(name)} さんの有給を付与</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <div class="cols">
      <label class="field"><span>基準日（付与日）</span>
        <input type="date" id="gDate" value="${today}"></label>
      <label class="field"><span>付与日数</span>
        <input type="number" id="gDays" step="0.5" value="10"></label>
      <label class="field"><span>時効（2年後の前日）</span>
        <input type="date" id="gExp"></label>
    </div>
    <label class="field"><span>メモ</span><input type="text" id="gNote"></label>
    <button class="btn primary block" id="gSave">登録する</button>`);

  const setExp = () => {
    const d = new Date($('gDate').value);
    if (isNaN(d)) return;
    d.setFullYear(d.getFullYear() + 2);
    d.setDate(d.getDate() - 1);
    $('gExp').value = d.toISOString().slice(0, 10);
  };
  $('gDate').onchange = setExp; setExp();
  $('gSave').onclick = async () => {
    try {
      await API.call('admin.leave.grant', {
        code, grant_date: $('gDate').value, days: $('gDays').value,
        expire_date: $('gExp').value, source: '管理画面', note: $('gNote').value });
      closeSheet(); toast('登録しました'); renderLeaves();
    } catch (e) { toast(e.message, 'err'); }
  };
}

/* ---- 年次有給休暇管理簿(.xls)からの取り込み ---- */

function openLeaveImport() {
  openSheet(`
    <div class="sheet-title"><h2>管理簿から有給を取り込む</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <p class="muted">
      事務方から届く「年次有給休暇管理簿」を、いったん下のコマンドで読み取り用のファイルに変えてから、
      ここで選んでください。氏名で社員を突き合わせます。
    </p>
    <pre style="background:var(--bg); padding:12px; border-radius:8px; overflow-x:auto;
         font-size:12px; margin-bottom:14px;">cd ~/butterfly-portal
python3 tools/parse_leave_sheet.py ~/Desktop/有給管理/*.xls -o leave_import.json</pre>
    <label class="field"><span>leave_import.json を選ぶ</span>
      <input type="file" id="impFile" accept="application/json,.json"></label>
    <div id="impOut"></div>`);

  $('impFile').onchange = async () => {
    const f = $('impFile').files[0];
    if (!f) return;
    let data;
    try { data = JSON.parse(await f.text()); }
    catch (e) { return toast('ファイルを読めませんでした', 'err'); }
    $('impOut').innerHTML = '<p class="muted">確認中…</p>';
    try {
      const r = await API.call('import.leave',
        { grants: data.grants, taken: data.taken, dry_run: true });
      $('impOut').innerHTML = `
        <div class="kpis">
          <div class="kpi"><b>${r.people}</b><span>取り込む人数</span></div>
          <div class="kpi"><b>${r.grants}</b><span>付与のデータ</span></div>
          <div class="kpi"><b>${r.taken_add}</b><span>取得日の記録</span></div>
          <div class="kpi ${r.unmatched.length ? 'alert' : ''}"><b>${r.unmatched.length}</b><span>結びつかない氏名</span></div>
        </div>
        ${r.unmatched.length ? `<p class="muted" style="color:var(--warn)">
          この方たちは社員マスタに見つかりませんでした（退職された方や、
          カオナビと表記が違う方かもしれません）：<br>${esc(r.unmatched.join('、'))}</p>` : ''}
        ${r.taken_skip ? `<p class="muted">すでに勤怠が入っている ${r.taken_skip}日分は、
          上書きせずそのままにします。</p>` : ''}
        <div class="table-wrap" style="margin:12px 0;"><table class="grid">
          <thead><tr><th>氏名</th><th>コード</th><th>付与日</th><th class="num">日数</th><th>内容</th></tr></thead>
          <tbody>${r.sample.map(x => `<tr><td>${esc(x.name)}</td><td>${esc(x.code)}</td>
            <td>${esc(x.grant_date)}</td><td class="num">${x.days}</td>
            <td>${esc(x.source)}</td></tr>`).join('')}</tbody></table></div>
        <p class="muted">上は先頭の数件です。よろしければ取り込みます。</p>
        <button class="btn primary block" id="impGo">この内容で取り込む</button>`;

      $('impGo').onclick = async () => {
        if (!confirm('有給のデータを取り込みます。よろしいですか？')) return;
        try {
          const rr = await API.call('import.leave',
            { grants: data.grants, taken: data.taken, dry_run: false });
          closeSheet();
          toast(`付与 ${rr.grants}件・取得 ${rr.taken}件 を取り込みました`);
          renderLeaves();
        } catch (e) { toast(e.message, 'err'); }
      };
    } catch (e) { $('impOut').innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
  };
}

/* ============================ 交通費 ============================ */

async function renderExpenses() {
  const v = $('v-exp');
  v.innerHTML = '<div class="loading">読み込み中…</div>';
  try {
    const d = await API.call('admin.expenses', { month: A.month });
    setCount('cExp', d.pending);
    v.innerHTML = `
      <div class="kpis">
        <div class="kpi"><b>${d.total.toLocaleString()}</b><span>${d.month} の合計(円)</span></div>
        <div class="kpi ${d.pending ? 'alert' : ''}"><b>${d.pending}</b><span>承認待ち</span></div>
        <div class="kpi ${d.missing ? 'alert' : ''}"><b>${d.missing}</b><span>まだ出ていない</span></div>
      </div>
      <div class="card-head">
        <h2>${d.month} の通勤交通費</h2>
        <div style="display:flex; gap:8px;">
          <button class="btn sm" id="exCsv">CSVをダウンロード</button>
          ${d.missing ? '<button class="btn sm" id="exRemind">出していない人にお願いする</button>' : ''}
          ${d.pending ? '<button class="btn sm primary" id="exAllOk">申請中をすべて承認</button>' : ''}
        </div>
      </div>
      <div class="table-wrap"><table class="grid">
        <thead><tr><th>コード</th><th>氏名</th><th>事業所</th><th>方法</th>
          <th class="num">金額</th><th>区間・経路</th><th>定期／距離</th><th>有効期間</th>
          <th>領収書</th><th>状態</th><th></th></tr></thead>
        <tbody>${d.rows.map(r => `<tr>
          <td>${esc(r.code)}</td>
          <td>${esc(r.name)}${r.has_login ? '' : ' <span class="badge">未登録</span>'}</td>
          <td>${esc(r.office)}</td>
          <td>${r.method ? '<span class="badge">' + esc(r.method) + '</span>' : ''}</td>
          <td class="num">${r.amount ? r.amount.toLocaleString() : ''}</td>
          <td>${esc(r.route || '')}</td>
          <td>${r.pass_months ? esc(r.pass_months) + 'か月'
            : r.distance_km ? '片道 ' + esc(r.distance_km) + 'km'
              + (r.tax_free ? '<br><span class="muted">非課税上限 ' + r.tax_free.toLocaleString() + '円</span>' : '')
            : ''}</td>
          <td>${r.valid_from ? esc(r.valid_from) + (r.valid_to ? '<br>〜 ' + esc(r.valid_to) : '') : ''}</td>
          <td>${r.receipt_url
            ? `<a href="${esc(r.receipt_url)}" target="_blank" rel="noopener">開く</a>`
            : (r.status !== '未提出' && r.method === '電車・バス'
               ? '<span class="badge warn">なし</span>' : '<span class="muted">—</span>')}</td>
          <td><span class="badge ${r.status === '承認' ? 'ok'
            : r.status === '未提出' ? 'warn' : r.status === '却下' ? 'warn' : ''}">${esc(r.status)}</span></td>
          <td style="white-space:nowrap;">${r.status === '申請中'
            ? `<button class="btn sm primary" data-exok="${esc(r.id)}">承認</button>
               <button class="btn sm danger" data-exng="${esc(r.id)}">却下</button>` : ''}</td>
        </tr>`).join('')}</tbody></table></div>
      <p class="muted" style="margin-top:12px;">
        電車・バスの方は定期券の領収書が必要です。車・バイクの方は片道の距離で、
        領収書はいりません。「まだ出ていない」の方には上のボタンからまとめてお願いできます。<br>
        「非課税上限」は所得税がかからない上限の目安です。実際にいくら出すかは会社の規定によります。</p>`;

    $('exCsv').onclick = async () => {
      try {
        const r = await API.call('admin.expense.export', { month: A.month });
        const blob = new Blob(['\ufeff' + r.csv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `通勤交通費_${A.month}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      } catch (e) { toast(e.message, 'err'); }
    };
    if ($('exRemind')) $('exRemind').onclick = async () => {
      if (!confirm(`${A.month} の交通費をまだ出していない方に、お願いのメールを送ります。`)) return;
      try {
        const r = await API.call('admin.expense.remind', { month: A.month });
        toast(`${r.sent}名に送りました`);
      } catch (e) { toast(e.message, 'err'); }
    };
    if ($('exAllOk')) $('exAllOk').onclick = async () => {
      if (!confirm(`${A.month} の申請中をすべて承認します。よろしいですか？`)) return;
      try {
        await API.call('admin.expense.decide', { month: A.month, decision: '承認' });
        toast('承認しました'); renderExpenses();
      } catch (e) { toast(e.message, 'err'); }
    };
    v.querySelectorAll('[data-exok]').forEach(b => b.onclick = async () => {
      try { await API.call('admin.expense.decide', { id: b.dataset.exok, decision: '承認' });
            toast('承認しました'); renderExpenses(); }
      catch (e) { toast(e.message, 'err'); }
    });
    v.querySelectorAll('[data-exng]').forEach(b => b.onclick = async () => {
      const comment = prompt('却下の理由（本人に通知されます）') || '';
      if (!comment) return;
      try { await API.call('admin.expense.decide', { id: b.dataset.exng, decision: '却下', comment });
            toast('却下しました'); renderExpenses(); }
      catch (e) { toast(e.message, 'err'); }
    });
  } catch (e) { v.innerHTML = `<div class="card"><p class="muted">${esc(e.message)}</p></div>`; }
}

/* ============================ 打刻の申告 ============================ */

async function renderCorrections() {
  const v = $('v-corr');
  v.innerHTML = '<div class="loading">読み込み中…</div>';
  try {
    const d = await API.call('admin.corrections');
    setCount('cCorr', d.requests.length);
    v.innerHTML = `
      <p class="muted">
        社員は勤怠を自分では直せません。打刻を忘れた日、時刻が違う日、欠勤した日は、
        ここに申告が上がってきます。内容を確かめて承認すると、はじめて勤怠に入ります。
      </p>
      ${d.requests.length ? `<div class="table-wrap"><table class="grid">
        <thead><tr><th>申告日時</th><th>氏名</th><th>事業所</th><th>対象日</th><th>種類</th>
          <th>いまの記録</th><th>申告された内容</th><th>理由</th><th></th></tr></thead>
        <tbody>${d.requests.map(r => `<tr>
          <td>${fmtDateTime(r.created_at)}</td><td>${esc(r.name)}</td><td>${esc(r.office)}</td>
          <td>${fmtDate(r.date)}</td>
          <td><span class="badge ${r.kind === '欠勤' ? 'warn' : ''}">${esc(r.kind)}</span></td>
          <td>${r.current_kind
            ? `${esc(r.current_kind)} ${esc(r.current_start || '')}〜${esc(r.current_end || '')}
               ${r.punched ? '<span class="badge ok">打刻</span>' : ''}`
            : '<span class="muted">なし</span>'}</td>
          <td>${r.start ? `<b>${esc(r.start)} 〜 ${esc(r.end || '—')}</b>
            ${r.break_min ? `<br><span class="muted">休憩 ${esc(r.break_min)}分</span>` : ''}`
            : `<span class="muted">${esc(r.kind)}として記録します</span>`}</td>
          <td>${esc(r.reason_type)}<br><span class="muted">${esc(r.reason || '')}</span></td>
          <td style="white-space:nowrap;">
            <button class="btn sm primary" data-cok="${esc(r.id)}"
              data-start="${esc(r.start)}" data-end="${esc(r.end || '')}"
              data-break="${esc(r.break_min || '')}" data-kind="${esc(r.kind)}">承認</button>
            <button class="btn sm danger" data-cng="${esc(r.id)}">却下</button></td>
        </tr>`).join('')}</tbody></table></div>
        <p class="muted" style="margin-top:12px;">
          承認するときに時刻を直せます。申告された時刻をそのまま使う場合は、そのままOKしてください。</p>`
      : '<div class="empty-state">確認待ちの申告はありません</div>'}`;

    v.querySelectorAll('[data-cok]').forEach(b => b.onclick = async () => {
      const payload = { id: b.dataset.cok, decision: '承認' };
      // 出勤の申告だけ、承認するときに時刻を直せる
      if (b.dataset.start) {
        const start = prompt('出勤の時刻（HH:MM）', b.dataset.start);
        if (start === null) return;
        const end = prompt('退勤の時刻（HH:MM・無ければ空欄）', b.dataset.end);
        if (end === null) return;
        payload.start = start;
        payload.end = end;
        payload.break_min = b.dataset.break;
      } else if (!confirm(`${b.dataset.kind}として勤怠に入れます。よろしいですか？`)) {
        return;
      }
      try {
        await API.call('admin.correction.decide', payload);
        toast('承認して勤怠に入れました'); renderCorrections();
      } catch (e) { toast(e.message, 'err'); }
    });
    v.querySelectorAll('[data-cng]').forEach(b => b.onclick = async () => {
      const comment = prompt('却下の理由（本人に通知されます）') || '';
      if (!comment) return;
      try {
        await API.call('admin.correction.decide', { id: b.dataset.cng, decision: '却下', comment });
        toast('却下しました'); renderCorrections();
      } catch (e) { toast(e.message, 'err'); }
    });
  } catch (e) { v.innerHTML = `<div class="card"><p class="muted">${esc(e.message)}</p></div>`; }
}

/* ============================ 届出・証明書 ============================ */

let APPLY_SHOW_DONE = false;

async function renderApplications() {
  const v = $('v-apply');
  v.innerHTML = '<div class="loading">読み込み中…</div>';
  try {
    const d = await API.call('admin.applications', { include_done: APPLY_SHOW_DONE });
    setCount('cApply', d.pending);
    v.innerHTML = `
      <div class="card-head">
        <h2>届出・証明書の申請</h2>
        <button class="btn sm" id="apToggle">${APPLY_SHOW_DONE ? '未対応だけ表示' : '完了した分も表示'}</button>
      </div>
      ${d.applications.length ? `<div class="table-wrap"><table class="grid">
        <thead><tr><th>受付</th><th>氏名</th><th>事業所</th><th>種類</th><th>内容</th>
          <th>添付</th><th>状態</th><th></th></tr></thead>
        <tbody>${d.applications.map(a => `<tr>
          <td>${fmtDateTime(a.created_at)}</td><td>${esc(a.name)}</td><td>${esc(a.office)}</td>
          <td>${esc(a.type)}</td>
          <td>${Object.keys(a.body).map(k =>
            `<span class="muted">${esc(k)}:</span> ${esc(a.body[k])}`).join('<br>')}</td>
          <td>${a.file_url ? `<a href="${esc(a.file_url)}" target="_blank" rel="noopener">開く</a>` : ''}</td>
          <td><span class="badge ${a.status === '完了' ? 'ok' : a.status === '対応中' ? 'warn' : ''}">${esc(a.status)}</span>
            ${a.reply_url ? '<br><span class="badge ok">書類を返却ずみ</span>' : ''}</td>
          <td><button class="btn sm" data-ap="${esc(a.id)}">対応する</button></td>
        </tr>`).join('')}</tbody></table></div>`
      : '<div class="empty-state">申請はありません</div>'}`;

    $('apToggle').onclick = () => { APPLY_SHOW_DONE = !APPLY_SHOW_DONE; renderApplications(); };
    v.querySelectorAll('[data-ap]').forEach(b => b.onclick = () => {
      const a = d.applications.find(x => x.id === b.dataset.ap);
      openSheet(`
        <div class="sheet-title">
          <div><h2>${esc(a.type)}</h2>
            <div class="muted">${esc(a.name)}（${esc(a.office)}）・${fmtDateTime(a.created_at)}</div></div>
          <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
        <div class="table-wrap" style="margin-bottom:14px;"><table class="grid">
          <tbody>${Object.keys(a.body).map(k =>
            `<tr><th style="width:38%">${esc(k)}</th><td>${esc(a.body[k])}</td></tr>`).join('')}
          </tbody></table></div>
        ${a.file_url ? `<a class="btn block" style="margin-bottom:12px;"
           href="${esc(a.file_url)}" target="_blank" rel="noopener">本人が送った添付を開く</a>` : ''}
        <label class="field"><span>状態</span>
          <select id="apStatus">${['受付', '対応中', '完了'].map(x =>
            `<option ${a.status === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label class="field"><span>本人へのメッセージ（通知されます）</span>
          <textarea id="apComment" style="min-height:70px;">${esc(a.comment || '')}</textarea></label>
        <label class="field"><span>できあがった書類を返す（PDFか写真）</span>
          <input type="file" id="apReply" accept="image/*,application/pdf"></label>
        <button class="btn primary block" id="apSave">保存して知らせる</button>`);

      $('apSave').onclick = async () => {
        const btn = $('apSave'); btn.disabled = true; btn.textContent = '送信中…';
        try {
          const f = $('apReply').files[0];
          await API.call('admin.apply.update', {
            id: a.id, status: $('apStatus').value, comment: $('apComment').value,
            file: f ? await shrinkImage(f) : null });
          closeSheet(); toast('更新しました'); renderApplications();
        } catch (e) { toast(e.message, 'err'); btn.disabled = false; btn.textContent = '保存して知らせる'; }
      };
    });
  } catch (e) { v.innerHTML = `<div class="card"><p class="muted">${esc(e.message)}</p></div>`; }
}

/** 複数の事業所に同じ設定をあてる */
function openBulkOfficeForm(names) {
  openSheet(`
    <div class="sheet-title"><h2>まとめて設定</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <p class="muted">${names.length}か所：${esc(names.join('、'))}</p>
    <label class="field"><span>勤務形態</span>
      <select id="bMode">${PUNCH_MODES.map(m => `<option value="${m[0]}">${m[1]}</option>`).join('')}</select></label>
    <p class="muted" id="bModeHelp" style="margin-top:-6px;"></p>
    <div class="cols">
      <label class="field"><span>所定の始業</span><input type="time" id="bStart"></label>
      <label class="field"><span>所定の終業</span><input type="time" id="bEnd"></label>
      <label class="field"><span>休憩（分）</span><input type="number" id="bBreak" value="60"></label>
    </div>
    <p class="muted" style="margin-top:-6px;">
      時刻を空のままにすると、その事業所では遅刻・早退の判定をしません。
      あとから事業所ごとに、社員ごとに変えられます。</p>
    <label class="field"><span>この距離まで（m）</span>
      <input type="number" id="bRadius" value="150"></label>
    <p class="muted" style="margin-top:-6px;">
      場所は事業所ごとに違うので、ここでは設定しません。あとで各事業所から
      「いまいる場所を使う」で登録してください。</p>
    <button class="btn primary block" id="bSave">まとめて設定する</button>`);

  const help = () => {
    const m = PUNCH_MODES.find(x => x[0] === $('bMode').value);
    $('bModeHelp').textContent = m ? m[2] : '';
  };
  $('bMode').onchange = help; help();
  $('bSave').onclick = async () => {
    try {
      await API.call('admin.office.bulk', {
        names, punch_mode: $('bMode').value,
        shift_start: $('bStart').value, shift_end: $('bEnd').value,
        break_min: $('bBreak').value, radius_m: $('bRadius').value });
      closeSheet(); toast(`${names.length}か所を設定しました`); renderOffices();
    } catch (e) { toast(e.message, 'err'); }
  };
}


/** ファイル名から社員を推測する */


/* ---- 月初のやることリスト ---- */

async function renderMonthlySteps() {
  const box = $('monthlyBox');
  if (!box) return;
  try {
    const d = await API.call('admin.monthly', { month: A.month });
    const rest = d.steps.filter(s => !s.done && !s.optional).length;
    box.innerHTML = `
      <div class="card" style="margin-bottom:18px;">
        <div class="card-head">
          <h2>${d.month} にやること</h2>
          <span class="badge ${rest ? 'warn' : 'ok'}">${d.done} / ${d.total} 済み</span>
        </div>
        <div class="steps">
          ${d.steps.map(s => `
            <div class="step ${s.done ? 'done' : ''} ${s.optional ? 'optional' : ''}"
                 data-tab="${esc(s.tab || '')}">
              <span class="mark">${s.done ? '✓' : ''}</span>
              <div class="grow">
                <div class="label">${esc(s.label)}
                  ${s.count ? `<span class="badge warn">${s.count}件</span>` : ''}</div>
                ${!s.done && s.hint ? `<div class="meta">${esc(s.hint)}</div>` : ''}
                ${!s.done && s.detail && s.detail.length
                  ? `<div class="meta">${esc(s.detail.slice(0, 8).join('、'))}${s.detail.length > 8 ? ' ほか' : ''}</div>`
                  : ''}
              </div>
              ${s.tab ? '<span class="muted">›</span>' : ''}
            </div>`).join('')}
        </div>
      </div>`;
    box.querySelectorAll('.step[data-tab]').forEach(el => {
      if (!el.dataset.tab) return;
      el.onclick = () => render(el.dataset.tab);
    });
  } catch (e) { box.innerHTML = ''; }
}

/* ============================ 運行記録 ============================ */

let DRIVE_TAB = 'logs';

async function renderDrives() {
  const v = $('v-drive');
  v.innerHTML = '<div class="loading">読み込み中…</div>';
  try {
    const [d, cars] = await Promise.all([
      API.call('admin.drives', { month: A.month }),
      API.call('admin.cars')
    ]);
    const sub = (k, label) =>
      `<button class="btn sm ${DRIVE_TAB === k ? 'primary' : ''}" data-sub="${k}">${label}</button>`;

    v.innerHTML = `
      <div class="btn-row" style="margin-bottom:16px; justify-content:flex-start;">
        ${sub('logs', '運行の記録')}${sub('cars', '車の登録')}${sub('contacts', '緊急連絡先')}
      </div>
      <div id="driveBody"></div>`;

    v.querySelectorAll('[data-sub]').forEach(b => b.onclick = () => {
      DRIVE_TAB = b.dataset.sub; renderDrives();
    });

    const body = $('driveBody');
    if (DRIVE_TAB === 'logs') {
      body.innerHTML = `
        <div class="kpis">
          <div class="kpi"><b>${d.rows.length}</b><span>${d.month} の運行</span></div>
          <div class="kpi"><b>${d.total_distance.toLocaleString()}</b><span>走行距離(km)</span></div>
          <div class="kpi ${d.unfinished ? 'alert' : ''}"><b>${d.unfinished}</b><span>帰着の記録なし</span></div>
          <div class="kpi ${d.inspection_ng ? 'alert' : ''}"><b>${d.inspection_ng}</b><span>点検で気になるところ</span></div>
        </div>
        <div class="card-head">
          <h2>${d.month} の運行記録</h2>
          <button class="btn sm" id="dvCsv">CSVをダウンロード</button>
        </div>
        ${d.by_car.length ? `<p class="muted">車ごとの走行距離：${
          d.by_car.map(x => `${esc(x.car)} ${x.distance}km`).join('／')}</p>` : ''}
        ${d.rows.length ? `<div class="table-wrap"><table class="grid">
          <thead><tr><th>日付</th><th>車</th><th>ナンバー</th><th>運転者</th>
            <th>出発</th><th>帰着</th><th class="num">距離</th>
            <th>出発前点検</th><th>給油</th><th>備考</th></tr></thead>
          <tbody>${d.rows.map(r => `<tr>
            <td>${esc(r.date.slice(5))}</td><td>${esc(r.car_name)}</td>
            <td>${esc(r.plate4 || '')}</td><td>${esc(r.name)}</td>
            <td>${esc(String(r.start_at).substring(11, 16))}<br>
              <span class="muted">${esc(r.start_odo)}km</span></td>
            <td>${r.end_at ? esc(String(r.end_at).substring(11, 16)) + '<br><span class="muted">' + esc(r.end_odo) + 'km</span>'
              : '<span class="badge warn">記録なし</span>'}</td>
            <td class="num">${r.distance || ''}</td>
            <td>${r.inspection_ng
              ? `<span class="badge warn">気になるところ</span><br>
                 <span class="muted">${esc(String(r.inspection_ng).split('｜').join('、'))}</span>
                 ${r.inspection_note ? '<br>' + esc(r.inspection_note) : ''}`
              : '<span class="badge ok">異常なし</span>'}</td>
            <td>${r.fuel_yen ? Number(r.fuel_yen).toLocaleString() + '円' : ''}
              ${r.fuel_liter ? '<br><span class="muted">' + esc(r.fuel_liter) + 'L</span>' : ''}</td>
            <td>${esc(r.note || '')}</td>
          </tr>`).join('')}</tbody></table></div>
          <p class="muted" style="margin-top:12px;">
            出発前の点検で「気になるところ」があった運行は、その場で総務にも知らせが届きます。
            月ごとにCSVを出して保管しておいてください。</p>`
        : '<div class="empty-state">この月の運行記録はありません</div>'}`;

      if ($('dvCsv')) $('dvCsv').onclick = async () => {
        try {
          const r = await API.call('admin.drives.export', { month: A.month });
          const blob = new Blob(['\ufeff' + r.csv], { type: 'text/csv;charset=utf-8' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `運行記録_${A.month}.csv`;
          a.click();
          URL.revokeObjectURL(a.href);
        } catch (e) { toast(e.message, 'err'); }
      };
    }

    if (DRIVE_TAB === 'cars') {
      body.innerHTML = `
        <div class="card-head"><h2>車の登録</h2>
          <button class="btn sm" id="carImport">管理簿から取り込む</button>
          <button class="btn sm primary" id="carNew">車を追加する</button></div>
        ${cars.cars.length ? `<div class="table-wrap"><table class="grid">
          <thead><tr><th>名前</th><th>ナンバー</th><th>車種</th><th>事業所</th>
            <th class="num">定員</th><th>車検</th><th>保険</th><th class="num">走行</th><th></th></tr></thead>
          <tbody>${cars.cars.map(c => `<tr>
            <td>${esc(c.name)}${c.active === 'no' ? ' <span class="badge">使わない</span>' : ''}</td>
            <td>${esc(c.plate || '')}${c.plate4 ? `<br><span class="badge">${esc(c.plate4)}</span>` : ''}</td>
            <td>${esc(c.model || '')}</td><td>${esc(c.office || '')}</td>
            <td class="num">${esc(c.capacity || '')}</td>
            <td>${dueCell(c.inspection_due, c.inspection_state)}</td>
            <td>${dueCell(c.insurance_due, c.insurance_state)}</td>
            <td class="num">${c.odo ? Number(c.odo).toLocaleString() : ''}</td>
            <td><button class="btn sm" data-car="${esc(c.id)}">編集</button></td>
          </tr>`).join('')}</tbody></table></div>`
        : '<div class="empty-state">まだ登録がありません</div>'}`;
      $('carNew').onclick = () => openCarForm({});
      $('carImport').onclick = openCarImport;
      body.querySelectorAll('[data-car]').forEach(b => b.onclick = () =>
        openCarForm(cars.cars.find(c => c.id === b.dataset.car)));
    }

    if (DRIVE_TAB === 'contacts') {
      const ct = await API.call('admin.contacts');
      body.innerHTML = `
        <div class="cols">
          <div class="card">
            <div class="card-head"><h2>事故のときの連絡先</h2>
              <button class="btn sm primary" id="ctNew">追加</button></div>
            <p class="muted">社員の画面に、この順番で大きく出ます。上から順にかけてもらう想定です。</p>
            ${ct.contacts.length ? `<div class="list">${ct.contacts.map(c => `
              <div class="item" style="cursor:default;">
                <div class="grow">
                  <div class="title">${esc(c.label)}${c.name ? '　' + esc(c.name) : ''}</div>
                  <div class="meta">${esc(c.phone)}${c.company ? '　（' + esc(c.company) + 'のみ）' : ''}
                    ${c.note ? '<br>' + esc(c.note) : ''}</div>
                </div>
                <button class="btn sm" data-ct="${esc(c.id)}">編集</button>
              </div>`).join('')}</div>`
            : '<div class="empty-state">まだ登録がありません</div>'}
          </div>
          <div class="card">
            <h2>補足の案内</h2>
            <p class="muted">手順の下に出す文章です。社内の決まりごとがあれば書いてください。</p>
            <textarea id="ctNote" style="min-height:140px;">${esc(ct.note || '')}</textarea>
            <button class="btn primary block" id="ctNoteSave" style="margin-top:10px;">保存する</button>
          </div>
        </div>`;
      $('ctNew').onclick = () => openContactForm({});
      body.querySelectorAll('[data-ct]').forEach(b => b.onclick = () =>
        openContactForm(ct.contacts.find(c => c.id === b.dataset.ct)));
      $('ctNoteSave').onclick = async () => {
        try {
          await API.call('admin.setting.save', { key: 'incident_note', value: $('ctNote').value });
          toast('保存しました');
        } catch (e) { toast(e.message, 'err'); }
      };
    }
  } catch (e) { v.innerHTML = `<div class="card"><p class="muted">${esc(e.message)}</p></div>`; }
}


/* ============================ 貸与品 ============================ */

let ASSET_FILTER = '';

async function renderAssets() {
  const v = $('v-assets');
  v.innerHTML = '<div class="loading">読み込み中…</div>';
  try {
    const d = await API.call('admin.assets');
    A.assetData = d;
    setCount('cAsset', d.retired + d.unconfirmed);

    const kinds = [...new Set(d.assets.map(a => a.kind))];
    const shown = ASSET_FILTER ? d.assets.filter(a => a.kind === ASSET_FILTER) : d.assets;

    v.innerHTML = `
      <div class="kpis">
        <div class="kpi"><b>${d.assets.length}</b><span>台帳の数</span></div>
        <div class="kpi"><b>${d.lent}</b><span>貸し出し中</span></div>
        <div class="kpi"><b>${d.free}</b><span>手元にある</span></div>
        <div class="kpi ${d.unconfirmed ? 'alert' : ''}"><b>${d.unconfirmed}</b><span>受け取り確認まち</span></div>
        <div class="kpi ${d.retired ? 'alert' : ''}"><b>${d.retired}</b><span>退職者が未返却</span></div>
      </div>

      ${d.retired ? `<div class="card" style="border-color:var(--warn);">
        <b>退職された方が持ったままのものが ${d.retired}件 あります</b>
        <p class="muted" style="margin:6px 0 0;">
          返却の記録が入っていません。回収できていれば「返してもらう」を押してください。</p>
        <div class="list" style="margin-top:10px;">${d.assets.filter(a => a.retired_holder).map(a => `
          <div class="item" style="cursor:default;">
            <div class="grow"><div class="title">${esc(a.kind)}　${esc(a.name)}</div>
              <div class="meta">${esc(a.lent_to)}　お渡し ${esc(a.lent_on)}</div></div>
            <button class="btn sm" data-asret="${esc(a.loan_id)}">返してもらう</button>
          </div>`).join('')}</div>
      </div>` : ''}

      <div class="card-head">
        <h2>貸与品の台帳</h2>
        <div class="btn-row" style="margin:0;">
          <button class="btn sm" id="asImport">台帳から取り込む</button>
          <button class="btn sm" id="asByPerson">人ごとに見る</button>
          <button class="btn sm primary" id="asNew">＋ 品物を足す</button>
        </div>
      </div>

      <div class="chip-row" style="margin-bottom:12px;">
        <button class="chip ${ASSET_FILTER ? '' : 'on'}" data-ak="">すべて（${d.assets.length}）</button>
        ${kinds.map(k => `<button class="chip ${ASSET_FILTER === k ? 'on' : ''}" data-ak="${esc(k)}">
          ${esc(k)}（${d.assets.filter(a => a.kind === k).length}）</button>`).join('')}
      </div>

      ${shown.length ? `<div class="table-wrap"><table class="grid">
        <thead><tr><th>種類</th><th>品名</th><th>メーカー</th><th>管理番号</th>
          <th>事業所</th><th>いま持っている人</th><th>お渡し日</th><th>確認</th><th></th></tr></thead>
        <tbody>${shown.map(a => `<tr>
          <td>${esc(a.kind)}</td>
          <td>${esc(a.name)}</td>
          <td>${esc(a.maker || '')}</td>
          <td>${esc(a.serial || '')}</td>
          <td>${esc(a.office || '')}</td>
          <td>${a.lent_to
            ? esc(a.lent_to) + (a.retired_holder ? ' <span class="badge warn">退職</span>' : '')
            : '<span class="muted">手元にあります</span>'}</td>
          <td>${esc(a.lent_on || '')}</td>
          <td>${!a.lent_to ? '' : a.confirmed
            ? '<span class="badge ok">ずみ</span>'
            : '<span class="badge warn">まち</span>'}</td>
          <td class="btn-row" style="margin:0;">
            ${a.lent_to
              ? `<button class="btn sm" data-asret="${esc(a.loan_id)}">返してもらう</button>`
              : `<button class="btn sm primary" data-aslend="${esc(a.id)}">渡す</button>`}
            <button class="btn sm ghost" data-asedit="${esc(a.id)}">編集</button>
          </td>
        </tr>`).join('')}</tbody></table></div>`
      : '<div class="empty-state">まだ登録がありません</div>'}

      <p class="muted" style="margin-top:12px;">
        鍵・パソコン・タブレット・車などを1つずつ登録し、誰に渡したかを記録します。
        渡すと本人のアプリに出て、受け取りの確認を押してもらえます。
        退職の手続きのときは「人ごとに見る」で、その方の未返却が一度に分かります。
      </p>`;

    v.querySelectorAll('[data-ak]').forEach(b => b.onclick = () => {
      ASSET_FILTER = b.dataset.ak; renderAssets();
    });
    $('asNew').onclick = () => openAssetForm({}, d);
    $('asByPerson').onclick = openAssetByPerson;
    $('asImport').onclick = openAssetImport;
    v.querySelectorAll('[data-asedit]').forEach(b => b.onclick = () =>
      openAssetForm(d.assets.find(a => a.id === b.dataset.asedit), d));
    v.querySelectorAll('[data-aslend]').forEach(b => b.onclick = () =>
      openLendForm(d.assets.find(a => a.id === b.dataset.aslend), d));
    v.querySelectorAll('[data-asret]').forEach(b => b.onclick = () =>
      openReturnForm(b.dataset.asret, d));
  } catch (e) { v.innerHTML = `<div class="card"><p class="muted">${esc(e.message)}</p></div>`; }
}

function openAssetForm(a, d) {
  a = a || {};
  openSheet(`
    <div class="sheet-title"><h2>${a.id ? '品物の情報' : '品物を足す'}</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <div class="cols">
      <label class="field"><span>種類</span>
        <select id="akKind">${d.kinds.map(k =>
          `<option ${a.kind === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></label>
      <label class="field"><span>品名</span>
        <input type="text" id="akName" value="${esc(a.name || '')}"
          placeholder="事務所 玄関の鍵（No.3） / ThinkPad E14 など"></label>
      <label class="field"><span>メーカー・型番</span>
        <input type="text" id="akMaker" value="${esc(a.maker || '')}"></label>
      <label class="field"><span>管理番号・製造番号</span>
        <input type="text" id="akSerial" value="${esc(a.serial || '')}"></label>
      <label class="field"><span>法人</span>
        <input type="text" id="akCompany" value="${esc(a.company || '')}"></label>
      <label class="field"><span>置いている事業所</span>
        <input type="text" id="akOffice" value="${esc(a.office || '')}"></label>
      <label class="field"><span>買った日</span>
        <input type="date" id="akBought" value="${esc(a.bought_on || '')}"></label>
    </div>
    <label class="field"><span>メモ</span>
      <input type="text" id="akNote" value="${esc(a.note || '')}"></label>
    <div class="btn-row" style="margin-top:8px;">
      ${a.id && !a.lent_to ? '<button class="btn danger" id="akRetire">台帳から下げる</button>' : ''}
      <button class="btn primary" id="akSave">保存</button>
    </div>
    ${a.lent_to ? `<p class="muted" style="margin-top:10px;">
      いま ${esc(a.lent_to)} に貸し出し中です。台帳から下げるには、先に返却を記録してください。</p>` : ''}`);

  $('akSave').onclick = async () => {
    try {
      await API.call('admin.asset.save', {
        id: a.id, kind: $('akKind').value, name: $('akName').value,
        maker: $('akMaker').value, serial: $('akSerial').value,
        company: $('akCompany').value, office: $('akOffice').value,
        bought_on: $('akBought').value, note: $('akNote').value });
      closeSheet(); toast('保存しました'); renderAssets();
    } catch (e) { toast(e.message, 'err'); }
  };
  if ($('akRetire')) $('akRetire').onclick = async () => {
    if (!confirm(`「${a.name}」を台帳から下げます。これまでの記録は残ります。`)) return;
    try {
      await API.call('admin.asset.retire', { id: a.id });
      closeSheet(); toast('下げました'); renderAssets();
    } catch (e) { toast(e.message, 'err'); }
  };
}

function openLendForm(a, d) {
  const today = new Date().toISOString().slice(0, 10);
  openSheet(`
    <div class="sheet-title"><h2>${esc(a.kind)}　${esc(a.name)} を渡す</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <label class="field"><span>渡す相手</span>
      <select id="alCode">
        <option value="">— 選んでください —</option>
        ${d.employees.map(e => `<option value="${esc(e.code)}">${esc(e.code)}　${esc(e.name)}（${esc(e.office || '')}）</option>`).join('')}
      </select></label>
    <label class="field"><span>お渡しした日</span>
      <input type="date" id="alDate" value="${today}"></label>
    <label class="field"><span>メモ（付属品・注意点など）</span>
      <input type="text" id="alNote" placeholder="電源アダプタ・ケース付き など"></label>
    <button class="btn primary block" id="alGo">渡した記録を残す</button>
    <p class="muted" style="margin-top:10px;">
      記録すると本人のアプリに出て、受け取りの確認を押してもらえます。
      メールでもお知らせが届きます。</p>`);

  $('alGo').onclick = async () => {
    if (!$('alCode').value) return toast('渡す相手を選んでください', 'err');
    const b = $('alGo'); b.disabled = true;
    try {
      await API.call('admin.asset.lend', {
        asset_id: a.id, code: $('alCode').value,
        lent_on: $('alDate').value, note: $('alNote').value });
      closeSheet(); toast('記録しました'); renderAssets();
    } catch (e) { toast(e.message, 'err'); b.disabled = false; }
  };
}

function openReturnForm(loanId, d) {
  const a = d.assets.find(x => x.loan_id === loanId) || {};
  const today = new Date().toISOString().slice(0, 10);
  openSheet(`
    <div class="sheet-title"><h2>返却の記録</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <p class="muted">${esc(a.kind || '')}　${esc(a.name || '')}
      ${a.lent_to ? '／ ' + esc(a.lent_to) : ''}</p>
    <label class="field"><span>返ってきた日</span>
      <input type="date" id="arDate" value="${today}"></label>
    <label class="field"><span>状態</span>
      <select id="arCond">${d.conditions.map(c => `<option>${esc(c)}</option>`).join('')}</select></label>
    <label class="field"><span>メモ</span>
      <input type="text" id="arNote"></label>
    <button class="btn primary block" id="arGo">返却として記録する</button>`);

  $('arGo').onclick = async () => {
    try {
      await API.call('admin.asset.return', {
        id: loanId, returned_on: $('arDate').value,
        condition: $('arCond').value, note: $('arNote').value });
      closeSheet(); toast('記録しました'); renderAssets();
    } catch (e) { toast(e.message, 'err'); }
  };
}

async function openAssetByPerson() {
  try {
    const d = await API.call('admin.asset.byPerson');
    openSheet(`
      <div class="sheet-title"><h2>誰が何を持っているか</h2>
        <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
      <p class="muted">返却がまだのものだけを、人ごとにまとめています。
        退職の手続きのときは、ここを見ながら回収してください。</p>
      ${d.rows.length ? d.rows.map(r => `
        <div class="card" style="margin-top:12px; ${r.status === '退職' ? 'border-color:var(--warn);' : ''}">
          <div class="card-head" style="margin-bottom:6px;">
            <h3 style="margin:0;">${esc(r.name)}
              ${r.status === '退職' ? '<span class="badge warn">退職</span>' : ''}</h3>
            <span class="muted">${esc(r.office || '')}</span>
          </div>
          <div class="list">${r.items.map(x => `
            <div class="item" style="cursor:default;">
              <div class="grow">
                <div class="title">${esc(x.kind)}　${esc(x.name)}</div>
                <div class="meta">${x.serial ? '番号 ' + esc(x.serial) + '　' : ''}お渡し ${esc(x.lent_on)}
                  ${x.confirmed ? '' : '　<span class="badge warn">本人の確認まち</span>'}</div>
              </div></div>`).join('')}</div>
        </div>`).join('')
      : '<div class="empty-state">貸し出し中のものはありません</div>'}`);
  } catch (e) { toast(e.message, 'err'); }
}

/** いま使っている貸与品台帳（xlsx→JSON）を読み込む */
function openAssetImport() {
  openSheet(`
    <div class="sheet-title"><h2>台帳から取り込む</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <p class="muted">いま総務でお使いの貸与品台帳を、そのまま取り込めます。
      先に次のコマンドでJSONを作ってください。</p>
    <div class="card" style="margin:12px 0;">
      <code style="word-break:break-all; font-size:12px;">
        python3 tools/export_assets.py ～/Desktop/貸与品管理/貸与品台帳_総務用_YYYY-MM-DD.xlsx
      </code>
      <p class="muted" style="margin:8px 0 0;">
        できた assets_import.json を下から選んでください。
        返却ずみの行は入りません。</p>
    </div>
    <input type="file" id="aiFile" accept="application/json,.json">
    <div id="aiPreview" style="margin-top:14px;"></div>`);

  $('aiFile').onchange = async () => {
    const f = $('aiFile').files[0];
    if (!f) return;
    const pv = $('aiPreview');
    pv.innerHTML = '<div class="loading">読んでいます…</div>';
    let data;
    try { data = JSON.parse(await f.text()); }
    catch (e) { pv.innerHTML = '<p class="muted">JSONとして読めませんでした</p>'; return; }
    const items = data.items || data;
    try {
      const r = await API.call('import.assets', { items, dry_run: true });
      pv.innerHTML = `
        <div class="kpis">
          <div class="kpi"><b>${r.add}</b><span>入るもの</span></div>
          <div class="kpi"><b>${r.skip}</b><span>すでにある</span></div>
          <div class="kpi ${r.no_employee ? 'alert' : ''}"><b>${r.no_employee}</b><span>名簿にない人</span></div>
        </div>
        <p class="muted">${esc(r.note)}</p>
        <p class="muted">${Object.entries(r.by_kind || {})
          .map(([k, v]) => `${esc(k)} ${v}`).join('　／　')}</p>
        ${r.missing && r.missing.length ? `<div class="card" style="border-color:var(--warn);">
          <b>名簿にない方の分は入りません</b>
          <p class="muted" style="margin:6px 0 0;">${r.missing.map(esc).join('<br>')}</p>
        </div>` : ''}
        ${r.skipped && r.skipped.length ? `<p class="muted" style="margin-top:10px;">
          すでに入っているもの：${r.skipped.map(esc).join('／')}</p>` : ''}
        <div class="table-wrap" style="margin-top:12px;"><table class="grid">
          <thead><tr><th>種類</th><th>品名</th><th>使う人</th><th>貸与日</th></tr></thead>
          <tbody>${r.sample.map(x => `<tr>
            <td>${esc(x.kind)}</td><td>${esc(x.name)}</td>
            <td>${esc(x.emp_name)}</td><td>${esc(x.lent_on || '')}</td>
          </tr>`).join('')}</tbody></table></div>
        ${r.add ? '<button class="btn primary block" id="aiGo" style="margin-top:14px;">'
          + `この ${r.add}件 を取り込む</button>` : ''}`;

      if ($('aiGo')) $('aiGo').onclick = async () => {
        const b = $('aiGo'); b.disabled = true; b.textContent = '取り込み中…';
        try {
          const res = await API.call('import.assets', { items, dry_run: false });
          closeSheet();
          toast(`${res.added}件を取り込みました`);
          renderAssets();
        } catch (e) { toast(e.message, 'err'); b.disabled = false; b.textContent = '取り込む'; }
      };
    } catch (e) { pv.innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
  };
}

/** いま使っている車両の管理簿（割当表＋自家用車）を読み込む */
function openCarImport() {
  openSheet(`
    <div class="sheet-title"><h2>管理簿から取り込む</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <p class="muted">いまお使いの車両の管理簿を、そのまま取り込めます。
      先に次のコマンドでJSONを作ってください。</p>
    <div class="card" style="margin:12px 0;">
      <code style="word-break:break-all; font-size:12px;">python3 tools/export_cars.py</code>
      <p class="muted" style="margin:8px 0 0;">
        ～/Desktop/車両管理/ の「社用車_割当表」と「kensho.json」を読んで、
        cars_import.json を作ります。同じ車が両方に載っていれば、社用車のほうを使います。</p>
    </div>
    <input type="file" id="ciFile" accept="application/json,.json">
    <div id="ciPreview" style="margin-top:14px;"></div>`);

  $('ciFile').onchange = async () => {
    const f = $('ciFile').files[0];
    if (!f) return;
    const pv = $('ciPreview');
    pv.innerHTML = '<div class="loading">読んでいます…</div>';
    let data;
    try { data = JSON.parse(await f.text()); }
    catch (e) { pv.innerHTML = '<p class="muted">JSONとして読めませんでした</p>'; return; }
    const items = data.items || data;
    try {
      const r = await API.call('import.cars', { items, dry_run: true });
      pv.innerHTML = `
        <div class="kpis">
          <div class="kpi"><b>${r.add}</b><span>新しく入る</span></div>
          <div class="kpi"><b>${r.update}</b><span>上書きする</span></div>
          <div class="kpi ${r.bad ? 'alert' : ''}"><b>${r.bad}</b><span>ナンバーが読めない</span></div>
        </div>
        <p class="muted">${esc(r.note)}</p>
        ${r.collide && r.collide.length ? `<div class="card" style="border-color:var(--warn);">
          <b>ナンバーの下4桁が同じ車があります</b>
          <p class="muted" style="margin:6px 0 0;">
            ${r.collide.map(esc).join('・')}<br>
            運行記録は下4桁で車を探すので、取り違えが起きます。
            車名で見分けられるようにしておいてください。</p>
        </div>` : ''}
        ${r.bad_list && r.bad_list.length
          ? `<p class="muted">入らないもの：${r.bad_list.map(esc).join('／')}</p>` : ''}
        <div class="table-wrap" style="margin-top:12px;"><table class="grid">
          <thead><tr><th>車名</th><th>ナンバー</th><th>法人</th><th>車検満了</th></tr></thead>
          <tbody>${r.sample.map(x => `<tr>
            <td>${esc(x.name)}</td><td>${esc(x.plate)}</td>
            <td>${esc(x.company || '')}</td><td>${esc(x.inspection_due || '')}</td>
          </tr>`).join('')}</tbody></table></div>
        ${(r.add + r.update) ? `<button class="btn primary block" id="ciGo" style="margin-top:14px;">
          この ${r.add + r.update}台 を取り込む</button>` : ''}`;

      if ($('ciGo')) $('ciGo').onclick = async () => {
        const b = $('ciGo'); b.disabled = true; b.textContent = '取り込み中…';
        try {
          const res = await API.call('import.cars', { items, dry_run: false });
          closeSheet();
          toast(`追加${res.added}台・更新${res.updated}台`);
          renderDrives();
        } catch (e) { toast(e.message, 'err'); b.disabled = false; b.textContent = '取り込む'; }
      };
    } catch (e) { pv.innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
  };
}

function dueCell(date, state) {
  if (!date) return '<span class="muted">—</span>';
  const cls = state === 'over' ? 'warn' : state === 'soon' ? 'warn' : '';
  const label = state === 'over' ? '期限切れ' : state === 'soon' ? 'まもなく' : '';
  return `${esc(date)}${label ? ` <span class="badge ${cls}">${label}</span>` : ''}`;
}

function openCarForm(c) {
  c = c || {};
  openSheet(`
    <div class="sheet-title"><h2>${c.id ? esc(c.name) : '車の追加'}</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <div class="cols">
      <label class="field"><span>名前（社員が選ぶときの表示）</span>
        <input type="text" id="crName" value="${esc(c.name || '')}" placeholder="送迎1号車"></label>
      <label class="field"><span>ナンバー（下4桁が分かるように）</span>
        <input type="text" id="crPlate" value="${esc(c.plate || '')}" placeholder="大宮 500 あ 12-34"></label>
      <label class="field"><span>車種</span>
        <input type="text" id="crModel" value="${esc(c.model || '')}" placeholder="エスクァイア"></label>
      <label class="field"><span>法人</span>
        <input type="text" id="crCompany" value="${esc(c.company || '')}"></label>
      <label class="field"><span>置いてある事業所</span>
        <input type="text" id="crOffice" value="${esc(c.office || '')}"></label>
      <label class="field"><span>定員</span>
        <input type="number" id="crCap" value="${esc(c.capacity || '')}"></label>
      <label class="field"><span>車検の満了日</span>
        <input type="date" id="crInsp" value="${esc(c.inspection_due || '')}"></label>
      <label class="field"><span>任意保険の満期</span>
        <input type="date" id="crIns" value="${esc(c.insurance_due || '')}"></label>
      <label class="field"><span>いまの走行距離（km）</span>
        <input type="number" id="crOdo" value="${esc(c.odo || '')}"></label>
    </div>
    <label class="field"><span>備考</span><input type="text" id="crNote" value="${esc(c.note || '')}"></label>
    <label style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
      <input type="checkbox" id="crActive" style="width:auto;" ${c.active === 'no' ? '' : 'checked'}>
      いま使っている</label>
    <button class="btn primary block" id="crSave">保存する</button>`);

  $('crSave').onclick = async () => {
    try {
      await API.call('admin.car.save', {
        id: c.id, name: $('crName').value, plate: $('crPlate').value,
        model: $('crModel').value, company: $('crCompany').value, office: $('crOffice').value,
        capacity: $('crCap').value, inspection_due: $('crInsp').value,
        insurance_due: $('crIns').value, odo: $('crOdo').value,
        note: $('crNote').value, active: $('crActive').checked });
      closeSheet(); toast('保存しました'); renderDrives();
    } catch (e) { toast(e.message, 'err'); }
  };
}

function openContactForm(c) {
  c = c || {};
  openSheet(`
    <div class="sheet-title"><h2>${c.id ? '連絡先の編集' : '連絡先の追加'}</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <div class="cols">
      <label class="field"><span>肩書き・区分</span>
        <input type="text" id="ctLabel" value="${esc(c.label || '')}" placeholder="責任者／保険会社 など"></label>
      <label class="field"><span>お名前・会社名</span>
        <input type="text" id="ctName" value="${esc(c.name || '')}"></label>
      <label class="field"><span>電話番号</span>
        <input type="text" id="ctPhone" value="${esc(c.phone || '')}" placeholder="048-000-0000"></label>
      <label class="field"><span>この法人だけに出す（空なら全社）</span>
        <input type="text" id="ctCompany" value="${esc(c.company || '')}"></label>
      <label class="field"><span>並び順（小さいほど上）</span>
        <input type="number" id="ctSort" value="${esc(c.sort || '100')}"></label>
    </div>
    <label class="field"><span>補足</span><input type="text" id="ctNoteI" value="${esc(c.note || '')}"></label>
    <div class="btn-row">
      ${c.id ? '<button class="btn danger" id="ctDel">削除</button>' : ''}
      <button class="btn primary" id="ctSave">保存する</button>
    </div>`);

  $('ctSave').onclick = async () => {
    try {
      await API.call('admin.contact.save', {
        id: c.id, label: $('ctLabel').value, name: $('ctName').value,
        phone: $('ctPhone').value, company: $('ctCompany').value,
        sort: $('ctSort').value, note: $('ctNoteI').value });
      closeSheet(); toast('保存しました'); renderDrives();
    } catch (e) { toast(e.message, 'err'); }
  };
  if ($('ctDel')) $('ctDel').onclick = async () => {
    if (!confirm('削除しますか？')) return;
    try { await API.call('admin.contact.delete', { id: c.id }); closeSheet(); toast('削除しました'); renderDrives(); }
    catch (e) { toast(e.message, 'err'); }
  };
}

/* ============================ 事故の報告 ============================ */

async function renderIncidents() {
  const v = $('v-incident');
  v.innerHTML = '<div class="loading">読み込み中…</div>';
  try {
    const d = await API.call('admin.incidents', { include_done: true });
    setCount('cInc', d.open);
    v.innerHTML = `
      ${d.incidents.length ? `<div class="list">${d.incidents.map(r => `
        <div class="card" style="margin-bottom:12px;">
          <div class="card-head">
            <h2>${esc(r.type)}　<span class="muted">${esc(r.occurred_at)}</span></h2>
            <span class="badge ${r.status === '完了' ? 'ok' : 'warn'}">${esc(r.status)}</span>
          </div>
          <div class="table-wrap" style="margin-bottom:10px;"><table class="grid"><tbody>
            <tr><th style="width:120px">報告者</th><td>${esc(r.name)}（${esc(r.office || '')}）</td></tr>
            <tr><th>場所</th><td>${esc(r.place || '')}</td></tr>
            <tr><th>車</th><td>${esc(r.car_name || '')}</td></tr>
            <tr><th>けが</th><td>${esc(r.injury || '')}</td></tr>
            <tr><th>警察</th><td>${esc(r.police || '')}</td></tr>
            <tr><th>相手</th><td style="white-space:pre-wrap">${esc(r.counterpart || '')}</td></tr>
            <tr><th>状況</th><td style="white-space:pre-wrap">${esc(r.detail || '')}</td></tr>
            ${r.photo_url ? `<tr><th>写真</th><td>
              <a href="${esc(r.photo_url)}" target="_blank" rel="noopener">開く</a></td></tr>` : ''}
            ${r.comment ? `<tr><th>総務から</th><td>${esc(r.comment)}</td></tr>` : ''}
          </tbody></table></div>
          <div class="btn-row">
            <button class="btn sm" data-inc="${esc(r.id)}" data-st="対応中">対応中にする</button>
            <button class="btn sm primary" data-inc="${esc(r.id)}" data-st="完了">完了にする</button>
            <button class="btn sm ghost" data-inccm="${esc(r.id)}">本人に連絡する</button>
          </div>
        </div>`).join('')}</div>`
      : '<div class="empty-state">報告はありません</div>'}`;

    v.querySelectorAll('[data-inc]').forEach(b => b.onclick = async () => {
      try {
        await API.call('admin.incident.update', { id: b.dataset.inc, status: b.dataset.st });
        toast('更新しました'); renderIncidents();
      } catch (e) { toast(e.message, 'err'); }
    });
    v.querySelectorAll('[data-inccm]').forEach(b => b.onclick = async () => {
      const comment = prompt('本人に伝えることを書いてください（通知されます）');
      if (!comment) return;
      try {
        await API.call('admin.incident.update', { id: b.dataset.inccm, comment });
        toast('送りました'); renderIncidents();
      } catch (e) { toast(e.message, 'err'); }
    });
  } catch (e) { v.innerHTML = `<div class="card"><p class="muted">${esc(e.message)}</p></div>`; }
}

/* ============================ 治療院の日報 ============================ */

async function renderTreatments() {
  const v = $('v-treat');
  v.innerHTML = '<div class="loading">読み込み中…</div>';
  try {
    const d = await API.call('admin.treatments', { month: A.month });
    v.innerHTML = `
      <div class="kpis">
        <div class="kpi"><b>${d.total}</b><span>${d.month} の施術</span></div>
        <div class="kpi"><b>${d.patients.length}</b><span>のべ人数</span></div>
        <div class="kpi"><b>${d.staff.length}</b><span>施術者</span></div>
      </div>

      <div class="card-head">
        <h2>お一人ごとの回数（レセプトの確認用）</h2>
        <button class="btn sm" id="trCsv">CSVをダウンロード</button>
      </div>
      ${d.patients.length ? `<div class="table-wrap" style="margin-bottom:20px;"><table class="grid">
        <thead><tr><th>お名前</th><th class="num">回数</th><th class="num">合計(分)</th>
          <th>担当</th></tr></thead>
        <tbody>${d.patients.map(x => `<tr>
          <td>${esc(x.patient)}</td>
          <td class="num" style="font-weight:700;">${x.count}</td>
          <td class="num">${x.minutes}</td>
          <td>${esc(x.staff)}</td>
        </tr>`).join('')}</tbody></table></div>`
      : '<div class="empty-state">この月の記録はありません</div>'}

      ${d.staff.length ? `<h2 style="margin-bottom:10px;">施術者ごと</h2>
        <div class="table-wrap" style="margin-bottom:20px;"><table class="grid">
          <thead><tr><th>氏名</th><th class="num">件数</th><th class="num">合計(分)</th>
            <th class="num">時間</th></tr></thead>
          <tbody>${d.staff.map(x => `<tr>
            <td>${esc(x.name)}</td><td class="num">${x.count}</td>
            <td class="num">${x.minutes}</td>
            <td class="num">${Math.round(x.minutes / 6) / 10}h</td>
          </tr>`).join('')}</tbody></table></div>` : ''}

      ${d.rows.length ? `<h2 style="margin-bottom:10px;">日ごとの記録</h2>
        <div class="table-wrap"><table class="grid">
          <thead><tr><th>日付</th><th>お名前</th><th class="num">時間(分)</th>
            <th>施術者</th><th>備考</th></tr></thead>
          <tbody>${d.rows.map(r => `<tr>
            <td>${esc(r.date.slice(5))}</td><td>${esc(r.patient)}</td>
            <td class="num">${esc(r.minutes)}</td><td>${esc(r.name)}</td>
            <td>${esc(r.note || '')}</td>
          </tr>`).join('')}</tbody></table></div>` : ''}

      <p class="muted" style="margin-top:14px;">
        日報を書くのは、事業所名に「治療院」が入る方です。
        変えたいときは「事業所・打刻設定」の下で対象を指定できます。
      </p>`;

    $('trCsv').onclick = async () => {
      try {
        const r = await API.call('admin.treatments.export', { month: A.month });
        const blob = new Blob(['\ufeff' + r.csv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `治療院日報_${A.month}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      } catch (e) { toast(e.message, 'err'); }
    };
  } catch (e) { v.innerHTML = `<div class="card"><p class="muted">${esc(e.message)}</p></div>`; }
}

/* ============================ 雇用契約 ============================ */

async function renderContracts() {
  const v = $('v-contract');
  v.innerHTML = '<div class="loading">読み込み中…</div>';
  try {
    const d = await API.call('admin.contracts');
    setCount('cCon', d.over + d.soon);
    const label = (r) => {
      if (r.state === 'over') return '<span class="badge warn">期日を過ぎています</span>';
      if (r.state === 'soon') return `<span class="badge warn">あと${r.days_left}日</span>`;
      if (r.state === 'none') return '<span class="muted">期間の定めなし</span>';
      return `<span class="muted">あと${r.days_left}日</span>`;
    };
    v.innerHTML = `
      <div class="kpis">
        <div class="kpi ${d.over ? 'alert' : ''}"><b>${d.over}</b><span>期日を過ぎている</span></div>
        <div class="kpi ${d.soon ? 'alert' : ''}"><b>${d.soon}</b><span>${d.alert_days}日以内</span></div>
        <div class="kpi"><b>${d.rows.length}</b><span>在籍者</span></div>
      </div>

      <div class="card-head">
        <h2>契約の期日</h2>
        <div style="display:flex; gap:8px;">
          <button class="btn sm" id="conImport">契約台帳から取り込む</button>
          <button class="btn sm" id="conKaonavi">カオナビから取り込む</button>
        </div>
      </div>
      ${d.rows.length ? `<div class="table-wrap"><table class="grid">
        <thead><tr><th>コード</th><th>氏名</th><th>事業所</th><th>区分</th>
          <th>契約の種類</th><th>期日</th><th>のこり</th><th>いまの状況</th>
          <th>署名</th><th></th></tr></thead>
        <tbody>${d.rows.map(r => `<tr>
          <td>${esc(r.code)}</td><td>${esc(r.name)}</td><td>${esc(r.office)}</td>
          <td>${esc(r.employment || '')}</td>
          <td>${esc(r.kind || '')}</td>
          <td>${r.end_date ? esc(r.end_date) : '<span class="muted">—</span>'}</td>
          <td>${label(r)}</td>
          <td>${esc(r.note || '')}</td>
          <td>${r.sign_status
            ? `<span class="badge ${r.sign_status === '署名済' ? 'ok' : 'warn'}">${esc(r.sign_status)}</span>`
              + (r.sign_url ? `<br><a href="${esc(r.sign_url)}" target="_blank" rel="noopener">開く</a>` : '')
            : '<span class="muted">—</span>'}</td>
          <td style="white-space:nowrap;">
            <button class="btn sm" data-consign="${esc(r.code)}" data-name="${esc(r.name)}">署名を依頼</button>
            <button class="btn sm ghost" data-conedit="${esc(r.code)}">編集</button></td>
        </tr>`).join('')}</tbody></table></div>
        <p class="muted" style="margin-top:12px;">
          署名そのものは Adobe Acrobat で行います。ここで依頼を登録しておくと、
          社員のアプリに「署名のお願い」として出て、署名画面へのリンクから進めます。
          完了したら、この画面で「署名済」にしてください。
        </p>`
      : `<div class="empty-state">まだ取り込んでいません。<br>
           上のボタンから契約台帳またはカオナビの内容を取り込んでください。</div>`}`;

    $('conImport').onclick = openContractImport;
    $('conKaonavi').onclick = openContractKaonavi;
    v.querySelectorAll('[data-consign]').forEach(b => b.onclick = () =>
      openSignRequestForm(b.dataset.consign, b.dataset.name));
    v.querySelectorAll('[data-conedit]').forEach(b => b.onclick = () =>
      openContractForm(d.rows.find(r => r.code === b.dataset.conedit)));
  } catch (e) { v.innerHTML = `<div class="card"><p class="muted">${esc(e.message)}</p></div>`; }
}

function openContractImport() {
  openSheet(`
    <div class="sheet-title"><h2>契約台帳から取り込む</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <p class="muted">いま使っている契約台帳を、下のコマンドで読み取り用のファイルに変えてから選んでください。</p>
    <pre style="background:var(--bg); padding:12px; border-radius:8px; overflow-x:auto;
         font-size:12px; margin-bottom:14px;">cd ~/butterfly-portal
python3 tools/export_contracts.py -o contracts_import.json</pre>
    <label class="field"><span>contracts_import.json を選ぶ</span>
      <input type="file" id="conFile" accept="application/json,.json"></label>
    <div id="conOut"></div>`);

  $('conFile').onchange = async () => {
    const f = $('conFile').files[0];
    if (!f) return;
    let data;
    try { data = JSON.parse(await f.text()); }
    catch (e) { return toast('ファイルを読めませんでした', 'err'); }
    $('conOut').innerHTML = '<p class="muted">確認中…</p>';
    try {
      const r = await API.call('import.contracts', { items: data.items, dry_run: true });
      $('conOut').innerHTML = `
        <div class="kpis">
          <div class="kpi"><b>${r.count}</b><span>取り込む人数</span></div>
          <div class="kpi ${r.unmatched.length ? 'alert' : ''}"><b>${r.unmatched.length}</b><span>結びつかない</span></div>
        </div>
        ${r.unmatched.length ? `<p class="muted" style="color:var(--warn)">
          社員マスタに見つかりませんでした：${esc(r.unmatched.join('、'))}</p>` : ''}
        <div class="table-wrap" style="margin:12px 0;"><table class="grid">
          <thead><tr><th>氏名</th><th>種類</th><th>期日</th></tr></thead>
          <tbody>${r.sample.map(x => `<tr><td>${esc(x.name)}</td>
            <td>${esc(x.kind || '')}</td><td>${esc(x.end_date || '')}</td></tr>`).join('')}
          </tbody></table></div>
        <button class="btn primary block" id="conGo">この内容で取り込む</button>`;
      $('conGo').onclick = async () => {
        try {
          const rr = await API.call('import.contracts', { items: data.items, dry_run: false });
          closeSheet(); toast(`${rr.applied}名ぶんを取り込みました`); renderContracts();
        } catch (e) { toast(e.message, 'err'); }
      };
    } catch (e) { $('conOut').innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
  };
}

async function openContractKaonavi() {
  openSheet(`
    <div class="sheet-title"><h2>カオナビから取り込む</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <p class="muted">シート58「更新情報」から契約の期日を読み込みます。</p>
    <div id="conKOut"><p class="muted">確認中…</p></div>`);
  try {
    const r = await API.call('kaonavi.syncContracts', { dry_run: true });
    $('conKOut').innerHTML = `
      <p>${r.count}件の期日が見つかりました。</p>
      ${r.sample.length ? `<div class="table-wrap" style="margin:12px 0;"><table class="grid">
        <thead><tr><th>コード</th><th>氏名</th><th>期日</th><th>種類</th></tr></thead>
        <tbody>${r.sample.map(x => `<tr><td>${esc(x.code)}</td><td>${esc(x.name)}</td>
          <td>${esc(x.end_date)}</td><td>${esc(x.kind || '')}</td></tr>`).join('')}
        </tbody></table></div>` : ''}
      <p class="muted">${esc(r.note || '')}</p>
      ${r.count ? '<button class="btn primary block" id="conKGo">この内容で取り込む</button>' : ''}`;
    if ($('conKGo')) $('conKGo').onclick = async () => {
      const rr = await API.call('kaonavi.syncContracts', { dry_run: false });
      closeSheet(); toast(`${rr.applied}件を取り込みました`); renderContracts();
    };
  } catch (e) { $('conKOut').innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
}

function openContractForm(r) {
  openSheet(`
    <div class="sheet-title"><h2>${esc(r.name)} の契約</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <div class="cols">
      <label class="field"><span>契約の種類</span>
        <input type="text" id="cnKind" value="${esc(r.kind || '')}" placeholder="１年契約期日 など"></label>
      <label class="field"><span>開始日</span>
        <input type="date" id="cnStart" value="${esc(r.start_date || '')}"></label>
      <label class="field"><span>期日</span>
        <input type="date" id="cnEnd" value="${esc(r.end_date || '')}"></label>
    </div>
    <label class="field"><span>いまの状況</span>
      <input type="text" id="cnNote" value="${esc(r.note || '')}"></label>
    <p class="muted">期間の定めのない契約なら、期日を空にしてください。</p>
    <button class="btn primary block" id="cnSave">保存する</button>`);
  $('cnSave').onclick = async () => {
    try {
      await API.call('admin.contract.save', {
        code: r.code, kind: $('cnKind').value, start_date: $('cnStart').value,
        end_date: $('cnEnd').value, note: $('cnNote').value,
        stage: $('cnEnd').value ? '' : 'exempt' });
      closeSheet(); toast('保存しました'); renderContracts();
    } catch (e) { toast(e.message, 'err'); }
  };
}

function openSignRequestForm(code, name) {
  const today = new Date().toISOString().slice(0, 10);
  openSheet(`
    <div class="sheet-title"><h2>${esc(name)} に署名を依頼</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <p class="muted">Adobe Acrobat で「電子サインを依頼」を送ったあと、
      ここに登録しておくと、社員のアプリにも「署名のお願い」として出ます。</p>
    <label class="field"><span>書類の名前</span>
      <input type="text" id="sgTitle" value="雇用契約書"></label>
    <label class="field"><span>署名の画面のリンク（Adobeのメールに載っているURL）</span>
      <input type="text" id="sgUrl" placeholder="https://..."></label>
    <div class="cols">
      <label class="field"><span>依頼した日</span>
        <input type="date" id="sgAt" value="${today}"></label>
      <label class="field"><span>期限</span>
        <input type="date" id="sgDue"></label>
      <label class="field"><span>状態</span>
        <select id="sgStatus"><option>署名待ち</option><option>署名済</option></select></label>
    </div>
    <label style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
      <input type="checkbox" id="sgNotify" style="width:auto;" checked>
      本人にメールでも知らせる</label>
    <button class="btn primary block" id="sgSave">登録する</button>`);
  $('sgSave').onclick = async () => {
    try {
      await API.call('sign.upsert', {
        code, title: $('sgTitle').value, doc_type: '雇用契約書',
        status: $('sgStatus').value, url: $('sgUrl').value,
        requested_at: $('sgAt').value + ' 00:00:00', due_date: $('sgDue').value,
        notify: $('sgNotify').checked });
      closeSheet(); toast('登録しました'); renderContracts();
    } catch (e) { toast(e.message, 'err'); }
  };
}

/** 事業所に貼るQRを表示する（そのまま印刷できる形） */
function showOfficeQr(office, token) {
  const url = location.origin + location.pathname.replace(/admin\.html$/, 'index.html')
              + '?qr=' + token;
  const w = window.open('', '_blank');
  if (!w) { toast('ポップアップを許可してください', 'err'); return; }
  w.document.write(`<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">
    <title>${office} 打刻用QR</title>
    <style>
      body { font-family: -apple-system, "Hiragino Sans", sans-serif; text-align: center;
             padding: 40px 20px; color: #241d18; }
      h1 { font-size: 30px; margin: 0 0 4px; }
      .sub { color: #7b6f66; margin: 0 0 28px; font-size: 15px; }
      #qr { display: inline-block; padding: 14px; border: 1px solid #ece5dd; border-radius: 12px; }
      #qr img, #qr canvas { width: 360px; height: 360px; display: block; }
      .how { margin: 28px auto 0; max-width: 420px; text-align: left; font-size: 15px;
             line-height: 1.9; color: #241d18; }
      .how b { display: block; margin-bottom: 6px; font-size: 17px; }
      .note { margin-top: 20px; color: #7b6f66; font-size: 13px; }
      @media print { .no-print { display: none; } }
    </style></head><body>
    <h1>${office}</h1>
    <p class="sub">出退勤の打刻はこちらから</p>
    <div id="qr"></div>
    <div class="how">
      <b>使い方</b>
      1. スマホのカメラでこのQRコードを読み取ります<br>
      2. 「ひだまりグループ」のアプリが開きます<br>
      3. 「出勤する」または「退勤する」を押してください
    </div>
    <p class="note">アプリを開いてから「QRを読んで出勤」を押しても読み取れます。</p>
    <p class="no-print" style="margin-top:28px;">
      <button onclick="window.print()" style="padding:10px 20px; font-size:15px;">印刷する</button></p>
    <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js"><\/script>
    <script>
      // QRはこの場で作る。合言葉を外のサービスに送らないため。
      var qr = qrcode(0, 'M');
      qr.addData(${JSON.stringify(url)});
      qr.make();
      document.getElementById('qr').innerHTML = qr.createImgTag(8, 0);
      document.querySelector('#qr img').style.width = '360px';
      document.querySelector('#qr img').style.height = '360px';
      document.querySelector('#qr img').style.imageRendering = 'pixelated';
    <\/script>
    </body></html>`);
  w.document.close();
}

/* ---- 社員データの取り込み ---- */

function openEmployeeImport() {
  openSheet(`
    <div class="sheet-title"><h2>カオナビから取り込む</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <p class="muted">下のコマンドでカオナビから社員の一覧を書き出してから、そのファイルを選んでください。
      権限・メール・ログイン情報は上書きされません。</p>
    <pre style="background:var(--bg); padding:12px; border-radius:8px; overflow-x:auto;
         font-size:12px; margin-bottom:14px;">cd ~/butterfly-portal
~/kaonavi-sync/.venv/bin/python tools/export_employees.py -o employees_import.json</pre>
    <label class="field"><span>employees_import.json を選ぶ</span>
      <input type="file" id="empFile" accept="application/json,.json"></label>
    <p class="muted">Apps Script から直接つなぐ場合は「カオナビ連動 → いま同期する」でも取り込めます。</p>
    <div id="empOut"></div>`);

  $('empFile').onchange = async () => {
    const f = $('empFile').files[0];
    if (!f) return;
    let data;
    try { data = JSON.parse(await f.text()); }
    catch (e) { return toast('ファイルを読めませんでした', 'err'); }
    $('empOut').innerHTML = '<p class="muted">確認中…</p>';
    try {
      const r = await API.call('import.employees', { items: data.items, dry_run: true });
      $('empOut').innerHTML = `
        <div class="kpis">
          <div class="kpi"><b>${r.total}</b><span>ファイルの人数</span></div>
          <div class="kpi"><b>${r.added}</b><span>新しく入る</span></div>
          <div class="kpi"><b>${r.updated}</b><span>すでにいる</span></div>
          <div class="kpi ${r.missing.length ? 'alert' : ''}"><b>${r.missing.length}</b><span>一覧にない</span></div>
        </div>
        ${r.no_birthday.length ? `<p class="muted" style="color:var(--warn)">
          生年月日が入っていない方がいます（初回登録の本人確認に使うので、
          カオナビ側で入れてください）：${esc(r.no_birthday.slice(0, 10).join('、'))}</p>` : ''}
        ${r.missing.length ? `<p class="muted">
          この一覧に出てこない在籍者は「要確認」にします（退職にはしません）：
          ${esc(r.missing.join('、'))}</p>` : ''}
        <div class="table-wrap" style="margin:12px 0;"><table class="grid">
          <thead><tr><th>社員番号</th><th>氏名</th><th>法人</th><th>事業所</th><th>区分</th></tr></thead>
          <tbody>${r.sample.map(x => `<tr><td>${esc(x.code)}</td><td>${esc(x.name)}</td>
            <td>${esc(x.company)}</td><td>${esc(x.office)}</td>
            <td>${esc(x.employment || '')}</td></tr>`).join('')}</tbody></table></div>
        <p class="muted">上は先頭の10名です。</p>
        <button class="btn primary block" id="empGo">この内容で取り込む</button>`;
      $('empGo').onclick = async () => {
        if (!confirm(`${r.total}名を取り込みます。よろしいですか？`)) return;
        try {
          const rr = await API.call('import.employees', { items: data.items, dry_run: false });
          closeSheet();
          toast(`${rr.added}名を追加、${rr.updated}名を更新しました`);
          renderEmps();
        } catch (e) { toast(e.message, 'err'); }
      };
    } catch (e) { $('empOut').innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
  };
}

/* ============================ 誓約書 ============================ */

async function renderPledge() {
  const v = $('v-pledge');
  if (A.me.role !== 'admin') { v.innerHTML = '<div class="empty-state">管理者のみ</div>'; return; }
  v.innerHTML = '<div class="loading">読み込み中…</div>';
  try {
    const d = await API.call('admin.pledge');
    const yet = d.rows.length - d.agreed_count;
    setCount('cPle', yet);
    v.innerHTML = `
      <div class="kpis">
        <div class="kpi"><b>${d.agreed_count}</b><span>了承ずみ</span></div>
        <div class="kpi ${yet ? 'alert' : ''}"><b>${yet}</b><span>まだの方</span></div>
        <div class="kpi"><b>第${esc(d.version)}版</b><span>いまの版</span></div>
      </div>

      <div class="cols">
        <div class="card">
          <h2>本文</h2>
          <p class="muted">社員はこの文章を読んで「了承する」を押します。
            控えは本人のメールアドレスに届きます。</p>
          <textarea id="plText" style="min-height:340px; font-family:inherit; line-height:1.9;">${esc(d.text)}</textarea>
          <label style="display:flex; align-items:center; gap:8px; margin:10px 0;">
            <input type="checkbox" id="plBump" style="width:auto;">
            版を上げる（内容を変えたとき。すでに了承した方には影響しません）</label>
          <button class="btn primary block" id="plSave">保存する</button>
        </div>

        <div class="card">
          <h2>了承の状況</h2>
          <div class="table-wrap" style="max-height:420px; overflow-y:auto;">
            <table class="grid">
              <thead><tr><th>番号</th><th>氏名</th><th>事業部</th><th>了承</th><th>控えの送り先</th></tr></thead>
              <tbody>${d.rows.map(r => `<tr>
                <td>${esc(r.code)}</td><td>${esc(r.name)}</td><td>${esc(r.office || '')}</td>
                <td>${r.agreed
                  ? `<span class="badge ok">済</span><br><span class="muted">${fmtDateTime(r.agreed_at)}</span>`
                  : '<span class="badge warn">まだ</span>'}</td>
                <td>${esc(r.email || '')}</td>
              </tr>`).join('')}</tbody></table>
          </div>
        </div>
      </div>`;

    $('plSave').onclick = async () => {
      if (!confirm('本文を保存します。よろしいですか？')) return;
      try {
        const r = await API.call('admin.pledge.save',
          { text: $('plText').value, bump_version: $('plBump').checked });
        toast(`保存しました（第${r.version}版）`);
        renderPledge();
      } catch (e) { toast(e.message, 'err'); }
    };
  } catch (e) { v.innerHTML = `<div class="card"><p class="muted">${esc(e.message)}</p></div>`; }
}
