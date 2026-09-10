/* ひだまりグループ 社内ポータル — 社員用アプリ */

const S = {
  me: null,
  kinds: [],
  month: '',
  kintai: null,
  chatThreads: [],
  view: 'home'
};

const $ = (id) => document.getElementById(id);
const el = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };

/* ============================ 起動 ============================ */

window.addEventListener('DOMContentLoaded', boot);

async function boot() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { });
  }
  if (!API.url()) {
    document.body.innerHTML =
      '<div class="app" style="padding:40px 20px"><div class="card"><h2>接続先が未設定です</h2>' +
      '<p class="muted">web/config.js の PORTAL_API_URL に、Apps Script ウェブアプリのURLを貼ってください。</p>' +
      '</div></div>';
    return;
  }
  if (!API.token()) return showAuth();
  try {
    const d = await API.call('me');
    S.me = d.me; S.kinds = d.kinds; S.month = d.month;
    showApp();
  } catch (e) {
    API.setToken('');
    showAuth();
  }
}

function showAuth() {
  $('auth').style.display = '';
  $('app').style.display = 'none';
  $('toRegister').onclick = (e) => { e.preventDefault(); $('loginCard').style.display = 'none'; $('registerCard').style.display = ''; };
  $('toLogin').onclick = (e) => { e.preventDefault(); $('registerCard').style.display = 'none'; $('loginCard').style.display = ''; };
  $('btnLogin').onclick = doLogin;
  setupDemoLogin();
  $('btnRegister').onclick = doRegister;
  $('loginPw').onkeydown = (e) => { if (e.key === 'Enter') doLogin(); };
}

function showApp() {
  $('auth').style.display = 'none';
  $('app').style.display = '';
  $('whoami').textContent = `${S.me.name}（${S.me.office || S.me.company}）`;
  if (S.me.role === 'admin' || S.me.role === 'manager') {
    $('btnAdmin').style.display = '';
    $('btnAdmin').onclick = () => location.href = 'admin.html';
  }
  renderHome();
}

/** 検証環境のときだけ、ワンタップで入れるボタンを出す（本番では出ない） */
function setupDemoLogin() {
  const users = window.PORTAL_DEMO;
  if (!Array.isArray(users) || !users.length) return;
  $('demoBox').style.display = '';
  $('demoList').innerHTML = users.map((u, i) =>
    `<div class="item" data-demo="${i}">
       <div class="grow"><div class="title" style="font-size:14px;">${esc(u.label)}</div></div>
       <div class="muted">›</div></div>`).join('');
  $('demoList').querySelectorAll('[data-demo]').forEach(el => el.onclick = async () => {
    const u = users[Number(el.dataset.demo)];
    try {
      const d = await API.call('login', { login_id: u.id, password: u.pw });
      API.setToken(d.token);
      await boot();
    } catch (e) { toast(e.message, 'err'); }
  });
}

async function doLogin() {
  const id = $('loginId').value.trim(), pw = $('loginPw').value;
  if (!id || !pw) return toast('メールアドレスとパスワードを入れてください', 'err');
  $('btnLogin').disabled = true;
  try {
    const d = await API.call('login', { login_id: id, password: pw });
    API.setToken(d.token);
    await boot();
  } catch (e) { toast(e.message, 'err'); }
  finally { $('btnLogin').disabled = false; }
}

async function doRegister() {
  const name = $('regName').value.trim(), bd = $('regBirthday').value;
  const email = $('regEmail').value.trim();
  const pw = $('regPw').value, pw2 = $('regPw2').value;
  if (!name) return toast('お名前を入れてください', 'err');
  if (!bd) return toast('生年月日を入れてください', 'err');
  if (!email) return toast('メールアドレスを入れてください', 'err');
  if (pw !== pw2) return toast('パスワードが一致しません', 'err');
  $('btnRegister').disabled = true;
  try {
    const d = await API.call('register', { name, birthday: bd, email, password: pw });
    API.setToken(d.token);
    // 次から使う番号を、はっきり伝えてから中に入る
    openSheet(`
      <div class="sheet-title"><h2>登録できました</h2></div>
      <p class="muted">ようこそ、${esc(d.me.name)} さん。</p>
      <div class="card" style="text-align:center; margin:14px 0;">
        <div class="muted" style="font-size:13px;">次からのログインに使うID</div>
        <div style="font-size:20px; font-weight:800; margin:6px 0; word-break:break-all;">
          ${esc(d.login_id)}</div>
        <div class="muted" style="font-size:13px;">
          いま決めたパスワードと合わせてお使いください。</div>
      </div>
      <button class="btn primary block" id="regDone">はじめる</button>`);
    $('regDone').onclick = async () => { closeSheet(); await boot(); };
  } catch (e) { toast(e.message, 'err'); }
  finally { $('btnRegister').disabled = false; }
}

/* ============================ 画面切替 ============================ */

/** 画面はトップ1枚だけ。各機能はその場でシートを開く。 */
function switchView() { renderHome(); }


/* ============================ シート ============================ */

function openSheet(html) {
  $('sheet').innerHTML = html;
  $('sheetBg').classList.add('open');
  $('sheetBg').onclick = (e) => { if (e.target === $('sheetBg')) closeSheet(); };
}
function closeSheet() { $('sheetBg').classList.remove('open'); }

/* ============================ ホーム ============================ */

const HOME_CACHE = 'portal_home_cache';

/**
 * ホーム。通信は1回だけ。
 * 前に開いたときの内容を先に描いておき、届いたら差し替える。
 * 打刻ボタンを待たずに押せるようにするため。
 */
async function renderHome() {
  const v = $('v-home');
  let cached = null;
  try {
    const raw = localStorage.getItem(HOME_CACHE);
    if (raw) {
      const c = JSON.parse(raw);
      // 日付が変わっていたら、今日はまだ打刻していない状態から始める
      if (c.date !== new Date().toISOString().slice(0, 10)) {
        c.punch = Object.assign({}, c.punch,
          { punched_in: false, punched_out: false, record: null });
      }
      cached = c;
    }
  } catch (e) { /* 読めなければ黙って捨てる */ }

  if (cached) drawHome(v, cached, true);
  else v.innerHTML = '<div class="loading">読み込み中…</div>';

  try {
    const d = await API.call('home');
    S.month = d.month;
    try { localStorage.setItem(HOME_CACHE, JSON.stringify(d)); } catch (e) { }
    drawHome(v, d, false);
    if (!S.qrHandled) { S.qrHandled = true; await handleQrParam(); }
  } catch (e) {
    if (cached) toast('最新の状態を取れませんでした', 'err');
    else v.innerHTML = `<div class="card"><p class="muted">${esc(e.message)}</p>
      <button class="btn block" onclick="renderHome()">もう一度</button></div>`;
  }
}

const INSTALL_TIP_KEY = 'portal_install_tip';

/** ブラウザで開いているときだけ、ホーム画面への追加をすすめる */
function installTip() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  if (standalone) return '';
  try { if (localStorage.getItem(INSTALL_TIP_KEY)) return ''; } catch (e) { }
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  return `
    <div class="install-tip" id="installTip">
      <div class="ic">📲</div>
      <div class="body">
        <b>ホーム画面に追加すると便利です</b>
        ${ios ? '下の <b style="display:inline">共有</b> ボタン → 「ホーム画面に追加」'
              : 'メニュー（⋮）→「ホーム画面に追加」'}
        を押すと、アプリのように開けます。
      </div>
      <button id="installTipClose" aria-label="閉じる">×</button>
    </div>`;
}

function drawHome(v, d, stale) {
  S.punch = d.punch;
  S.home = d;
  const hour = new Date().getHours();
  const greet = hour < 11 ? 'おはようございます' : 'おつかれさまです';
  const r = (d.punch && d.punch.record) || {};

  // 気づいてほしいことは、ボタンの右肩に数で出す
  const lateUnreported = (d.unreported || []).length;
  const menu = [
    { k: 'kintai',  ic: '📅', label: '勤怠',        badge: lateUnreported },
    { k: 'leave',   ic: '🌴', label: '休暇の申請',   badge: 0 },
    { k: 'ot',      ic: '🌙', label: '残業の申請',   badge: 0 },
    { k: 'expense', ic: '🚃', label: '通勤交通費',   badge: d.expense_done ? 0 : 1 },
    { k: 'chat',    ic: '💬', label: '総務に連絡',   badge: d.unread_chat || 0 },
    { k: 'apply',   ic: '📋', label: '届出・証明書', badge: 0 },
    { k: 'doc',     ic: '📎', label: '書類の提出',   badge: d.doc_wait || 0 },
    { k: 'sign',    ic: '✍️', label: '雇用契約',     badge: d.sign_wait || 0 },
    { k: 'setting', ic: '⚙️', label: '設定',        badge: 0 }
  ];

  // 入社前の方には、書類と連絡だけを出す。打刻や有給は入社日から。
  const pre = !!(d.me && d.me.pre_hire);
  const preMenu = [
    { k: 'doc',     ic: '📎', label: '書類の提出',   badge: d.doc_wait || 0 },
    { k: 'sign',    ic: '✍️', label: '雇用契約',     badge: d.sign_wait || 0 },
    { k: 'chat',    ic: '💬', label: '総務に連絡',   badge: d.unread_chat || 0 },
    { k: 'setting', ic: '⚙️', label: '設定',        badge: 0 }
  ];

  // 入社したばかりの方には、まず手続きを出す。出し終われば自然に消える。
  const docCard = d.doc_wait ? `
    <div class="card first-task">
      <h2 style="margin-bottom:10px;">書類のご提出をお願いします</h2>
      <div class="progress"><span style="width:${
        Math.round((d.doc_done / Math.max(1, d.doc_total)) * 100)}%"></span></div>
      <p class="muted" style="margin:8px 0 0;">
        ${d.doc_done} / ${d.doc_total} 済み　のこり ${d.doc_wait}件</p>
      <p class="muted" style="margin:6px 0 0;">
        スマホで撮った写真をそのまま送れます。
        ぜんぶ出し終わると、この案内は消えます。</p>
      <button class="btn primary block" id="homeDocs" style="margin-top:12px;">
        書類を出す</button>
    </div>` : '';

  // 月末の確認。期限（翌月2日）が近いので、打刻より上に出す
  const cf = d.confirm;
  const confirmCard = cf ? `
    <div class="card first-task">
      <h2 style="margin-bottom:8px;">${monthLabel(cf.month)}の勤怠をご確認ください</h2>
      <p class="muted" style="margin:0 0 10px;">
        ${cf.overdue
          ? `<b style="color:var(--warn)">期限（${fmtYmd(cf.deadline)}）を過ぎています。</b>`
          : `${fmtYmd(cf.deadline)} までにお願いします。`}
        中身を見て、間違いがなければ確認のボタンを押してください。
      </p>
      <div class="stats" style="margin-bottom:10px;">
        <div class="stat"><b>${cf.summary.work_days}</b><span>出勤</span></div>
        <div class="stat"><b>${Math.round(cf.summary.total_min / 6) / 10}</b><span>総労働h</span></div>
        <div class="stat"><b>${cf.summary.paid_days}</b><span>有給</span></div>
        <div class="stat"><b>${Math.round(cf.summary.overtime_min / 6) / 10}</b><span>残業h</span></div>
      </div>
      <div class="btn-row">
        <button class="btn" id="cfOpen">中身を見る</button>
        <button class="btn primary" id="cfDo">確認しました</button>
      </div>
    </div>` : '';

  if (pre) {
    const joinTxt = d.me.join_date ? fmtYmd(d.me.join_date) : '';
    v.innerHTML = `
      <div class="card first-task">
        <h2 style="margin-bottom:8px;">ご入社の準備をお願いします</h2>
        <p class="muted" style="margin:0 0 10px;">
          ${esc(d.me.name)} さん、ようこそ。
          ${joinTxt ? `入社日は <b>${joinTxt}</b> の予定です。` : ''}
          入社の日をスムーズに迎えられるよう、先に書類のご提出をお願いしています。</p>
        <div class="progress"><span style="width:${
          Math.round((d.doc_done / Math.max(1, d.doc_total)) * 100)}%"></span></div>
        <p class="muted" style="margin:8px 0 0;">
          ${d.doc_done} / ${d.doc_total} 済み${d.doc_wait ? `　のこり ${d.doc_wait}件` : '　ありがとうございました'}</p>
        <button class="btn primary block" id="homeDocs" style="margin-top:12px;">
          ${d.doc_wait ? '書類を出す' : '提出したものを見る'}</button>
      </div>

      ${installTip()}

      <div class="card">
        <div class="card-head"><h2>出していただくもの</h2></div>
        <ul class="plain-list">
          <li>マイナンバーカード（表と裏）</li>
          <li>顔写真（職員名簿に使います。スマホで撮ったもので大丈夫です）</li>
          <li>免許証のコピー</li>
          <li>給与振込先の届出</li>
          <li>誓約書（お読みいただき「了承する」を押してください）</li>
        </ul>
        <p class="muted" style="margin:10px 0 0;">
          資格証明書などは、お持ちの方だけで結構です。</p>
      </div>

      <div class="menu-grid">
        ${preMenu.map(m => `<button class="menu-btn" data-k="${m.k}">
          ${m.badge ? `<span class="menu-badge">${m.badge}</span>` : ''}
          <span class="ic">${m.ic}</span>${esc(m.label)}</button>`).join('')}
      </div>

      <div class="card">
        <p class="muted" style="margin:0;">
          打刻・有給・交通費などは、入社日${joinTxt ? `（${joinTxt}）` : ''}から使えるようになります。<br>
          分からないことは「総務に連絡」からお気軽にどうぞ。</p>
      </div>`;

    if ($('installTipClose')) $('installTipClose').onclick = () => {
      try { localStorage.setItem(INSTALL_TIP_KEY, '1'); } catch (e) { }
      $('installTip').remove();
    };
    $('homeDocs').onclick = () => openDocList();
    const preOpen = { doc: openDocList, sign: openSignList,
                      chat: openChatSheet, setting: openSettingSheet };
    v.querySelectorAll('[data-k]').forEach(b => b.onclick = () => preOpen[b.dataset.k]());
    return;
  }

  v.innerHTML = `
    ${confirmCard}
    ${docCard}
    ${installTip()}
    ${punchCard(d.punch, stale)}
    ${treatmentCard(d)}
    ${driveCard(d)}

    ${(r.late_min || r.early_min) && !r.reported_at ? `
      <div class="card" style="border-color:var(--warn);">
        <p style="margin:0 0 10px;">
          今日は${r.late_min ? fmtMin(r.late_min) + 'の遅刻' : fmtMin(r.early_min) + 'の早退'}が
          記録されています。理由をお知らせください。</p>
        <button class="btn block" id="homeReason"
          style="border-color:var(--warn); color:var(--warn);">理由を報告する</button>
      </div>` : ''}

    <div class="menu-grid">
      ${menu.map(m => `<button class="menu-btn" data-k="${m.k}">
        ${m.badge ? `<span class="menu-badge">${m.badge}</span>` : ''}
        <span class="ic">${m.ic}</span>${esc(m.label)}</button>`).join('')}
    </div>

    <div class="card">
      <p style="margin:0 0 4px;">${greet}、<b>${esc(d.me ? d.me.name : S.me.name)}</b> さん</p>
      <div class="muted">${monthLabel(d.month)}のようす</div>
      <div class="stats" style="margin-top:12px;">
        <div class="stat"><b>${d.summary.work_days}</b><span>出勤</span></div>
        <div class="stat"><b>${Math.round(d.summary.total_min / 6) / 10}</b><span>総労働h</span></div>
        <div class="stat"><b>${d.balance.remain}</b><span>有給残</span></div>
        <div class="stat"><b>${Math.round(d.summary.overtime_min / 6) / 10}</b><span>残業h</span></div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h2>お知らせ</h2></div>
      ${d.notices.length ? `<div class="list">${
        d.notices.map(n => `<div class="item" data-n="${esc(n.id)}">
          <div class="grow">
            <div class="title">${n.important === 'yes' ? '<span class="badge warn">重要</span> ' : ''}${esc(n.title)}</div>
            <div class="meta">${fmtDateTime(n.published_at)}</div>
          </div></div>`).join('')}</div>`
        : '<div class="empty-state">お知らせはありません</div>'}
    </div>`;

  if ($('installTipClose')) $('installTipClose').onclick = () => {
    try { localStorage.setItem(INSTALL_TIP_KEY, '1'); } catch (e) { }
    $('installTip').remove();
  };
  if ($('punchIn')) $('punchIn').onclick = () => doPunch('in');
  if ($('punchQr')) $('punchQr').onclick = () => openQrScanner();
  if ($('punchOut')) $('punchOut').onclick = () => doPunch('out');
  if ($('punchReason')) $('punchReason').onclick = () => openReasonSheet(d.punch.date);
  if ($('homeReason')) $('homeReason').onclick = () => openReasonSheet(r.date);
  if ($('homeDocs')) $('homeDocs').onclick = () => openDocList();
  if ($('cfOpen')) $('cfOpen').onclick = () => { S.month = cf.month; openKintaiSheet(); };
  if ($('cfDo')) $('cfDo').onclick = () => confirmMonth(cf.month);
  if ($('treatReport')) $('treatReport').onclick = () => openTreatmentForm();
  if ($('treatMonth')) $('treatMonth').onclick = () => openTreatmentMonth();
  if ($('driveStart')) $('driveStart').onclick = () => openDriveStart();
  if ($('driveEnd')) $('driveEnd').onclick = () => openDriveEnd(d.driving);
  if ($('driveHelp')) $('driveHelp').onclick = () => openIncidentGuide();

  const open = {
    kintai: openKintaiSheet, leave: openLeaveSheet, ot: openOvertimeSheet,
    expense: openExpenseSheet, chat: openChatSheet, apply: openApplyList,
    doc: openDocList, sign: openSignList, setting: openSettingSheet
  };
  v.querySelectorAll('[data-k]').forEach(b => b.onclick = () => open[b.dataset.k]());

  v.querySelectorAll('[data-n]').forEach(node =>
    node.onclick = () => {
      const n = d.notices.find(x => x.id === node.dataset.n);
      openSheet(`<div class="sheet-title"><h2>${esc(n.title)}</h2>
        <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
        <div class="muted" style="margin-bottom:10px;">${fmtDateTime(n.published_at)}　${esc(n.author || '')}</div>
        <div style="white-space:pre-wrap;">${esc(n.body)}</div>
        ${n.attachment_url ? `<a class="btn block" style="margin-top:14px;"
           href="${esc(n.attachment_url)}" target="_blank" rel="noopener">添付を開く</a>` : ''}`);
    });
}

/* ============================ 勤怠 ============================ */

function daysOfMonth(month) {
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
  const n = new Date(y, m, 0).getDate();
  const out = [];
  for (let d = 1; d <= n; d++) out.push(`${month}-${String(d).padStart(2, '0')}`);
  return out;
}
const monthLabel = (m) => `${Number(m.slice(0, 4))}年${Number(m.slice(5, 7))}月`;
const shiftMonth = (m, delta) => {
  const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

async function openKintaiSheet() {
  openSheet(`
    <div class="sheet-title"><h2>勤怠</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <div id="kintaiBody"><div class="loading">読み込み中…</div></div>`);
  renderKintai();
}

async function renderKintai() {
  const v = $('kintaiBody');
  if (!v) return;
  try {
    const k = await API.call('attendance.month', { month: S.month });
    S.kintai = k;
    const days = daysOfMonth(S.month);
    const today = new Date().toISOString().slice(0, 10);
    const DOW = ['日', '月', '火', '水', '木', '金', '土'];
    const corrs = k.corrections || {};

    const rows = days.map(date => {
      const rec = k.days[date];
      const dow = new Date(date).getDay();
      const future = date > today;
      const corr = corrs[date];
      const color = dow === 0 ? 'color:var(--danger)' : dow === 6 ? 'color:#4a7fb5' : '';
      const hours = rec && rec.work_min ? (Math.round(rec.work_min / 6) / 10) + 'h' : '';
      const times = rec && (rec.start || rec.end)
        ? `${esc(rec.start || '—')} 〜 ${esc(rec.end || '—')}` : '';
      const dim = future && !rec;
      return `<div class="day-row ${date === today ? 'today' : ''} ${dim ? 'future' : ''}"
                   data-d="${date}">
        <div class="day-date" style="${color}">
          <b>${Number(date.slice(8, 10))}</b><span>${DOW[dow]}</span></div>
        <div class="grow">
          ${rec ? `<div class="day-kind">
              <span class="badge ${rec.kind === '出勤' ? 'ok' : ''}">${esc(rec.kind)}</span>
              ${rec.late_min ? `<span class="badge warn">${fmtMin(rec.late_min)}遅刻</span>` : ''}
              ${rec.early_min ? `<span class="badge warn">${fmtMin(rec.early_min)}早退</span>` : ''}
              ${rec.ot_approved_min ? `<span class="badge">残業${fmtMin(rec.ot_approved_min)}</span>` : ''}
            </div>
            ${times ? `<div class="meta">${times}${hours ? '　実働 ' + hours : ''}</div>` : ''}`
          : `<div class="meta">${future ? 'これから'
              : corr && corr.status === '申請中' ? '<span class="badge warn">申告ちゅう</span>'
              : 'お休み'}</div>`}
        </div>
        ${dim ? '' : '<div class="muted">›</div>'}
      </div>`;
    }).join('');

    v.innerHTML = `
      <div class="cal-head">
        <button class="btn sm ghost" id="prevM">‹</button>
        <div style="text-align:center;">
          <b>${monthLabel(S.month)}</b>
          <div class="muted" style="font-size:11px;">有給残 ${k.balance.remain}日</div>
        </div>
        <button class="btn sm ghost" id="nextM">›</button>
      </div>
      <div class="stats" style="margin-bottom:14px;">
        <div class="stat"><b>${k.summary.work_days}</b><span>出勤</span></div>
        <div class="stat"><b>${Math.round(k.summary.total_min / 6) / 10}</b><span>総労働h</span></div>
        <div class="stat"><b>${Math.round(k.summary.overtime_min / 6) / 10}</b><span>残業h</span></div>
        <div class="stat"><b>${k.summary.paid_days}</b><span>有給</span></div>
      </div>
      <p class="muted">
        出退勤は打刻ボタンで記録されます。打刻のない日はお休みとして扱います。
        打刻を忘れた日や内容が違う日は、日付を押して総務に申告してください。
      </p>
      <div class="day-list">${rows}</div>
      ${k.status.locked === 'yes'
        ? '<p class="muted" style="margin-top:12px;">この月は総務が締めました。</p>'
        : k.status.confirmed_at
        ? `<p class="muted" style="margin-top:12px;">
             ${fmtDateTime(k.status.confirmed_at)} に確認ずみです。</p>`
        : `<button class="btn primary block" id="kConfirm" style="margin-top:14px;">
             この月の内容を確認しました</button>`}`;

    $('prevM').onclick = () => { S.month = shiftMonth(S.month, -1); renderKintai(); };
    $('nextM').onclick = () => { S.month = shiftMonth(S.month, 1); renderKintai(); };
    v.querySelectorAll('.day-row:not(.future)').forEach(c =>
      c.onclick = () => openDaySheet(c.dataset.d));
    if ($('kConfirm')) $('kConfirm').onclick = async () => {
      await confirmMonth(S.month);
      renderKintai();
    };

    const list = v.querySelector('.day-list');
    const t = v.querySelector('.day-row.today');
    if (list && t) list.scrollTop = t.offsetTop - list.clientHeight / 2 + t.clientHeight / 2;
  } catch (e) {
    v.innerHTML = `<p class="muted">${esc(e.message)}</p>`;
  }
}

function openDaySheet(date) {
  const k = S.kintai;
  const rec = k.days[date] || {};
  const locked = k.status.locked === 'yes';
  const corr = (k.corrections || {})[date];
  const d = new Date(date);
  const dowName = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  const punched = !!(rec.punch_in_at || rec.punch_out_at);

  const body = [];
  if (rec.kind) {
    body.push(`<div class="item" style="cursor:default; margin-bottom:12px;">
      <div class="grow">
        <div class="title">${esc(rec.kind)}
          ${rec.late_min ? `<span class="badge warn">${fmtMin(rec.late_min)}の遅刻</span>` : ''}
          ${rec.early_min ? `<span class="badge warn">${fmtMin(rec.early_min)}の早退</span>` : ''}</div>
        ${rec.start || rec.end ? `<div class="meta">${esc(rec.start || '—')} 〜 ${esc(rec.end || '—')}
          ${rec.work_min ? '　実働 ' + (Math.round(rec.work_min / 6) / 10) + 'h' : ''}</div>` : ''}
        <div class="meta">${punched ? '打刻で記録されました' : esc(rec.note || '')}</div>
        ${rec.reported_at ? `<div class="meta">報告ずみ：${esc(rec.reason_type || '')} ${esc(rec.reason || '')}</div>` : ''}
      </div></div>`);
  } else {
    body.push('<p class="muted">この日は打刻がありません。お休みとして扱われます。</p>');
  }

  if (locked) {
    body.push('<p class="muted">提出ずみのため申告できません。総務にご連絡ください。</p>');
  } else if (corr && corr.status === '申請中') {
    body.push(`<p class="muted">この日は申告ずみです。総務の確認をお待ちください。</p>
      <button class="btn danger block" id="dCorrCancel">申告を取り消す</button>`);
  } else {
    if (rec.late_min || rec.early_min) {
      body.push(`<button class="btn block" id="dReason" style="margin-bottom:10px;
        border-color:var(--warn); color:var(--warn);">
        ${rec.reported_at ? '報告した理由を出し直す' : '遅刻・早退の理由を報告する'}</button>`);
    }
    body.push(`<button class="btn primary block" id="dCorrect">
      ${rec.kind ? 'この日の記録について申告する' : '打刻を忘れた・欠勤したなどの申告'}</button>
      <p class="muted" style="margin-top:10px;">
        有給や特別休暇をとりたいときは「申請」タブからお願いします。</p>`);
  }

  openSheet(`
    <div class="sheet-title">
      <h2>${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日（${dowName}）</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button>
    </div>
    ${body.join('')}`);

  if ($('dReason')) $('dReason').onclick = () => openReasonSheet(date);
  if ($('dCorrect')) $('dCorrect').onclick = () => openCorrectionForm(date, rec);
  if ($('dCorrCancel')) $('dCorrCancel').onclick = async () => {
    try { await API.call('correction.cancel', { id: corr.id }); closeSheet(); toast('取り消しました'); openKintaiSheet(); }
    catch (e) { toast(e.message, 'err'); }
  };
}

/** 勤怠についての申告（打刻忘れ・時刻の訂正・欠勤など）を総務に送る */
function openCorrectionForm(date, rec) {
  const k = S.kintai || {};
  const reasons = k.correction_reasons || [];
  const sh = (S.punch && S.punch.shift) || {};
  // 理由から、勤怠にどう入れるかを決める
  const kindOf = (r) => r === '欠勤しました' ? '欠勤' : r === 'そのほか' ? 'その他' : '出勤';
  const needsTime = (r) => kindOf(r) === '出勤';

  openSheet(`
    <div class="sheet-title"><h2>勤怠の申告</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <p class="muted">${fmtDate(date)}　どうされましたか。総務が確認して勤怠に反映します。
      この内容はそのままでは記録されません。</p>

    <div class="kind-grid" id="crGrid" style="grid-template-columns:1fr;">
      ${reasons.map(r => `<button class="kind-btn" data-r="${esc(r)}"
        style="text-align:left; padding:12px 14px;">${esc(r)}</button>`).join('')}
    </div>

    <div id="crTime" style="display:none;">
      <p class="muted">実際に働いた時刻を書いてください。</p>
      <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px;">
        <label class="field"><span>出勤</span>
          <input type="time" id="cStart" value="${esc(rec.start || sh.start || '09:00')}"></label>
        <label class="field"><span>退勤</span>
          <input type="time" id="cEnd" value="${esc(rec.end || sh.end || '18:00')}"></label>
        <label class="field"><span>休憩(分)</span>
          <input type="number" id="cBreak" value="${esc(rec.break_min || '60')}"></label>
      </div>
    </div>

    <label class="field"><span>そのときの事情</span>
      <textarea id="cReason" style="min-height:80px;"
        placeholder="例）朝、利用者さんの対応が続いていて押しそびれました"></textarea></label>
    <button class="btn primary block" id="cSend">総務に送る</button>`);

  let picked = '';
  $('crGrid').querySelectorAll('.kind-btn').forEach(b => b.onclick = () => {
    picked = b.dataset.r;
    $('crGrid').querySelectorAll('.kind-btn').forEach(x => x.classList.toggle('on', x === b));
    $('crTime').style.display = needsTime(picked) ? '' : 'none';
    // 「退勤の打刻を忘れた」なら、出勤時刻は打刻ずみの値を使う
    if (picked === '退勤の打刻を忘れた' && rec.start) $('cStart').value = rec.start;
  });

  $('cSend').onclick = async () => {
    if (!picked) return toast('どれか選んでください', 'err');
    const btn = $('cSend'); btn.disabled = true; btn.textContent = '送信中…';
    try {
      const payload = { date, kind: kindOf(picked), reason_type: picked,
                        reason: $('cReason').value };
      if (needsTime(picked)) {
        payload.start = $('cStart').value;
        payload.end = $('cEnd').value;
        payload.break_min = $('cBreak').value;
      }
      await API.call('correction.create', payload);
      closeSheet(); toast('総務に送りました'); openKintaiSheet();
    } catch (e) { toast(e.message, 'err'); btn.disabled = false; btn.textContent = '総務に送る'; }
  };
}

async function saveDays(days) {
  try {
    await API.call('attendance.save', { month: S.month, days });
    closeSheet();
    toast('保存しました');
    renderKintai();
  } catch (e) { toast(e.message, 'err'); }
}



/* ============================ 休暇の申請 ============================ */

/* ---- 休暇 ---- */

async function openLeaveSheet() {
  openSheet(`
    <div class="sheet-title"><h2>休暇の申請</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <div id="leaveBody"><div class="loading">読み込み中…</div></div>`);
  await renderLeaveBody();
}

async function renderLeaveBody() {
  const v = $('leaveBody');
  if (!v) return;
  try {
    const d = await API.call('leave.mine');
    const b = d.balance;
    v.innerHTML = `
      <div class="stats" style="margin-bottom:12px;">
        <div class="stat"><b>${b.remain}</b><span>残り日数</span></div>
        <div class="stat"><b>${b.granted}</b><span>付与</span></div>
        <div class="stat"><b>${b.used}</b><span>取得済</span></div>
        <div class="stat"><b>${b.pending}</b><span>申請中</span></div>
      </div>
      <p class="muted">いま申請できるのは <b>${b.available}日</b> です。</p>
      ${d.duty && d.duty.target && !d.duty.done ? `
        <p class="muted" style="color:var(--warn);">
          ${fmtYmd(d.duty.to)}までに、あと <b>${d.duty.need}日</b> 取得する必要があります
          （年5日の取得は法律で決まっています）。</p>` : ''}
      ${d.duty && d.duty.done ? `
        <p class="muted">今年度の取得日数は ${d.duty.taken}日です。年5日の取得は達成しています。</p>` : ''}
      <button class="btn primary block" style="margin:12px 0;" id="newLeave">休暇を申請する</button>

      ${d.requests.length ? `<div class="list">${d.requests.map(r => `
        <div class="item" style="cursor:default;">
          <div class="grow">
            <div class="title">${esc(r.type)}　${fmtDate(r.start_date)}${r.start_date !== r.end_date ? '〜' + fmtDate(r.end_date) : ''}</div>
            <div class="meta">${r.days}日 ・ 申請 ${fmtDateTime(r.created_at)}
              ${r.comment ? '<br>' + esc(r.comment) : ''}</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
            <span class="badge ${r.status === '承認' ? 'ok' : r.status === '却下' ? 'warn' : ''}">${esc(r.status)}</span>
            ${r.status === '申請中' ? `<button class="btn sm ghost" data-cancel="${esc(r.id)}">取消</button>` : ''}
          </div>
        </div>`).join('')}</div>`
      : '<div class="empty-state">まだ申請はありません</div>'}`;

    $('newLeave').onclick = () => openLeaveForm(b, d.types);
    v.querySelectorAll('[data-cancel]').forEach(btn => btn.onclick = async () => {
      if (!confirm('この申請を取り消しますか？')) return;
      try { await API.call('leave.cancel', { id: btn.dataset.cancel }); toast('取り消しました'); renderLeaveBody(); }
      catch (e) { toast(e.message, 'err'); }
    });
  } catch (e) { v.innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
}

/* ---- 残業 ---- */

async function openOvertimeSheet() {
  openSheet(`
    <div class="sheet-title"><h2>残業の申請</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <div id="otBody"><div class="loading">読み込み中…</div></div>`);
  await renderOvertimeBody();
}

async function renderOvertimeBody() {
  const v = $('otBody');
  if (!v) return;
  try {
    const ot = await API.call('overtime.mine', { month: S.month });
    v.innerHTML = `
      <p class="muted">
        残業は<b>前もっての申請と承認が必要</b>です。申請のない超過分は残業になりません。
        打刻を押し忘れて遅い時刻になってしまった場合も、ここから事情を書いて申請してください。
      </p>
      <p class="muted">所定 ${Math.round(ot.scheduled_min / 6) / 10}時間</p>
      <button class="btn primary block" style="margin:12px 0;" id="newOt">残業を申請する</button>
      ${ot.requests.length ? `<div class="list">${ot.requests.map(r => `
        <div class="item" style="cursor:default;">
          <div class="grow">
            <div class="title">${fmtDate(r.date)}　${r.minutes}分
              <span class="badge">${esc(r.timing)}</span></div>
            <div class="meta">${esc(r.reason)}${r.comment ? '<br>' + esc(r.comment) : ''}</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
            <span class="badge ${r.status === '承認' ? 'ok' : r.status === '却下' ? 'warn' : ''}">${esc(r.status)}</span>
            ${r.status === '申請中' ? `<button class="btn sm ghost" data-otcancel="${esc(r.id)}">取消</button>` : ''}
          </div>
        </div>`).join('')}</div>`
      : '<div class="empty-state">この月の申請はありません</div>'}`;

    $('newOt').onclick = () => openOvertimeForm();
    v.querySelectorAll('[data-otcancel]').forEach(btn => btn.onclick = async () => {
      if (!confirm('この申請を取り消しますか？')) return;
      try { await API.call('overtime.cancel', { id: btn.dataset.otcancel }); toast('取り消しました'); renderOvertimeBody(); }
      catch (e) { toast(e.message, 'err'); }
    });
  } catch (e) { v.innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
}

/* ---- 通勤交通費 ---- */

async function openExpenseSheet() {
  openSheet(`
    <div class="sheet-title"><h2>通勤交通費</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <div id="exBody"><div class="loading">読み込み中…</div></div>`);
  await renderExpenseBody();
}

async function renderExpenseBody() {
  const v = $('exBody');
  if (!v) return;
  try {
    const ex = await API.call('expense.mine', { month: S.month });
    S.expense = ex;
    v.innerHTML = `
      <p class="muted">${monthLabel(ex.month)}ぶん</p>
      ${ex.current ? `
        <div class="item" style="cursor:default;">
          <div class="grow">
            <div class="title">${Number(ex.current.amount).toLocaleString()}円
              <span class="badge">${esc(ex.current.method || '電車・バス')}</span>
              ${ex.current.pass_months ? `<span class="badge">${esc(ex.current.pass_months)}か月定期</span>` : ''}
              ${ex.current.distance_km ? `<span class="badge">片道${esc(ex.current.distance_km)}km</span>` : ''}</div>
            <div class="meta">${esc(ex.current.route)}
              ${ex.current.valid_from ? '<br>' + fmtDate(ex.current.valid_from)
                + (ex.current.valid_to ? ' 〜 ' + fmtDate(ex.current.valid_to) : '') : ''}
              ${ex.current.comment ? '<br>' + esc(ex.current.comment) : ''}</div>
          </div>
          <span class="badge ${ex.current.status === '承認' ? 'ok'
            : ex.current.status === '却下' ? 'warn' : ''}">${esc(ex.current.status)}</span>
        </div>
        ${ex.current.status !== '承認'
          ? `<button class="btn block" id="newEx" style="margin-top:10px;">出し直す</button>` : ''}`
      : `<p class="muted">まだ出していません。電車・バスの方は定期券の領収書の写真を添えてください。</p>
         <button class="btn primary block" id="newEx" style="margin-top:10px;">
           通勤交通費を出す</button>`}
      ${ex.expiring ? `<p class="muted" style="margin-top:10px; color:var(--warn);">
        定期の期限が近づいています。買い直したら新しい領収書を送ってください。</p>` : ''}

      ${ex.history.filter(h => h.month !== ex.month).length ? `
        <h3 style="margin:18px 0 8px;">これまで</h3>
        <div class="list">${ex.history.filter(h => h.month !== ex.month).slice(0, 6).map(h => `
          <div class="item" style="cursor:default;">
            <div class="grow">
              <div class="title" style="font-size:14px;">${esc(h.month.replace('-', '年'))}月　
                ${Number(h.amount).toLocaleString()}円</div>
              <div class="meta">${esc(h.route || '')}</div>
            </div>
            <span class="badge ${h.status === '承認' ? 'ok' : ''}">${esc(h.status)}</span>
          </div>`).join('')}</div>` : ''}`;

    if ($('newEx')) $('newEx').onclick = () => openExpenseForm(ex);
  } catch (e) { v.innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
}

function openLeaveForm(balance, types) {
  types = types || [{ name: '年次有給休暇', kind: '有給', paid: true, reason: false, help: '' }];
  const today = new Date().toISOString().slice(0, 10);
  openSheet(`
    <div class="sheet-title"><h2>休暇の申請</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <label class="field"><span>種類</span>
      <select id="lType">
        ${types.map(t => `<option value="${esc(t.name)}">${esc(t.name)}</option>`).join('')}
      </select></label>
    <p class="muted" id="lHelp" style="margin-top:-6px;"></p>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
      <label class="field"><span>開始日</span><input type="date" id="lStart" value="${today}"></label>
      <label class="field"><span>終了日</span><input type="date" id="lEnd" value="${today}"></label>
    </div>
    <label class="field"><span>日数</span><input type="number" id="lDays" step="0.5" value="1"></label>
    <label class="field"><span id="lReasonLabel">理由（任意）</span>
      <input type="text" id="lReason" placeholder="私用のため 等"></label>
    <p class="muted" id="lNote"></p>
    <p class="muted" id="lRemain">申請できる残り：${balance.available}日</p>
    <button class="btn primary block" id="lSubmit">申請する</button>`);

  const typeOf = () => types.find(t => t.name === $('lType').value) || types[0];

  const recalc = () => {
    const t = typeOf();
    const s = $('lStart').value, e = $('lEnd').value;
    if (t.name === '半休') { $('lDays').value = 0.5; $('lEnd').value = s; }
    else if (s && e && e >= s) {
      $('lDays').value = Math.round((new Date(e) - new Date(s)) / 86400000) + 1;
    }

    $('lHelp').textContent = t.help || '';
    $('lReasonLabel').textContent = t.reason ? '理由（必ず書いてください）' : '理由（任意）';
    $('lReason').placeholder = t.reason ? '事情を書いてください' : '私用のため 等';
    $('lRemain').style.display = t.paid ? '' : 'none';

    // 病気で続けて休むときは、傷病手当金の対象になることがある。
    // 総務に相談すれば手続きできる、ということだけ伝えておく。
    const days = Number($('lDays').value) || 0;
    $('lNote').innerHTML = (t.name === '病欠' && days >= 4)
      ? '4日以上続けてお休みされる場合、健康保険の<b>傷病手当金</b>を受け取れることがあります。'
        + '「総務に連絡」からご相談ください。'
      : '';
  };
  $('lStart').onchange = recalc;
  $('lEnd').onchange = recalc;
  $('lType').onchange = recalc;
  $('lDays').oninput = recalc;
  recalc();

  $('lSubmit').onclick = async () => {
    const t = typeOf();
    if (t.reason && !$('lReason').value.trim()) {
      return toast(`「${t.name}」は理由を書いてください`, 'err');
    }
    const b = $('lSubmit'); b.disabled = true; b.textContent = '送信中…';
    try {
      await API.call('leave.create', {
        // 半休は、勤怠のうえでは有給の0.5日として扱う
        type: t.name === '半休' ? '年次有給休暇' : t.name,
        start_date: $('lStart').value, end_date: $('lEnd').value,
        days: Number($('lDays').value), reason: $('lReason').value
      });
      closeSheet(); toast('申請しました'); openLeaveSheet();
    } catch (e) {
      toast(e.message, 'err');
      b.disabled = false; b.textContent = '申請する';
    }
  };
}

/* ============================ 総務への連絡 ============================ */

async function openChatSheet() {
  openSheet(`
    <div class="sheet-title"><h2>総務への連絡</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <div id="chatBody"><div class="loading">読み込み中…</div></div>`);
  await renderChat();
}

async function renderChat() {
  const v = $('chatBody');
  if (!v) return;
  try {
    const d = await API.call('chat.threads');
    S.chatThreads = d.threads;
    v.innerHTML = `
      <button class="btn primary block" id="newThread" style="margin-bottom:14px;">
        総務に相談・連絡する</button>
      ${d.threads.length ? `<div class="list">${d.threads.map(t => `
        <div class="item" data-t="${esc(t.id)}">
          <div class="grow">
            <div class="title">${esc(t.subject)}
              ${t.unread ? '<span class="badge dot">新着</span>' : ''}</div>
            <div class="meta">${esc(t.category)} ・ ${fmtDateTime(t.updated_at)}</div>
          </div>
          <span class="badge ${t.status === '完了' ? 'ok' : ''}">${esc(t.status)}</span>
        </div>`).join('')}</div>`
      : `<div class="empty-state">
           まだやりとりはありません。<br>
           勤怠のこと、給与のこと、書類のこと、何でもどうぞ。</div>`}
      <p class="muted" style="margin-top:16px;">
        ※ お急ぎのご用件は、これまでどおりお電話でもご連絡ください。</p>`;
    $('newThread').onclick = () => openNewThread(d.categories);
    v.querySelectorAll('[data-t]').forEach(n => n.onclick = () => openThread(n.dataset.t));
  } catch (e) { v.innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
}

function openNewThread(categories) {
  openSheet(`
    <div class="sheet-title"><h2>総務への連絡</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <label class="field"><span>種類</span>
      <select id="tCat">${categories.map(c => `<option>${esc(c)}</option>`).join('')}</select></label>
    <label class="field"><span>件名</span>
      <input type="text" id="tSubject" placeholder="例）交通費の申請について"></label>
    <label class="field"><span>内容</span>
      <textarea id="tBody" placeholder="ご用件をお書きください"></textarea></label>
    <label class="field"><span>写真を添える（任意）</span>
      <input type="file" id="tFile" accept="image/*,application/pdf"></label>
    <button class="btn primary block" id="tSend">送信する</button>`);

  $('tSend').onclick = async () => {
    const btn = $('tSend'); btn.disabled = true; btn.textContent = '送信中…';
    try {
      const f = $('tFile').files[0];
      const file = f ? await shrinkImage(f) : null;
      await API.call('chat.create', {
        category: $('tCat').value, subject: $('tSubject').value,
        body: $('tBody').value, file
      });
      closeSheet(); toast('総務に送りました'); openChatSheet();
    } catch (e) { toast(e.message, 'err'); btn.disabled = false; btn.textContent = '送信する'; }
  };
}

async function openThread(id) {
  try {
    const d = await API.call('chat.messages', { id });
    openSheet(`
      <div class="sheet-title"><h2>${esc(d.thread.subject)}</h2>
        <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
      <div class="chat" id="chatBox">
        ${d.messages.map(m => `
          <div class="bubble ${m.from_side}">
            <div class="who">${m.from_side === 'admin' ? '総務 ' + esc(m.from_name) : 'あなた'}</div>
            ${esc(m.body)}
            ${m.file_url ? `<div style="margin-top:6px;">
              <a href="#" data-msgfile="${esc(m.id)}" style="color:inherit;">📎 ${esc(m.file_name)}</a></div>` : ''}
            <div class="time">${fmtDateTime(m.created_at)}</div>
          </div>`).join('')}
      </div>
      <div style="margin-top:14px;">
        <textarea id="mBody" placeholder="返信を書く" style="min-height:70px;"></textarea>
        <label class="field" style="margin-top:8px;"><span>写真を添える（任意）</span>
          <input type="file" id="mFile" accept="image/*,application/pdf"></label>
        <button class="btn primary block" id="mSend">送信</button>
      </div>`);
    $('sheet').querySelectorAll('[data-msgfile]').forEach(el => el.onclick = async (ev) => {
      ev.preventDefault();
      try { await openStoredFile('message', el.dataset.msgfile); }
      catch (e) { toast(e.message, 'err'); }
    });
    const box = $('chatBox'); box.scrollTop = box.scrollHeight;
    $('mSend').onclick = async () => {
      const btn = $('mSend'); btn.disabled = true; btn.textContent = '送信中…';
      try {
        const f = $('mFile').files[0];
        await API.call('chat.post', {
          thread_id: id, body: $('mBody').value, file: f ? await shrinkImage(f) : null });
        closeSheet(); toast('送信しました'); openChatSheet();
      } catch (e) { toast(e.message, 'err'); btn.disabled = false; btn.textContent = '送信'; }
    };
  } catch (e) { toast(e.message, 'err'); }
}

/* ============================ マイページ ============================ */

function openSettingSheet() {
  const me = S.me;
  openSheet(`
    <div class="sheet-title"><h2>設定</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <div class="card" style="margin-bottom:14px;">
      <h2>${esc(me.name)}</h2>
      <div class="muted">${esc(me.company || '')} ${esc(me.office || '')}　
        社員コード ${esc(me.code)}　${esc(me.employment || '')}</div>
    </div>
    <div class="list">
      <div class="item" id="setGeo"><div class="grow">
        <div class="title">📍 位置情報について</div>
        <div class="line2">何に使っているかのご説明</div></div><div class="muted">›</div></div>
      <div class="item" id="setDrive"><div class="grow">
        <div class="title">🚗 車の運行記録</div>
        <div class="line2">出発・帰着の記録と、事故のときの手順</div></div><div class="muted">›</div></div>
      <div class="item" id="setMail"><div class="grow">
        <div class="title">✉️ メールアドレスの変更</div>
        <div class="line2">${esc(me.email || '')}</div></div><div class="muted">›</div></div>
      <div class="item" id="setPw"><div class="grow">
        <div class="title">🔑 パスワードの変更</div></div><div class="muted">›</div></div>
    </div>
    <button class="btn danger block" id="setLogout" style="margin-top:16px;">ログアウト</button>`);

  $('setGeo').onclick = () => openSheet(`
    <div class="sheet-title"><h2>位置情報について</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    ${geoText()}`);
  $('setDrive').onclick = openDriveHistory;
  $('setMail').onclick = openEmailForm;
  $('setPw').onclick = openPasswordForm;
  $('setLogout').onclick = async () => {
    if (!confirm('ログアウトしますか？')) return;
    try { await API.call('logout'); } catch (e) { }
    API.setToken('');
    try { localStorage.removeItem(HOME_CACHE); } catch (e) { }
    location.reload();
  };
}

async function openDocList() {
  try {
    const d = await API.call('doc.mine');
    openSheet(`
      <div class="sheet-title"><h2>書類の提出</h2>
        <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
      <p class="muted">スマホで撮った写真をそのまま送れます。明るいところで、
        文字がはっきり写るように撮ってください。<br>
        誓約書は、内容を読んで「了承する」を押していただく形です。</p>
      <div class="list">
        ${d.types.map(t => `
          <div class="item" style="cursor:default;">
            <div class="grow">
              <div class="title">${esc(t.label)}
                ${t.required === 'yes' ? '<span class="badge warn">必須</span>' : ''}</div>
              <div class="meta">${esc(t.description || '')}</div>
              ${t.status !== '未提出' ? `<div class="meta">提出 ${fmtDateTime(t.uploaded_at)}</div>` : ''}
              ${t.note ? `<div class="meta" style="color:var(--warn)">${esc(t.note)}</div>` : ''}
            </div>
            <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
              <span class="badge ${['確認済', '同意済'].includes(t.status) ? 'ok'
                : t.status === '再提出' ? 'warn' : ''}">${esc(t.status)}</span>
              ${t.accept_upload === 'agree'
                ? (t.status === '同意済'
                   ? '<button class="btn sm" data-pledge="1">内容を見る</button>'
                   : '<button class="btn sm primary" data-pledge="1">読んで了承する</button>')
                : t.accept_upload === 'yes'
                ? `<button class="btn sm primary" data-up="${esc(t.id)}">${t.status === '未提出' ? '送る' : '送り直す'}</button>`
                : '<span class="badge">総務へ直接</span>'}
            </div>
          </div>`).join('')}
      </div>
      <input type="file" id="docFile" accept="image/*,application/pdf" capture="environment" style="display:none;">`);

    $('sheet').querySelectorAll('[data-pledge]').forEach(b => b.onclick = () => openPledge());
    let currentType = '';
    $('sheet').querySelectorAll('[data-up]').forEach(b => b.onclick = () => {
      currentType = b.dataset.up;
      $('docFile').click();
    });
    $('docFile').onchange = async () => {
      const f = $('docFile').files[0];
      if (!f) return;
      toast('送信中です…');
      try {
        const file = await shrinkImage(f);
        const r = await API.call('doc.upload', { doc_type_id: currentType, file });
        toast(r.mailed ? '提出しました。総務にメールで届きます' : '提出しました');
        openDocList();
      } catch (e) { toast(e.message, 'err'); }
    };
  } catch (e) { toast(e.message, 'err'); }
}

async function openSignList() {
  try {
    const d = await API.call('contract.mine');
    const c = d.contract;
    const left = c && c.days_left;
    openSheet(`
      <div class="sheet-title"><h2>雇用契約・電子サイン</h2>
        <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>

      ${c ? `<div class="card" style="margin-bottom:14px;">
        <h2 style="margin-bottom:8px;">いまの契約</h2>
        ${c.no_term
          ? '<p class="muted">期間の定めのない契約です。更新の手続きはありません。</p>'
          : `<div class="title" style="font-size:16px;">
               ${fmtYmd(c.end_date)} まで
               ${left !== null && left >= 0
                 ? `<span class="badge ${left <= 45 ? 'warn' : ''}">あと${left}日</span>`
                 : '<span class="badge warn">期日を過ぎています</span>'}
             </div>
             ${c.kind ? `<div class="meta">${esc(c.kind)}</div>` : ''}
             ${left !== null && left <= 45
               ? '<p class="muted" style="margin-top:8px;">更新の書類がまもなく届きます。'
                 + '署名のお願いのメールが来たら、お手続きをお願いします。</p>' : ''}`}
      </div>` : ''}

      <h3 style="margin:0 0 8px;">署名のお願い</h3>
      ${d.requests.length ? `<div class="list">${d.requests.map(r => `
        <div class="item" style="cursor:default;">
          <div class="grow">
            <div class="title">${esc(r.title)}</div>
            <div class="meta">依頼 ${fmtDateTime(r.requested_at)}
              ${r.due_date ? ' ・ 期限 ' + fmtDate(r.due_date) : ''}</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
            <span class="badge ${r.status === '署名済' ? 'ok' : 'warn'}">${esc(r.status)}</span>
            ${r.url && r.status !== '署名済'
              ? `<a class="btn sm primary" href="${esc(r.url)}" target="_blank" rel="noopener">署名する</a>` : ''}
          </div>
        </div>`).join('')}</div>`
      : '<div class="empty-state">いまお願いしているものはありません</div>'}
      <p class="muted" style="margin-top:14px;">
        署名はAdobeの画面で行います。メールでも同じお願いが届きます。</p>`);
  } catch (e) { toast(e.message, 'err'); }
}


function openEmailForm() {
  openSheet(`
    <div class="sheet-title"><h2>メールアドレスの変更</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <p class="muted">いまのID：<b>${esc((S.me && S.me.email) || '')}</b><br>
      変更すると、次回から新しいアドレスでログインします。</p>
    <label class="field"><span>新しいメールアドレス</span>
      <input type="email" id="eNew" inputmode="email" autocapitalize="off"
             spellcheck="false" autocomplete="email"></label>
    <label class="field"><span>いまのパスワード（確認のため）</span>
      <input type="password" id="ePw" autocomplete="current-password"></label>
    <button class="btn primary block" id="eSave">変更する</button>`);
  $('eSave').onclick = async () => {
    try {
      const d = await API.call('email.change',
        { email: $('eNew').value.trim(), password: $('ePw').value });
      if (S.me) S.me.email = d.login_id;
      closeSheet(); toast('変更しました');
    } catch (e) { toast(e.message, 'err'); }
  };
}

function openPasswordForm() {
  openSheet(`
    <div class="sheet-title"><h2>パスワードの変更</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <label class="field"><span>いまのパスワード</span>
      <input type="password" id="pCur" autocomplete="current-password"></label>
    <label class="field"><span>新しいパスワード（6文字以上）</span>
      <input type="password" id="pNew" autocomplete="new-password"></label>
    <label class="field"><span>新しいパスワード（確認）</span>
      <input type="password" id="pNew2" autocomplete="new-password"></label>
    <button class="btn primary block" id="pSave">変更する</button>`);
  $('pSave').onclick = async () => {
    if ($('pNew').value !== $('pNew2').value) return toast('新しいパスワードが一致しません', 'err');
    try {
      await API.call('password.change', { current: $('pCur').value, password: $('pNew').value });
      closeSheet(); toast('変更しました');
    } catch (e) { toast(e.message, 'err'); }
  };
}

/* ============================ 打刻 ============================ */

function punchCard(p, stale) {
  const rec = p.record || {};
  const shift = p.shift || {};
  const shiftLabel = (shift.start && shift.end)
    ? `所定 ${shift.start} 〜 ${shift.end}` : '所定の時間は登録されていません';
  const inDone = p.punched_in, outDone = p.punched_out;
  const field = shift.mode === 'field';
  const useQr = !!shift.use_qr;

  const placeBadge = (place, method) => {
    if (!place) return '';
    const cls = (place === '事業所外') ? 'warn' : (method === 'QR' ? 'ok' : '');
    return `<span class="badge ${cls}">${esc(place)}</span>`
      + (method && method !== '—' ? ` <span class="badge">${esc(method)}</span>` : '');
  };

  // 打刻のしかたによってボタンの出し方を変える
  let inBtn;
  if (inDone) {
    inBtn = '<button class="btn" id="punchIn" disabled>出勤ずみ</button>';
  } else if (useQr) {
    inBtn = '<button class="btn primary" id="punchQr">QRを読んで出勤</button>';
  } else if (field) {
    inBtn = '<button class="btn primary" id="punchIn">現場直行で出勤</button>';
  } else {
    inBtn = '<button class="btn primary" id="punchIn">出勤</button>';
  }
  const outLabel = outDone ? '退勤ずみ' : (field ? '直帰で退勤' : '退勤');

  return `
    <div class="card">
      <div class="card-head">
        <h2>今日の打刻</h2>
        <span class="muted">${stale ? '最新の状態を確認しています…'
          : esc(p.date.slice(5).replace('-', '/')) + '　' + esc(shiftLabel)}</span>
      </div>

      ${inDone ? `<div class="item" style="cursor:default; margin-bottom:8px;">
          <div class="grow"><div class="title">出勤　${esc(rec.start || '')}
            ${rec.late_min ? `<span class="badge warn">${fmtMin(rec.late_min)}の遅刻</span>` : ''}</div>
            <div class="meta">${placeBadge(rec.in_place, rec.in_method)}</div></div></div>` : ''}
      ${outDone ? `<div class="item" style="cursor:default; margin-bottom:8px;">
          <div class="grow"><div class="title">退勤　${esc(rec.end || '')}
            ${rec.early_min ? `<span class="badge warn">${fmtMin(rec.early_min)}の早退</span>` : ''}</div>
            <div class="meta">${placeBadge(rec.out_place, rec.out_method)}
              ${rec.work_min ? '実働 ' + (Math.round(rec.work_min / 6) / 10) + 'h' : ''}</div></div></div>` : ''}

      <div class="btn-row punch-row">
        ${inBtn}
        <button class="btn ${inDone && !outDone ? 'primary' : ''}" id="punchOut"
          ${!inDone || outDone ? 'disabled' : ''}>${outLabel}</button>
      </div>

      ${(rec.late_min || rec.early_min) && !rec.reported_at
        ? `<button class="btn block" id="punchReason" style="margin-top:10px; border-color:var(--warn); color:var(--warn);">
             理由を報告する（遅延証明も送れます）</button>` : ''}
      ${rec.reported_at ? `<p class="muted" style="margin:10px 0 0;">
          報告ずみ：${esc(rec.reason_type || '')} ${esc(rec.reason || '')}</p>` : ''}
      <p class="muted" style="margin:10px 0 0;">
        ${useQr ? '事業所に貼ってあるQRコードを読み取ってください。'
          : field ? '訪問先へ直行するときは、そのまま押してください。'
          : shift.mode === 'onsite' ? '事業所に着いてから打刻してください。' : ''}</p>
    </div>`;
}

const GEO_INTRO_KEY = 'portal_geo_intro';

async function doPunch(kind, opts) {
  opts = opts || {};
  // はじめて打刻するときは、何のために場所を使うのかを先に伝える
  const needGeo = S.punch && S.punch.shift && S.punch.shift.has_location;
  if (needGeo && !localStorage.getItem(GEO_INTRO_KEY)) {
    openGeoIntro(() => { try { localStorage.setItem(GEO_INTRO_KEY, '1'); } catch (e) { }
                         doPunch(kind); });
    return;
  }

  const btn = $(kind === 'in' ? 'punchIn' : 'punchOut') || $('punchQr');
  if (!btn) return;
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = '位置を確認中…';
  try {
    const pos = await getPosition();
    if (!pos && S.punch.shift.require_location) {
      btn.disabled = false;
      btn.textContent = label;
      return openGeoHelp();
    }
    btn.textContent = '送信中…';
    const body = pos ? { lat: pos.lat, lng: pos.lng } : {};
    if (opts.qr_token) body.qr_token = opts.qr_token;
    if (S.punch && S.punch.shift && S.punch.shift.mode === 'field') body.direct = true;
    const r = await API.call(kind === 'in' ? 'punch.in' : 'punch.out', body);
    toast(`${r.time} に${kind === 'in' ? '出勤' : '退勤'}を記録しました`);
    try { localStorage.removeItem(HOME_CACHE); } catch (e) { }
    await renderHome();
    if (r.need_reason) openReasonSheet(S.punch.date);
    else if (r.need_place_reason) openPlaceReasonSheet(S.punch.date, kind, r.place_reasons);
    else if (r.need_overtime_request) {
      const over = Math.round(r.overtime_raw / 6) / 10;
      if (confirm(`所定より ${over} 時間ぶん長く記録されています。\n`
        + `残業の申請が出ていないため、このままでは残業になりません。\n\n`
        + `いま申請しますか？（打刻の押し忘れだった場合は「勤怠」から時刻を直してください）`)) {
        openOvertimeForm(S.punch.date);
      }
    }
  } catch (e) {
    toast(e.message, 'err');
    btn.disabled = false;
    btn.textContent = label;
  }
}

async function openReasonSheet(date) {
  const st = S.punch && S.punch.date === date ? S.punch : await API.call('punch.state');
  const rec = st.record || {};
  const isLate = !!rec.late_min;
  const reasons = st.late_reasons || [];
  openSheet(`
    <div class="sheet-title">
      <h2>${isLate ? `${fmtMin(rec.late_min)}の遅刻` : `${fmtMin(rec.early_min)}の早退`}について</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <p class="muted">${fmtDate(date)}　出勤 ${esc(rec.start || '—')}　退勤 ${esc(rec.end || '—')}</p>
    <div class="kind-grid" id="reasonGrid" style="grid-template-columns:repeat(3,1fr);">
      ${reasons.map(r => `<button class="kind-btn" data-r="${esc(r)}">${esc(r)}</button>`).join('')}
    </div>
    <label class="field"><span>くわしい事情（任意）</span>
      <textarea id="rBody" style="min-height:70px;"
        placeholder="例）大宮駅で人身事故があり、20分ほど電車が止まりました"></textarea></label>
    <div id="certBox" style="display:none;">
      <label class="field"><span>遅延証明書の写真</span>
        <input type="file" id="rCert" accept="image/*,application/pdf" capture="environment"></label>
      <p class="muted">駅でもらった紙、またはスマホの画面を撮って送ってください。</p>
    </div>
    <button class="btn primary block" id="rSend">報告する</button>`);

  let picked = '';
  $('reasonGrid').querySelectorAll('.kind-btn').forEach(b => b.onclick = () => {
    picked = b.dataset.r;
    $('reasonGrid').querySelectorAll('.kind-btn').forEach(x => x.classList.toggle('on', x === b));
    $('certBox').style.display = picked.indexOf('遅延') >= 0 ? '' : 'none';
  });
  $('rSend').onclick = async () => {
    if (!picked) return toast('理由を選んでください', 'err');
    const btn = $('rSend'); btn.disabled = true; btn.textContent = '送信中…';
    try {
      const f = $('rCert') ? $('rCert').files[0] : null;
      await API.call('attendance.reason', {
        date, reason_type: picked, reason: $('rBody').value,
        file: f ? await shrinkImage(f) : null
      });
      closeSheet();
      toast('総務に報告しました');
      renderHome();
    } catch (e) { toast(e.message, 'err'); btn.disabled = false; btn.textContent = '報告する'; }
  };
}

function openPlaceReasonSheet(date, which, reasons) {
  openSheet(`
    <div class="sheet-title"><h2>事業所の外での打刻でした</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <p class="muted">どちらでしたか。選んでおくと、総務が確認する手間がなくなります。</p>
    <div class="kind-grid" style="grid-template-columns:repeat(2,1fr);" id="placeGrid">
      ${(reasons || []).map(r => `<button class="kind-btn" data-r="${esc(r)}">${esc(r)}</button>`).join('')}
    </div>`);
  $('placeGrid').querySelectorAll('.kind-btn').forEach(b => b.onclick = async () => {
    try {
      await API.call('attendance.place_reason', { date, which, place_reason: b.dataset.r });
      closeSheet(); toast('記録しました'); renderHome();
    } catch (e) { toast(e.message, 'err'); }
  });
}

/* ============================ 残業の申請 ============================ */

function openOvertimeForm(date) {
  const d = date || new Date().toISOString().slice(0, 10);
  const past = d < new Date().toISOString().slice(0, 10);
  openSheet(`
    <div class="sheet-title"><h2>残業の申請</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <label class="field"><span>日付</span><input type="date" id="otDate" value="${d}"></label>
    <div class="cols" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
      <label class="field"><span>何時まで（見込み）</span><input type="time" id="otEnd"></label>
      <label class="field"><span>残業する時間（分）</span>
        <input type="number" id="otMin" step="15" value="30"></label>
    </div>
    <label class="field"><span>理由</span>
      <textarea id="otReason" style="min-height:80px;"
        placeholder="例）お迎えが遅れる児童の対応のため／記録の作成が終わらないため"></textarea></label>
    <p class="muted" id="otTiming"></p>
    <button class="btn primary block" id="otSend">申請する</button>`);

  const timing = () => {
    const isPast = $('otDate').value < new Date().toISOString().slice(0, 10);
    $('otTiming').textContent = isPast
      ? 'すでに過ぎた日なので「事後申請」になります。なぜ前もって申請できなかったかも書いてください。'
      : '前もっての申請です。承認されると、その分が残業として計上されます。';
  };
  $('otDate').onchange = timing; timing();
  $('otEnd').onchange = () => {
    // 終了予定から、所定終業との差でおよその分数を埋める
    const sh = S.punch && S.punch.shift ? S.punch.shift.end : '';
    if (!sh || !$('otEnd').value) return;
    const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    const diff = toMin($('otEnd').value) - toMin(sh);
    if (diff > 0) $('otMin').value = diff;
  };
  $('otSend').onclick = async () => {
    const btn = $('otSend'); btn.disabled = true;
    try {
      await API.call('overtime.create', {
        date: $('otDate').value, planned_end: $('otEnd').value,
        minutes: Number($('otMin').value), reason: $('otReason').value
      });
      closeSheet(); toast('申請しました。承認をお待ちください');
      if (S.view === 'leave') renderLeaveBody(); else renderHome();
    } catch (e) { toast(e.message, 'err'); btn.disabled = false; }
  };
}

/* ============================ 交通費の申請 ============================ */

function openExpenseForm(ex) {
  // 前の月と同じなら、打ち直さずに済むようにしておく
  const base = ex.current || ex.previous || {};
  const first = ex.month + '-01';
  const cur = base.method || '電車・バス';
  openSheet(`
    <div class="sheet-title"><h2>通勤交通費</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <p class="muted">${monthLabel(ex.month)}ぶんです。</p>

    <label class="field"><span>通勤の方法</span>
      <div class="chip-row">
        ${ex.methods.map(m => `<button type="button" class="chip mt ${m === cur ? 'on' : ''}"
          data-m="${esc(m)}">${esc(m)}</button>`).join('')}
      </div>
      <input type="hidden" id="exMethod" value="${esc(cur)}"></label>

    <label class="field"><span id="exRouteLabel">区間</span>
      <input type="text" id="exRoute" value="${esc(base.route || '')}"
        placeholder="宮原 〜 大宮"></label>

    <div id="exTrainBox">
      <label class="field"><span>定期の期間</span>
        <div class="chip-row">
          ${ex.pass_months.map(m => `<button type="button" class="chip pm ${
            String(base.pass_months || '1') === m ? 'on' : ''}" data-m="${m}">${m}か月</button>`).join('')}
        </div>
        <input type="hidden" id="exMonths" value="${esc(base.pass_months || '1')}"></label>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        <label class="field"><span>使いはじめ</span>
          <input type="date" id="exFrom" value="${esc(base.valid_from || first)}"></label>
        <label class="field"><span>期限</span>
          <input type="date" id="exTo" value="${esc(base.valid_to || '')}"></label>
      </div>
    </div>

    <div id="exCarBox" style="display:none;">
      <label class="field"><span>自宅から事業所までの片道の距離（km）</span>
        <input type="number" id="exKm" inputmode="decimal" step="0.1"
          value="${esc(base.distance_km || '')}" placeholder="12.5"></label>
      <p class="muted" id="exTaxNote" style="margin-top:-8px;"></p>
    </div>

    <label class="field"><span>金額（円）</span>
      <input type="number" id="exAmount" inputmode="numeric"
        value="${esc(base.amount || '')}" placeholder="12340"></label>

    <div id="exFileBox">
      <label class="field"><span>定期券の領収書の写真${base.receipt_url ? '（出し直すときだけ）' : ''}</span>
        <input type="file" id="exFile" accept="image/*,application/pdf" capture="environment"></label>
      <p class="muted" style="margin-top:-8px;">金額と期間が読めるように撮ってください。</p>
    </div>

    <button class="btn primary block" id="exSend">総務に出す</button>`);

  const taxFree = (km) => {
    const d = Number(km) || 0;
    const hit = ex.car_tax_free.find(x => d >= x.km);
    return hit ? hit.yen : 0;
  };
  const showTax = () => {
    const km = $('exKm').value;
    if (!km) { $('exTaxNote').textContent = ''; return; }
    const y = taxFree(km);
    $('exTaxNote').textContent = y
      ? `片道${km}kmだと、税金がかからない上限は月 ${y.toLocaleString()}円です（目安）。`
      : '片道2km未満は、支給すると全額が課税の対象になります。';
  };
  const apply = (m) => {
    const isTrain = m === '電車・バス';
    const isWalk = m === '自転車・徒歩';
    $('exTrainBox').style.display = isTrain ? '' : 'none';
    $('exCarBox').style.display = (isTrain || isWalk) ? 'none' : '';
    $('exFileBox').style.display = isTrain ? '' : 'none';
    $('exRouteLabel').textContent = isTrain ? '区間' : '通る道・経路';
    $('exRoute').placeholder = isTrain ? '宮原 〜 大宮' : '国道17号経由 など';
    if (!isTrain && !isWalk) showTax();
  };
  $('sheet').querySelectorAll('.chip.mt').forEach(b => b.onclick = () => {
    $('exMethod').value = b.dataset.m;
    $('sheet').querySelectorAll('.chip.mt').forEach(x => x.classList.toggle('on', x === b));
    apply(b.dataset.m);
  });
  $('exKm').oninput = showTax;

  const setTo = () => {
    const from = $('exFrom').value;
    const m = Number($('exMonths').value || 1);
    if (!from) return;
    const d = new Date(from);
    d.setMonth(d.getMonth() + m);
    d.setDate(d.getDate() - 1);
    $('exTo').value = d.toISOString().slice(0, 10);
  };
  $('sheet').querySelectorAll('.chip.pm').forEach(b => b.onclick = () => {
    $('exMonths').value = b.dataset.m;
    $('sheet').querySelectorAll('.chip.pm').forEach(x => x.classList.toggle('on', x === b));
    setTo();
  });
  $('exFrom').onchange = setTo;
  if (!$('exTo').value) setTo();
  apply(cur);

  $('exSend').onclick = async () => {
    const btn = $('exSend'); btn.disabled = true; btn.textContent = '送信中…';
    try {
      const method = $('exMethod').value;
      const f = $('exFile').files[0];
      await API.call('expense.create', {
        month: ex.month, method, amount: Number($('exAmount').value),
        route: $('exRoute').value,
        pass_months: method === '電車・バス' ? $('exMonths').value : '',
        distance_km: method === '電車・バス' ? '' : $('exKm').value,
        valid_from: method === '電車・バス' ? $('exFrom').value : '',
        valid_to: method === '電車・バス' ? $('exTo').value : '',
        file: f ? await shrinkImage(f) : null
      });
      closeSheet(); toast('総務に出しました'); renderLeaveBody();
    } catch (e) { toast(e.message, 'err'); btn.disabled = false; btn.textContent = '総務に出す'; }
  };
}

/* ============================ 届出・証明書の申請 ============================ */

async function openApplyList() {
  try {
    const [f, mine] = await Promise.all([API.call('apply.forms'), API.call('apply.mine')]);
    S.applyForms = f;
    openSheet(`
      <div class="sheet-title"><h2>届出・証明書</h2>
        <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
      <p class="muted">用件を選んでください。総務に届きます。</p>
      <div class="apply-grid">
        ${f.order.map(name => `<button class="apply-btn" data-t="${esc(name)}">
          <span class="ic">${f.forms[name].icon}</span>${esc(name)}</button>`).join('')}
      </div>

      ${mine.applications.length ? `<h3 style="margin:20px 0 10px;">これまでの申請</h3>
        <div class="list">${mine.applications.map(a => `
          <div class="item" style="cursor:default;">
            <div class="grow">
              <div class="title">${esc(a.type)}</div>
              <div class="meta">${fmtDateTime(a.created_at)}
                ${a.comment ? '<br>' + esc(a.comment) : ''}</div>
              ${a.reply_url ? `<div style="margin-top:6px;">
                <button class="btn sm" data-apfile="${esc(a.id)}">書類を受け取る</button></div>` : ''}
            </div>
            <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
              <span class="badge ${a.status === '完了' ? 'ok' : a.status === '対応中' ? 'warn' : ''}">${esc(a.status)}</span>
              ${a.status === '受付' ? `<button class="btn sm ghost" data-apcancel="${esc(a.id)}">取消</button>` : ''}
            </div>
          </div>`).join('')}</div>` : ''}`);

    $('sheet').querySelectorAll('[data-t]').forEach(b =>
      b.onclick = () => openApplyForm(b.dataset.t));
    $('sheet').querySelectorAll('[data-apfile]').forEach(b => b.onclick = async () => {
      try { await openStoredFile('apply_reply', b.dataset.apfile); }
      catch (e) { toast(e.message, 'err'); }
    });
    $('sheet').querySelectorAll('[data-apcancel]').forEach(b => b.onclick = async () => {
      if (!confirm('この申請を取り消しますか？')) return;
      try { await API.call('apply.cancel', { id: b.dataset.apcancel }); toast('取り消しました'); openApplyList(); }
      catch (e) { toast(e.message, 'err'); }
    });
  } catch (e) { toast(e.message, 'err'); }
}

function openApplyForm(type) {
  const form = S.applyForms.forms[type];
  const field = (f) => {
    const req = f.required ? ' <span style="color:var(--warn)">*</span>' : '';
    if (f.type === 'select') {
      return `<label class="field"><span>${esc(f.label)}${req}</span>
        <select data-k="${esc(f.key)}">${f.options.map(o => `<option>${esc(o)}</option>`).join('')}</select></label>`;
    }
    if (f.type === 'textarea') {
      return `<label class="field"><span>${esc(f.label)}${req}</span>
        <textarea data-k="${esc(f.key)}" placeholder="${esc(f.placeholder || '')}"></textarea></label>`;
    }
    return `<label class="field"><span>${esc(f.label)}${req}</span>
      <input type="${f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}"
        data-k="${esc(f.key)}" placeholder="${esc(f.placeholder || '')}"></label>`;
  };

  openSheet(`
    <div class="sheet-title"><h2>${form.icon} ${esc(type)}</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    ${form.note ? `<p class="muted">${esc(form.note)}</p>` : ''}
    <div id="apFields">${form.fields.map(field).join('')}</div>
    ${form.attach ? `<label class="field"><span>${esc(form.attach)}</span>
      <input type="file" id="apFile" accept="image/*,application/pdf" capture="environment"></label>
      ${form.attach_note ? `<p class="muted" style="margin-top:-8px;">${esc(form.attach_note)}</p>` : ''}` : ''}
    <label class="field"><span>そのほか伝えたいこと</span>
      <textarea id="apNote" style="min-height:60px;"></textarea></label>
    <button class="btn primary block" id="apSend">総務に送る</button>
    <button class="btn ghost block" style="margin-top:8px;" onclick="openApplyList()">もどる</button>`);

  $('apSend').onclick = async () => {
    const btn = $('apSend'); btn.disabled = true; btn.textContent = '送信中…';
    try {
      const body = {};
      $('apFields').querySelectorAll('[data-k]').forEach(el => { body[el.dataset.k] = el.value; });
      const fi = $('apFile');
      const f = fi && fi.files[0] ? await shrinkImage(fi.files[0]) : null;
      await API.call('apply.create', { type, body, note: $('apNote').value, file: f });
      closeSheet();
      toast('総務に送りました');
    } catch (e) { toast(e.message, 'err'); btn.disabled = false; btn.textContent = '総務に送る'; }
  };
}


/* ============================ 車の運行記録 ============================ */

function driveCard(d) {
  if (!d.has_car && !d.driving) return '';
  const dr = d.driving;
  if (dr) {
    return `
      <div class="card" style="border-color:var(--accent);">
        <div class="card-head">
          <h2>運転中</h2>
          <span class="muted">${esc(dr.car_name)}</span>
        </div>
        <p class="muted">${dr.plate4 ? 'ナンバー ' + esc(dr.plate4) + '　' : ''}
          ${esc(String(dr.start_at).substring(11, 16))} に出発（${esc(dr.start_odo)}km）</p>
        <button class="btn primary block" id="driveEnd" style="margin-top:10px;">
          帰着を記録する</button>
        <button class="btn block" id="driveHelp" style="margin-top:8px;
          border-color:var(--danger); color:var(--danger);">事故・トラブルが起きたら</button>
      </div>`;
  }
  return `
    <div class="card">
      <div class="card-head"><h2>車を使うとき</h2></div>
      <button class="btn block" id="driveStart">出発を記録する</button>
      <button class="btn block" id="driveHelp" style="margin-top:8px;
        border-color:var(--danger); color:var(--danger);">事故・トラブルが起きたら</button>
    </div>`;
}

async function openDriveStart() {
  try {
    const c = await API.call('car.list');
    S.carList = c;
    const items = c.inspection_items || [];
    openSheet(`
      <div class="sheet-title"><h2>出発の記録</h2>
        <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>

      <label class="field"><span>使う車のナンバー（下4桁）</span>
        <input type="tel" id="dvPlate" inputmode="numeric" maxlength="4"
               placeholder="1234" class="plate-input"></label>
      <div class="muted" id="dvCarName" style="margin-top:-8px; margin-bottom:12px;"></div>

      <label class="field"><span>出発メーター（km）</span>
        <input type="number" id="dvOdo" inputmode="numeric"></label>

      <h3 style="margin:16px 0 6px;">出発前の点検</h3>
      <p class="muted" style="margin-top:0;">見たところを押してください。
        気になるところがあれば、もう一度押すと「気になる」になります。</p>
      <div id="dvInspect" class="inspect-list">
        ${items.map((it, i) => `<button type="button" class="inspect-row" data-i="${i}">
          <span class="mk"></span><span class="tx">${esc(it)}</span></button>`).join('')}
      </div>
      <div class="btn-row" style="margin:10px 0 12px;">
        <button class="btn sm" id="dvAllOk">すべて異常なし</button>
      </div>
      <div id="dvNgBox" style="display:none;">
        <label class="field"><span>気になるところの中身</span>
          <textarea id="dvNgNote" style="min-height:70px;"
            placeholder="右前のタイヤの空気が少し減っている など"></textarea></label>
      </div>

      <button class="btn primary block" id="dvGo">出発する</button>`);

    const state = items.map(() => 0);   // 0=未確認 1=異常なし 2=気になる
    const rows = [...$('dvInspect').querySelectorAll('.inspect-row')];
    const paint = () => {
      rows.forEach((r, i) => {
        r.className = 'inspect-row' + (state[i] === 1 ? ' ok' : state[i] === 2 ? ' ng' : '');
        r.querySelector('.mk').textContent = state[i] === 1 ? '✓' : state[i] === 2 ? '!' : '';
      });
      $('dvNgBox').style.display = state.some(x => x === 2) ? '' : 'none';
    };
    rows.forEach((r, i) => r.onclick = () => { state[i] = (state[i] + 1) % 3; paint(); });
    $('dvAllOk').onclick = () => { state.fill(1); paint(); };
    paint();

    const showCar = () => {
      const p4 = $('dvPlate').value.replace(/[^0-9]/g, '');
      const car = c.cars.find(x => x.plate4 === p4);
      if (car) {
        $('dvCarName').innerHTML = `<span class="badge ok">${esc(car.name)}</span>
          ${car.office ? ' ' + esc(car.office) : ''}`;
        if (car.odo && !$('dvOdo').value) $('dvOdo').value = car.odo;
      } else {
        $('dvCarName').textContent = p4.length === 4
          ? 'この番号の車は登録されていません。このまま記録もできます。' : '';
      }
    };
    $('dvPlate').oninput = showCar;

    $('dvGo').onclick = async () => {
      const btn = $('dvGo'); btn.disabled = true;
      try {
        await API.call('drive.start', {
          plate4: $('dvPlate').value, start_odo: Number($('dvOdo').value),
          inspection: items.filter((_, i) => state[i] === 1),
          inspection_ng: items.filter((_, i) => state[i] === 2),
          inspection_note: $('dvNgNote') ? $('dvNgNote').value : ''
        });
        closeSheet(); toast('出発を記録しました'); renderHome();
      } catch (e) { toast(e.message, 'err'); btn.disabled = false; }
    };
  } catch (e) { toast(e.message, 'err'); }
}

async function openDriveEnd(dr) {
  openSheet(`
    <div class="sheet-title"><h2>帰着の記録</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <p class="muted">${esc(dr.car_name)}${dr.plate4 ? '（' + esc(dr.plate4) + '）' : ''}<br>
      出発 ${esc(String(dr.start_at).substring(11, 16))}（${esc(dr.start_odo)}km）</p>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
      <label class="field"><span>帰着メーター（km）</span>
        <input type="number" id="dvEndOdo" inputmode="numeric" value="${esc(dr.start_odo)}"></label>
      <label class="field"><span>走った距離</span>
        <input type="text" id="dvDist" value="0 km" disabled></label>
    </div>
    <h3 style="margin:14px 0 8px;">給油した場合（任意）</h3>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
      <label class="field"><span>給油量（L）</span><input type="text" id="dvFuelL" inputmode="decimal"></label>
      <label class="field"><span>金額（円）</span><input type="number" id="dvFuelY" inputmode="numeric"></label>
    </div>
    <label class="field"><span>気づいたこと（任意）</span>
      <input type="text" id="dvNote" placeholder="傷、異音、給油ランプ など"></label>
    <button class="btn primary block" id="dvEnd">帰着を記録する</button>`);

  const calc = () => {
    const d = Number($('dvEndOdo').value) - Number(dr.start_odo);
    $('dvDist').value = (d >= 0 ? d : 0) + ' km';
  };
  $('dvEndOdo').oninput = calc; calc();
  $('dvEnd').onclick = async () => {
    const btn = $('dvEnd'); btn.disabled = true;
    try {
      const r = await API.call('drive.end', {
        end_odo: Number($('dvEndOdo').value),
        fuel_liter: $('dvFuelL').value, fuel_yen: $('dvFuelY').value,
        note: $('dvNote').value
      });
      closeSheet(); toast(`${r.distance}km の運行を記録しました`); renderHome();
    } catch (e) { toast(e.message, 'err'); btn.disabled = false; }
  };
}

/* ============================ 事故・トラブル ============================ */

async function openIncidentGuide() {
  try {
    const g = await API.call('incident.guide');
    S.incidentGuide = g;
    openSheet(`
      <div class="sheet-title"><h2>事故・トラブルが起きたら</h2>
        <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>

      ${g.contacts.length ? `<div class="emg-contacts">
        ${g.contacts.map(c => `<a class="emg-call" href="tel:${esc(String(c.phone).replace(/[^0-9+]/g, ''))}">
          <span class="who">${esc(c.label)}${c.name ? '　' + esc(c.name) : ''}</span>
          <span class="num">${esc(c.phone)}</span>
        </a>`).join('')}
      </div>` : '<p class="muted">連絡先がまだ登録されていません。総務にご確認ください。</p>'}

      <div class="emg-steps">
        ${g.steps.map(s => `<div class="emg-step">
          <span class="n">${s.n}</span>
          <div><div class="t">${esc(s.title)}</div>
            <div class="b">${esc(s.body)}</div></div>
        </div>`).join('')}
      </div>

      ${g.note ? `<div class="card" style="margin-top:14px;">
        <div style="white-space:pre-wrap;">${esc(g.note)}</div></div>` : ''}

      <button class="btn primary block" id="igReport" style="margin-top:16px;">
        事故を報告する</button>`);
    $('igReport').onclick = () => openIncidentForm();
  } catch (e) { toast(e.message, 'err'); }
}

function openIncidentForm() {
  const g = S.incidentGuide || { types: [] };
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 16);
  const cars = (S.carList && S.carList.cars) || [];
  openSheet(`
    <div class="sheet-title"><h2>事故の報告</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <p class="muted">分かる範囲で構いません。あとから総務が確認します。</p>
    <label class="field"><span>起きた日時</span>
      <input type="datetime-local" id="icAt" value="${local}"></label>
    <label class="field"><span>場所</span>
      <input type="text" id="icPlace" placeholder="さいたま市北区宮原町の交差点 など"></label>
    <label class="field"><span>種類</span>
      <select id="icType">${g.types.map(t => `<option>${esc(t)}</option>`).join('')}</select></label>
    ${cars.length ? `<label class="field"><span>車</span>
      <select id="icCar"><option value="">— 選ばない —</option>
        ${cars.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}
      </select></label>` : ''}
    <label class="field"><span>けがをした人</span>
      <select id="icInjury">
        <option>いない</option><option>いる（軽い）</option><option>いる（救急車を呼んだ）</option>
        <option>分からない</option></select></label>
    <label class="field"><span>警察への届け出</span>
      <select id="icPolice">
        <option>届けた</option><option>これから届ける</option><option>まだ届けていない</option>
      </select></label>
    <label class="field"><span>相手の情報（お名前・連絡先・車のナンバー・保険会社）</span>
      <textarea id="icOther" style="min-height:70px;"></textarea></label>
    <label class="field"><span>どういう状況だったか</span>
      <textarea id="icDetail" style="min-height:90px;"
        placeholder="信号待ちで停まっていたところ、後ろから追突されました"></textarea></label>
    <label class="field"><span>写真（1枚）</span>
      <input type="file" id="icPhoto" accept="image/*" capture="environment"></label>
    <button class="btn primary block" id="icSend">総務に報告する</button>`);

  $('icSend').onclick = async () => {
    const btn = $('icSend'); btn.disabled = true; btn.textContent = '送信中…';
    try {
      const f = $('icPhoto').files[0];
      await API.call('incident.report', {
        occurred_at: $('icAt').value.replace('T', ' '),
        place: $('icPlace').value, type: $('icType').value,
        car_id: $('icCar') ? $('icCar').value : '',
        injury: $('icInjury').value, police: $('icPolice').value,
        counterpart: $('icOther').value, detail: $('icDetail').value,
        file: f ? await shrinkImage(f) : null
      });
      closeSheet();
      toast('総務に報告しました');
    } catch (e) { toast(e.message, 'err'); btn.disabled = false; btn.textContent = '総務に報告する'; }
  };
}

async function openDriveHistory() {
  try {
    const d = await API.call('drive.state');
    openSheet(`
      <div class="sheet-title"><h2>車の運行記録</h2>
        <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
      <div class="btn-row" style="margin-bottom:14px;">
        ${d.driving ? '<button class="btn primary" id="dhEnd">帰着を記録する</button>'
                    : '<button class="btn primary" id="dhStart">出発を記録する</button>'}
        <button class="btn" id="dhHelp" style="border-color:var(--danger); color:var(--danger);">
          事故のときは</button>
      </div>
      ${d.recent.length ? `<div class="list">${d.recent.map(r => `
        <div class="item" style="cursor:default;">
          <div class="grow">
            <div class="title">${fmtDate(r.date)}　${esc(r.car_name)}</div>
            <div class="meta">${r.inspection_ng ? '<span class="badge warn">点検で気になるところ</span><br>' : ''}
              ${esc(String(r.start_at).substring(11, 16))}
              〜 ${r.end_at ? esc(String(r.end_at).substring(11, 16)) : '（運転中）'}
              ${r.distance ? '　' + r.distance + 'km' : ''}</div>
          </div>
        </div>`).join('')}</div>`
      : '<div class="empty-state">まだ記録はありません</div>'}`);
    if ($('dhStart')) $('dhStart').onclick = () => openDriveStart();
    if ($('dhEnd')) $('dhEnd').onclick = () => openDriveEnd(d.driving);
    $('dhHelp').onclick = () => openIncidentGuide();
  } catch (e) { toast(e.message, 'err'); }
}

/* ============================ 位置情報の案内 ============================ */

function geoText() {
  return `
    <ul class="geo-list">
      <li><b>打刻のボタンを押したときだけ</b>、その瞬間の場所を記録します。</li>
      <li>ふだんどこにいるかは分かりません。アプリを開いていないあいだは、何も記録されません。</li>
      <li>勤務の時間と場所を正しく残すために使います。それ以外には使いません。</li>
      <li>この許可は<b>このアプリにだけ</b>有効です。ほかのアプリやサイトには関係ありません。</li>
      <li>記録した場所は、ご自身の勤怠の画面と、総務の画面から見られます。</li>
    </ul>`;
}

function openGeoIntro(next) {
  openSheet(`
    <div class="sheet-title"><h2>位置情報について</h2></div>
    <p class="muted">このあと「位置情報の使用を許可しますか」と聞かれます。
      何に使うものかを先にお伝えします。</p>
    ${geoText()}
    <button class="btn primary block" id="geoOk" style="margin-top:16px;">わかりました</button>
    <button class="btn ghost block" style="margin-top:8px;" onclick="closeSheet()">あとにする</button>`);
  $('geoOk').onclick = () => { closeSheet(); setTimeout(next, 150); };
}

function openGeoHelp() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  openSheet(`
    <div class="sheet-title"><h2>位置情報が取れませんでした</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <p class="muted">お使いの事業所では、打刻に場所の確認が必要です。
      下のやり方で「許可」にしてから、もう一度お試しください。</p>

    <div class="card" style="margin:14px 0;">
      <h3 style="margin-bottom:8px;">${ios ? 'iPhone・iPad の場合' : 'Android の場合'}</h3>
      ${ios ? `<p class="muted">ホーム画面に追加したアプリから使っている場合：<br>
          <b>設定</b> → <b>プライバシーとセキュリティ</b> → <b>位置情報サービス</b> →
          一覧から <b>バタフライ</b> を選び、<b>このAppの使用中</b> にします。</p>
        <p class="muted" style="margin-top:8px;">Safari で開いている場合：<br>
          <b>設定</b> → <b>Safari</b> → <b>位置情報</b> を <b>確認</b> にしてから、
          もう一度このページを開いて「許可」を押してください。</p>`
      : `<p class="muted">Chrome の右上の <b>⋮</b> → <b>設定</b> → <b>サイトの設定</b> →
          <b>位置情報</b> を開き、このサイトを <b>許可</b> にしてください。</p>
        <p class="muted" style="margin-top:8px;">画面の上に鍵のマークがある場合は、
          そこをタップしても変えられます。</p>`}
      <p class="muted" style="margin-top:8px;">スマホ本体の位置情報（GPS）がオフになっていないかも、
        あわせてご確認ください。</p>
    </div>

    ${geoText()}

    <p class="muted" style="margin-top:14px;">
      それでも押せないときは、勤怠の画面から日付をタップして、総務に申告してください。</p>
    <button class="btn primary block" id="geoRetry" style="margin-top:8px;">もう一度ためす</button>`);
  $('geoRetry').onclick = () => { closeSheet(); setTimeout(() => doPunch('in'), 200); };
}

/* ============================ 治療院の日報 ============================ */

function treatmentCard(d) {
  if (!d.is_treatment) return '';
  const n = d.treatment_today || 0;
  return `
    <div class="card">
      <div class="card-head">
        <h2>今日の日報</h2>
        <span class="muted">${n ? n + '件 記録ずみ' : 'まだ書いていません'}</span>
      </div>
      <button class="btn ${n ? '' : 'primary'} block" id="treatReport">
        ${n ? '日報を見る・直す' : '日報を書く'}</button>
      <button class="btn ghost block" id="treatMonth" style="margin-top:8px;">今月の分を見る</button>
    </div>`;
}

async function openTreatmentForm(date) {
  try {
    const d = await API.call('treatment.day', { date: date || undefined });
    S.treatDay = d;
    const pts = d.patients || [];
    openSheet(`
      <div class="sheet-title"><h2>日報</h2>
        <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
      <label class="field"><span>日付</span>
        <input type="date" id="tdDate" value="${esc(d.date)}"></label>

      <div class="card-head" style="margin-bottom:8px;">
        <h3 style="margin:0;">施術した方を押してください</h3>
        <button class="btn sm ghost" id="tdPatients">患者の登録</button>
      </div>
      ${pts.length ? `<div class="chip-row" id="tdPick" style="margin-bottom:12px;">
        ${pts.map(x => `<button type="button" class="chip pt" data-id="${esc(x.id)}"
          data-name="${esc(x.name)}" data-min="${esc(x.default_minutes || '')}">${esc(x.name)}</button>`).join('')}
        <button type="button" class="chip" id="tdOther">＋ 登録にない方</button>
      </div>`
      : `<p class="muted">まだ患者さんを登録していません。
           「患者の登録」から入れておくと、次からは押すだけで書けます。</p>
         <button class="btn block" id="tdOther" style="margin-bottom:12px;">
           名前を書いて記録する</button>`}

      <div id="tdRows"></div>
      <p class="muted" id="tdSum"></p>
      <button class="btn primary block" id="tdSave" style="margin-top:8px;">この内容で記録する</button>`);

    const rows = $('tdRows');
    const addRow = (it) => {
      it = it || {};
      const fixed = !!it.patient;
      const row = el(`<div class="card" style="padding:12px; margin-bottom:10px;">
        ${fixed
          ? `<div class="card-head" style="margin-bottom:8px;">
               <b class="t-name">${esc(it.patient)}</b>
               <button type="button" class="btn sm danger t-del">消す</button></div>
             <input type="hidden" class="t-patient" value="${esc(it.patient)}">
             <input type="hidden" class="t-pid" value="${esc(it.patient_id || '')}">`
          : `<label class="field" style="margin-bottom:8px;"><span>お名前</span>
               <input type="text" class="t-patient" autocomplete="off" spellcheck="false"></label>
             <input type="hidden" class="t-pid" value="">
             <button type="button" class="btn sm danger t-del" style="margin-bottom:8px;">この行を消す</button>`}
        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px;">
          ${d.minutes.map(m => `<button type="button" class="chip min ${String(it.minutes) === m ? 'on' : ''}"
            data-m="${m}">${m}分</button>`).join('')}
        </div>
        <input type="hidden" class="t-min" value="${esc(it.minutes || '')}">
        <input type="text" class="t-note" placeholder="備考（任意）" value="${esc(it.note || '')}">
      </div>`);
      row.querySelectorAll('.chip.min').forEach(b => b.onclick = () => {
        row.querySelector('.t-min').value = b.dataset.m;
        row.querySelectorAll('.chip.min').forEach(x => x.classList.toggle('on', x === b));
        sum();
      });
      row.querySelector('.t-del').onclick = () => { row.remove(); sum(); };
      rows.appendChild(row);
      row.scrollIntoView({ block: 'nearest' });
      return row;
    };
    const sum = () => {
      let n = 0, min = 0;
      rows.querySelectorAll('.t-min').forEach(x => {
        if (x.value) { n++; min += Number(x.value); }
      });
      $('tdSum').textContent = n ? `${n}件・合計 ${min}分（${Math.round(min / 6) / 10}時間）` : '';
    };

    d.items.forEach(addRow);
    sum();

    if ($('tdPick')) $('tdPick').querySelectorAll('.chip.pt').forEach(b => b.onclick = () => {
      const row = addRow({ patient: b.dataset.name, patient_id: b.dataset.id,
                           minutes: b.dataset.min });
      if (b.dataset.min) sum();
    });
    $('tdOther').onclick = () => addRow();
    $('tdPatients').onclick = () => openPatientList();
    $('tdDate').onchange = () => openTreatmentForm($('tdDate').value);

    $('tdSave').onclick = async () => {
      const btn = $('tdSave'); btn.disabled = true; btn.textContent = '送信中…';
      try {
        const items = [...rows.children].map(r => ({
          patient: r.querySelector('.t-patient').value,
          patient_id: r.querySelector('.t-pid').value,
          minutes: r.querySelector('.t-min').value,
          note: r.querySelector('.t-note').value
        })).filter(x => x.patient.trim());
        await API.call('treatment.save', { date: $('tdDate').value, items });
        closeSheet(); toast(`${items.length}件を記録しました`); renderHome();
      } catch (e) { toast(e.message, 'err'); btn.disabled = false; btn.textContent = 'この内容で記録する'; }
    };
  } catch (e) { toast(e.message, 'err'); }
}

/* ---- 患者の登録 ---- */

async function openPatientList() {
  try {
    const d = await API.call('patient.list');
    openSheet(`
      <div class="sheet-title"><h2>患者の登録</h2>
        <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
      <p class="muted">登録しておくと、日報で押すだけになります。
        治療院のみなさんで共有します（代診のときも使えます）。</p>
      <button class="btn primary block" id="ptNew" style="margin:12px 0;">＋ 患者さんを登録する</button>
      ${d.patients.length ? `<div class="list">${d.patients.map(x => `
        <div class="item" data-pt="${esc(x.id)}">
          <div class="grow">
            <div class="title">${esc(x.name)}${x.mine ? '' : ' <span class="badge">ほかの方が登録</span>'}</div>
            <div class="meta">${esc(x.kana || '')}${x.default_minutes ? '　' + esc(x.default_minutes) + '分' : ''}
              ${x.note ? '<br>' + esc(x.note) : ''}</div>
          </div><div class="muted">›</div>
        </div>`).join('')}</div>`
      : '<div class="empty-state">まだ登録がありません</div>'}
      <button class="btn ghost block" style="margin-top:14px;"
        onclick="openTreatmentForm()">日報にもどる</button>`);

    $('ptNew').onclick = () => openPatientForm({}, d.minutes);
    $('sheet').querySelectorAll('[data-pt]').forEach(b => b.onclick = () =>
      openPatientForm(d.patients.find(x => x.id === b.dataset.pt), d.minutes));
  } catch (e) { toast(e.message, 'err'); }
}

function openPatientForm(x, minutes) {
  x = x || {};
  openSheet(`
    <div class="sheet-title"><h2>${x.id ? '患者さんの情報' : '患者さんの登録'}</h2>
      <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
    <label class="field"><span>お名前</span>
      <input type="text" id="ptName" value="${esc(x.name || '')}" autocomplete="off"></label>
    <label class="field"><span>ふりがな（並び順に使います）</span>
      <input type="text" id="ptKana" value="${esc(x.kana || '')}" autocomplete="off"></label>
    <label class="field"><span>いつもの施術時間（任意）</span>
      <div class="chip-row">
        ${(minutes || []).map(m => `<button type="button" class="chip pm ${
          String(x.default_minutes || '') === m ? 'on' : ''}" data-m="${m}">${m}分</button>`).join('')}
        <button type="button" class="chip pm ${x.default_minutes ? '' : 'on'}" data-m="">決めない</button>
      </div>
      <input type="hidden" id="ptMin" value="${esc(x.default_minutes || '')}"></label>
    <label class="field"><span>メモ（任意）</span>
      <input type="text" id="ptNote" value="${esc(x.note || '')}" placeholder="生保・水土 など"></label>
    <div class="btn-row">
      ${x.id ? '<button class="btn danger" id="ptDel">一覧から外す</button>' : ''}
      <button class="btn primary" id="ptSave">保存する</button>
    </div>`);

  $('sheet').querySelectorAll('.chip.pm').forEach(b => b.onclick = () => {
    $('ptMin').value = b.dataset.m;
    $('sheet').querySelectorAll('.chip.pm').forEach(y => y.classList.toggle('on', y === b));
  });
  $('ptSave').onclick = async () => {
    try {
      await API.call('patient.save', {
        id: x.id, name: $('ptName').value, kana: $('ptKana').value,
        default_minutes: $('ptMin').value, note: $('ptNote').value });
      toast('保存しました'); openPatientList();
    } catch (e) { toast(e.message, 'err'); }
  };
  if ($('ptDel')) $('ptDel').onclick = async () => {
    if (!confirm(`${x.name} さんを一覧から外します。これまでの日報は残ります。`)) return;
    try { await API.call('patient.delete', { id: x.id }); toast('外しました'); openPatientList(); }
    catch (e) { toast(e.message, 'err'); }
  };
}

async function openTreatmentMonth() {
  try {
    const d = await API.call('treatment.month', { month: S.month });
    openSheet(`
      <div class="sheet-title"><h2>${monthLabel(d.month)}の日報</h2>
        <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
      <div class="stats" style="margin-bottom:14px;">
        <div class="stat"><b>${d.total}</b><span>施術の件数</span></div>
        <div class="stat"><b>${d.days.length}</b><span>訪問した日数</span></div>
        <div class="stat"><b>${Math.round(d.total_minutes / 6) / 10}</b><span>合計(時間)</span></div>
      </div>
      <h3 style="margin:0 0 8px;">お一人ごと</h3>
      ${d.patients.length ? `<div class="list">${d.patients.map(x => `
        <div class="item" style="cursor:default;">
          <div class="grow"><div class="title">${esc(x.patient)}</div>
            <div class="meta">${x.count}回・${x.minutes}分</div></div>
        </div>`).join('')}</div>`
      : '<div class="empty-state">まだ記録がありません</div>'}
      <h3 style="margin:18px 0 8px;">日ごと</h3>
      ${d.days.length ? `<div class="list">${d.days.map(x => `
        <div class="item" data-td="${esc(x.date)}">
          <div class="grow"><div class="title">${fmtDate(x.date)}</div>
            <div class="meta">${x.count}件</div></div><div class="muted">›</div>
        </div>`).join('')}</div>` : ''}`);
    $('sheet').querySelectorAll('[data-td]').forEach(b =>
      b.onclick = () => openTreatmentForm(b.dataset.td));
  } catch (e) { toast(e.message, 'err'); }
}

/* ============================ QRコードの読み取り ============================ */

/** QRの読み取りライブラリは、使うときだけ読み込む */
function loadJsQR() {
  if (window.jsQR) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('QRの読み取りを準備できませんでした'));
    document.head.appendChild(s);
  });
}

async function openQrScanner() {
  openSheet(`
    <div class="sheet-title"><h2>QRコードを読み取る</h2>
      <button class="btn sm ghost" id="qrClose">閉じる</button></div>
    <p class="muted">事業所に貼ってあるQRコードに、カメラを向けてください。</p>
    <div class="qr-frame"><video id="qrVideo" playsinline muted></video>
      <div class="qr-guide"></div></div>
    <p class="muted" id="qrMsg" style="text-align:center;">カメラを準備しています…</p>`);

  let stream = null, stop = false;
  const cleanup = () => {
    stop = true;
    if (stream) stream.getTracks().forEach(t => t.stop());
  };
  $('qrClose').onclick = () => { cleanup(); closeSheet(); };
  $('sheetBg').onclick = (e) => { if (e.target === $('sheetBg')) { cleanup(); closeSheet(); } };

  try {
    await loadJsQR();
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }, audio: false
    });
    const video = $('qrVideo');
    video.srcObject = stream;
    await video.play();
    $('qrMsg').textContent = 'QRコードを枠に入れてください';

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const tick = async () => {
      if (stop) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (code && code.data) {
          const token = extractQrToken(code.data);
          if (token) {
            cleanup();
            $('qrMsg').textContent = '読み取りました。打刻しています…';
            try {
              await punchWithQr(token);
              closeSheet();
            } catch (e) {
              toast(e.message, 'err');
              closeSheet();
            }
            return;
          }
          $('qrMsg').textContent = 'このQRコードは打刻用ではないようです';
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  } catch (e) {
    $('qrMsg').innerHTML = `${esc(e.message || 'カメラを使えませんでした')}<br>
      <span class="muted">カメラの使用を「許可」にするか、
      スマホのカメラでQRを読み取ってこのアプリを開いてください。</span>`;
  }
}

/** QRの中身（URL または 合言葉そのもの）からトークンを取り出す */
function extractQrToken(text) {
  const t = String(text || '').trim();
  const m = t.match(/[?&]qr=([A-Za-z0-9]+)/);
  if (m) return m[1];
  if (/^[a-f0-9]{16,64}$/i.test(t)) return t;
  return '';
}

async function punchWithQr(token) {
  const pos = await getPosition(6000);
  const body = pos ? { lat: pos.lat, lng: pos.lng, qr_token: token } : { qr_token: token };
  const kind = (S.punch && S.punch.punched_in) ? 'out' : 'in';
  const r = await API.call(kind === 'in' ? 'punch.in' : 'punch.out', body);
  toast(`${r.time} に${kind === 'in' ? '出勤' : '退勤'}を記録しました`);
  try { localStorage.removeItem(HOME_CACHE); } catch (e) { }
  await renderHome();
  if (r.need_reason) openReasonSheet(S.punch.date);
}

/** スマホのカメラでQRを読んで、このアプリが開かれたとき */
async function handleQrParam() {
  const m = location.search.match(/[?&]qr=([A-Za-z0-9]+)/);
  if (!m) return false;
  const token = m[1];
  history.replaceState(null, '', location.pathname);
  try {
    const c = await API.call('qr.check', { token });
    if (!c.valid) { toast('このQRコードは使えません', 'err'); return true; }
    const kind = c.punched_in ? '退勤' : '出勤';
    openSheet(`
      <div class="sheet-title"><h2>${esc(c.office)}</h2>
        <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>
      <p class="muted">QRコードを読み取りました。${kind}を記録しますか。
        ${c.mine ? '' : '<br>ふだんの事業所とは違いますが、そのまま記録できます。'}</p>
      <button class="btn primary block" id="qrPunch">${kind}する</button>`);
    $('qrPunch').onclick = async () => {
      const b = $('qrPunch'); b.disabled = true; b.textContent = '記録しています…';
      try { await punchWithQr(token); closeSheet(); }
      catch (e) { toast(e.message, 'err'); b.disabled = false; b.textContent = `${kind}する`; }
    };
  } catch (e) { toast(e.message, 'err'); }
  return true;
}

/* ============================ 誓約書 ============================ */

async function openPledge() {
  try {
    const d = await API.call('pledge.get');
    openSheet(`
      <div class="sheet-title"><h2>${esc(d.title)}</h2>
        <button class="btn sm ghost" onclick="closeSheet()">閉じる</button></div>

      ${d.agreed ? `<p class="muted">
          ${fmtDateTime(d.agreed_at)} に了承いただいています。控えはメールでお送りしました。</p>` : ''}

      <div class="pledge-body">${esc(d.text)}</div>

      ${d.agreed ? '' : `
        <label class="field" style="margin-top:16px;"><span>控えの送り先（メールアドレス）</span>
          <input type="email" id="plEmail" value="${esc(d.email)}" inputmode="email"
                 autocapitalize="off" placeholder="you@example.com"></label>
        <p class="muted" style="margin-top:-8px;">
          了承いただいた内容の控えを、このアドレスにお送りします。</p>
        <label style="display:flex; align-items:flex-start; gap:10px; margin:14px 0;">
          <input type="checkbox" id="plCheck" style="width:auto; margin-top:3px;">
          <span>上の内容を読み、理解しました。</span></label>
        <button class="btn primary block" id="plAgree" disabled>了承する</button>`}`);

    if (!d.agreed) {
      const sync = () => {
        $('plAgree').disabled = !($('plCheck').checked && $('plEmail').value.trim());
      };
      $('plCheck').onchange = sync;
      $('plEmail').oninput = sync;
      sync();
      $('plAgree').onclick = async () => {
        const b = $('plAgree'); b.disabled = true; b.textContent = '送信中…';
        try {
          const r = await API.call('pledge.agree', { email: $('plEmail').value.trim() });
          closeSheet();
          toast(r.mailed ? '了承しました。控えをメールでお送りしました'
                         : '了承しました（控えのメールは届かなかったかもしれません）');
          renderHome();
        } catch (e) {
          toast(e.message, 'err');
          b.disabled = false; b.textContent = '了承する';
        }
      };
    }
  } catch (e) { toast(e.message, 'err'); }
}

/* ============================ 月末の確認 ============================ */

async function confirmMonth(month) {
  try {
    let r = await API.call('attendance.confirm', { month });
    if (r.need_confirm) {
      const n = r.unreported.length;
      if (!confirm(`遅刻・早退の理由を報告していない日が ${n}日 あります。\n`
        + `先に報告していただくのが望ましいですが、このまま確認しますか？`)) {
        S.month = month;
        return openKintaiSheet();
      }
      r = await API.call('attendance.confirm', { month, force: true });
    }
    toast(`${monthLabel(month)}の勤怠を確認しました`);
    try { localStorage.removeItem(HOME_CACHE); } catch (e) { }
    renderHome();
  } catch (e) { toast(e.message, 'err'); }
}
