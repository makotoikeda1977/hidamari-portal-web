/**
 * ひだまりグループ 社内ポータル — 社労士（グランディス）用の画面
 *
 * 給与計算に要るものだけを1枚に並べる。読むだけで、書き換える経路は置かない。
 */

// esc・toast・fmtDate などの小物は api.js が持っている（ここで作り直さない）
const S = {};
const $ = (id) => document.getElementById(id);

function openSheet(html) {
  $('sheet').innerHTML = html;
  $('sheetBg').classList.add('open');
  $('sheetBg').onclick = (e) => { if (e.target === $('sheetBg')) closeSheet(); };
}
function closeSheet() { $('sheetBg').classList.remove('open'); }

const monthLabel = (m) => m ? `${Number(m.slice(0, 4))}年${Number(m.slice(5, 7))}月` : '';

/* ============================ 入り口 ============================ */

(async function boot() {
  if (!API.token()) return showLogin();
  try {
    const d = await API.call('me');
    S.me = d.me;
    if (S.me.role !== 'viewer' && S.me.role !== 'admin') {
      document.body.innerHTML = '<div class="app" style="padding:40px"><div class="card">'
        + '<h2>この画面は社労士の方が使うものです</h2>'
        + '<a class="btn" href="index.html">社員画面へ</a></div></div>';
      return;
    }
  } catch (e) { return showLogin(); }
  start();
})();

function showLogin() {
  $('login').style.display = '';
  $('app').style.display = 'none';
  $('btnLogin').onclick = async () => {
    const b = $('btnLogin'); b.disabled = true;
    try {
      const d = await API.call('login',
        { login_id: $('loginId').value.trim(), password: $('loginPw').value });
      API.setToken(d.token);
      location.reload();
    } catch (e) { toast(e.message, 'err'); b.disabled = false; }
  };
  $('loginPw').onkeydown = (e) => { if (e.key === 'Enter') $('btnLogin').click(); };
}

function start() {
  $('login').style.display = 'none';
  $('app').style.display = '';
  $('whoami').textContent = S.me.name;
  $('btnLogout').onclick = async () => {
    try { await API.call('logout'); } catch (e) { }
    API.setToken('');
    location.reload();
  };
  $('monthPick').onchange = () => render($('monthPick').value);
  render();
}

/* ============================ 本体 ============================ */

async function render(month) {
  const v = $('body');
  v.innerHTML = '<div class="loading">読み込み中…</div>';
  try {
    const d = await API.call('sr.home', month ? { month } : {});
    S.d = d;
    $('monthPick').value = d.month;

    const num = (x) => x || x === 0 ? x : '';
    v.innerHTML = `
      <div class="card">
        <h2>${monthLabel(d.month)}の勤怠</h2>
        <p class="muted">給与計算に使う数字だけを並べています。
          時間はすべて「時間」の小数第1位までです。
          割増の単価が変わるもの（法定内・法定外・深夜・休日）は列を分けてあります。</p>
        <div class="btn-row" style="margin-top:12px;">
          <button class="btn primary" id="dlKintai">勤怠のCSV</button>
          <button class="btn" id="dlExpense">交通費のCSV</button>
          <button class="btn ghost" id="fbBtn">気づいたことを送る</button>
        </div>
      </div>

      <div class="kpis">
        <div class="kpi"><b>${d.rows.length}</b><span>対象者</span></div>
        <div class="kpi"><b>${d.closed}</b><span>締めずみ</span></div>
        <div class="kpi ${d.unapproved ? 'alert' : ''}"><b>${d.unapproved}</b><span>申請なし超過あり</span></div>
        <div class="kpi"><b>${d.expense_total.toLocaleString()}</b><span>交通費の合計（円）</span></div>
      </div>

      ${d.joined.length || d.retired.length ? `<div class="card">
        <h2>入社・退職</h2>
        ${d.joined.length ? `<p class="muted">この月に入社された方（社会保険の取得手続き）</p>
          <div class="list">${d.joined.map(x => `
            <div class="item" style="cursor:default;"><div class="grow">
              <div class="title">${esc(x.name)}</div>
              <div class="meta">${esc(x.company)} ${esc(x.office)}　${esc(x.employment || '')}　
                入社 ${esc(x.join_date)}</div></div></div>`).join('')}</div>` : ''}
        ${d.retired.length ? `<p class="muted" style="margin-top:12px;">
          在籍状態が「退職」の方</p>
          <div class="list">${d.retired.map(x => `
            <div class="item" style="cursor:default;"><div class="grow">
              <div class="title">${esc(x.name)}</div>
              <div class="meta">${esc(x.company)} ${esc(x.office)}</div></div></div>`).join('')}</div>` : ''}
      </div>` : ''}

      ${d.no_schedule ? `<div class="card" style="border-color:var(--warn);">
        <b>所定の時刻が登録されていない方が ${d.no_schedule}名 います</b>
        <p class="muted" style="margin:6px 0 0;">
          その方は法定内残業を集計できません（表の備考に印を付けています）。
          総務にお伝えいただければ登録します。</p>
      </div>` : ''}

      ${d.duty_alert.length ? `<div class="card" style="border-color:var(--warn);">
        <b>年5日の取得義務があぶない方が ${d.duty_alert.length}名 います</b>
        <p class="muted" style="margin:6px 0 0;">${d.duty_alert.map(x =>
          `${esc(x.name)}（${esc(x.office)}）あと${x.need}日・${esc(x.to)}まで`).join('<br>')}</p>
      </div>` : ''}

      <div class="card-head"><h2>勤怠の集計</h2>
        <div class="chip-row" style="margin:0;">
          <button class="chip on" data-co="">すべて</button>
          ${d.companies.map(c => `<button class="chip" data-co="${esc(c)}">${esc(c)}</button>`).join('')}
        </div>
      </div>
      <div class="table-wrap"><table class="grid" id="srTable">
        <thead><tr>
          <th>コード</th><th>氏名</th><th>法人</th><th>事業所</th><th>区分</th>
          <th class="num">出勤</th><th class="num">休日出勤</th>
          <th class="num">有休</th><th class="num">特別</th><th class="num">欠勤</th>
          <th class="num">総労働h</th>
          <th class="num">法定内残業h</th><th class="num">法定外残業h</th>
          <th class="num">深夜h</th><th class="num">休日労働h</th>
          <th class="num">遅刻h</th><th class="num">早退h</th>
          <th class="num">申請なし超過h</th><th class="num">有給残</th><th>備考</th>
        </tr></thead>
        <tbody>${d.rows.map(r => `<tr data-co="${esc(r.company)}">
          <td>${esc(r.code)}</td><td>${esc(r.name)}</td>
          <td>${esc(r.company)}</td><td>${esc(r.office)}</td><td>${esc(r.employment)}</td>
          <td class="num">${r.work_days}</td><td class="num">${num(r.holiday_days) || ''}</td>
          <td class="num">${num(r.paid_days) || ''}</td><td class="num">${num(r.special_days) || ''}</td>
          <td class="num">${num(r.absent_days) || ''}</td>
          <td class="num" style="font-weight:700;">${r.total_hours}</td>
          <td class="num">${r.over_within || ''}</td>
          <td class="num">${r.over_legal || ''}</td>
          <td class="num">${r.night || ''}</td><td class="num">${r.holiday_hours || ''}</td>
          <td class="num">${r.late || ''}</td><td class="num">${r.early || ''}</td>
          <td class="num" style="${r.unapproved ? 'color:var(--warn); font-weight:700' : ''}">${r.unapproved || ''}</td>
          <td class="num">${r.leave_remain === null ? '—' : r.leave_remain}</td>
          <td>${r.no_schedule ? '<span class="badge warn">所定時刻なし</span>' : ''}
              ${r.closed ? '<span class="badge ok">締めずみ</span>' : ''}</td>
        </tr>`).join('')}</tbody>
      </table></div>

      ${d.expenses.length ? `<div class="card-head" style="margin-top:20px;">
        <h2>通勤交通費（承認ずみ）</h2></div>
      <div class="table-wrap"><table class="grid">
        <thead><tr><th>コード</th><th>氏名</th><th>法人</th>
          <th class="num">金額</th><th>通勤方法</th><th>区間・経路</th><th class="num">片道km</th></tr></thead>
        <tbody>${d.expenses.map(x => `<tr>
          <td>${esc(x.code)}</td><td>${esc(x.name)}</td><td>${esc(x.company)}</td>
          <td class="num">${x.amount.toLocaleString()}</td>
          <td>${esc(x.method)}</td><td>${esc(x.route)}</td>
          <td class="num">${esc(x.distance_km)}</td>
        </tr>`).join('')}</tbody>
      </table></div>` : ''}

      <div class="card" style="margin-top:20px;">
        <h2>この仕組みについて</h2>
        <ul class="plain-list">
          <li><b>打刻</b>…事業所勤務の方はQRコードまたは位置情報、訪問系の方は「現場直行」。
            時刻はサーバ側で記録しており、端末の時計は使っていません。</li>
          <li><b>社員は勤怠を修正できません。</b>打刻忘れ・欠勤は社員から申告し、
            総務が承認して初めて反映されます。</li>
          <li><b>残業</b>…事前申請・承認があった分のみを計上しています。
            申請がなくても所定を超えた分は「申請なし超過」として記録に残し、消しません。</li>
          <li><b>法定外残業</b>…1日8時間を超えた分。
            <b>法定内残業</b>…所定を超えたが8時間には収まっている分。</li>
          <li><b>深夜</b>…22時から翌5時の実労働時間。日をまたぐ勤務も数えます。</li>
          <li><b>休日労働</b>…区分が「休日出勤」の日の実労働。
            法定休日か所定休日かの区別は、いまは持っていません。</li>
          <li><b>年次有給休暇</b>…年5日の取得義務の進捗を、社員本人と総務の双方が見られます。
            半日単位の取得にも対応しています。</li>
          <li><b>記録の保存</b>…勤怠は3年間保存します（労基法109条）。</li>
        </ul>
        <p class="muted" style="margin-top:10px;">
          お気づきの点は「気づいたことを送る」からお知らせください。総務に届きます。</p>
      </div>`;

    $('dlKintai').onclick = () => download('admin.export', `勤怠_${d.month}.csv`);
    $('dlExpense').onclick = () => download('admin.expense.export', `交通費_${d.month}.csv`);
    $('fbBtn').onclick = openFeedback;
    v.querySelectorAll('[data-co]').forEach(b => {
      if (b.tagName !== 'BUTTON') return;
      b.onclick = () => {
        const co = b.dataset.co;
        v.querySelectorAll('.chip[data-co]').forEach(x => x.classList.toggle('on', x === b));
        $('srTable').querySelectorAll('tbody tr').forEach(tr => {
          tr.style.display = (!co || tr.dataset.co === co) ? '' : 'none';
        });
      };
    });
  } catch (e) {
    v.innerHTML = `<div class="card"><p class="muted">${esc(e.message)}</p></div>`;
  }
}

async function download(action, filename) {
  try {
    const r = await API.call(action, { month: S.d.month });
    // BOMを付けて、Excelで開いても文字化けしないようにする
    const blob = new Blob(['﻿' + r.csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (e) { toast(e.message, 'err'); }
}

function openFeedback() {
  openSheet(`
    <div class="sheet-title"><h2>気づいたことを送る</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <p class="muted">総務に届きます。「この項目が足りない」「この扱いは危ない」など、
      お気づきの点をそのままお書きください。</p>
    <label class="field"><span>どこについて</span>
      <select id="fbWhere">
        <option>データの形（CSVの列）</option>
        <option>労働時間の把握のしかた</option>
        <option>残業の扱い</option>
        <option>年次有給休暇</option>
        <option>記録の保存</option>
        <option>全体</option>
      </select></label>
    <label class="field"><span>内容</span>
      <textarea id="fbBody" style="min-height:160px;"></textarea></label>
    <button class="btn primary block" id="fbSend">送る</button>`);

  $('fbSend').onclick = async () => {
    const b = $('fbSend'); b.disabled = true; b.textContent = '送信中…';
    try {
      await API.call('sr.feedback',
        { where: $('fbWhere').value, body: $('fbBody').value });
      closeSheet();
      toast('総務にお送りしました。ありがとうございます');
    } catch (e) { toast(e.message, 'err'); b.disabled = false; b.textContent = '送る'; }
  };
}
