/* ひだまりグループ 社内ポータル — APIクライアント（社員画面・管理画面 共通） */

const API = {
  url() {
    return window.PORTAL_API_URL || localStorage.getItem('portal_api_url') || '';
  },
  token() { return localStorage.getItem('portal_token') || ''; },
  setToken(t) { t ? localStorage.setItem('portal_token', t) : localStorage.removeItem('portal_token'); },

  async call(action, payload = {}) {
    const url = API.url();
    if (!url) throw new Error('接続先が設定されていません（config.js の PORTAL_API_URL）');
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        // text/plain にすることでプリフライト(OPTIONS)を回避する
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, payload, token: API.token() }),
        redirect: 'follow'
      });
    } catch (e) {
      throw new Error('通信できませんでした。電波の良いところでもう一度お試しください。');
    }
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); }
    catch (e) { throw new Error('サーバーの応答を読み取れませんでした'); }
    if (!json.ok) {
      if (json.error === 'SESSION_EXPIRED') {
        API.setToken('');
        location.reload();
        throw new Error('ログインの有効期限が切れました');
      }
      throw new Error(json.error || '処理に失敗しました');
    }
    return json.data;
  }
};

/* ---- 写真を送れるサイズに縮める（長辺1600px / JPEG） ---- */
async function shrinkImage(file, maxEdge = 1600, quality = 0.82) {
  if (file.type === 'application/pdf') {
    return { name: file.name, mime: file.type, data: await fileToBase64(file) };
  }
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return { name: file.name, mime: file.type, data: await fileToBase64(file) };
  let { width, height } = bitmap;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return {
    name: file.name.replace(/\.[^.]+$/, '') + '.jpg',
    mime: 'image/jpeg',
    data: dataUrl.split(',')[1]
  };
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/* ---- 小物 ---- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmtDate = (s) => {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[2])}月${Number(m[3])}日` : String(s);
};

const fmtDateTime = (s) => {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  return m ? `${Number(m[2])}/${Number(m[3])} ${m[4]}:${m[5]}` : String(s);
};

/** 2027-03-31 → 2027年3月31日 */
const fmtYmd = (s) => {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}年${Number(m[2])}月${Number(m[3])}日` : String(s || '');
};

/** 分を読みやすく。90 → 1時間30分 */
const fmtMin = (m) => {
  const n = Number(m) || 0;
  if (n < 60) return `${n}分`;
  const h = Math.floor(n / 60), r = n % 60;
  return r ? `${h}時間${r}分` : `${h}時間`;
};

function toast(msg, kind = 'info') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = 'show ' + kind;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = ''; }, 3200);
}

/* ---- 現在地を取る。取れなくても打刻は続行できるよう null を返す ---- */
function getPosition(timeout = 10000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: Number(pos.coords.latitude.toFixed(6)),
        lng: Number(pos.coords.longitude.toFixed(6)),
        acc: Math.round(pos.coords.accuracy)
      }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout, maximumAge: 0 }
    );
  });
}


/* ---- アプリ経由でファイルを受け取る（Googleアカウントがなくても開ける） ---- */
async function openStoredFile(kind, id) {
  toast('読み込んでいます…');
  const f = await API.call('file.get', { kind, id });
  const bin = atob(f.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: f.mime }));
  const a = document.createElement('a');
  a.href = url;
  // 画像やPDFは新しいタブで開き、それ以外は保存させる
  if (/^(image|application\/pdf)/.test(f.mime)) a.target = '_blank';
  else a.download = f.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
