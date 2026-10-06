// 🛠 어른이 동화마을 — 제작자 모드
// - js/creator-config.js 에 등록된 UID로 로그인했을 때만 .creator-only 요소가 보입니다.
// - 제작자 기능: 🎞️ 캡컷용 재료 내려받기 (16:9 페이지 이미지, 제목·끝 카드, 대본, 배경음악)
// - ?whoami 로 열면 로그인한 계정의 UID를 보여줍니다(등록용).
(function () {
  const W = 1920, H = 1080;
  let jszipPromise = null;

  function creatorList() {
    return Array.isArray(window.EAIM_FAIRYTALE_CREATORS) ? window.EAIM_FAIRYTALE_CREATORS.filter(Boolean) : [];
  }

  function setCreatorMode(user) {
    const on = !!(user && creatorList().includes(user.uid));
    document.body.classList.toggle('is-creator', on);
    if (user && new URLSearchParams(location.search).has('whoami')) showWhoAmI(user, on);
  }

  window.addEventListener('eaim-auth-changed', (e) => setCreatorMode(e.detail));

  // ---------- ?whoami : UID 확인 ----------
  function showWhoAmI(user, isCreator) {
    document.querySelector('.whoami-box')?.remove();
    const box = document.createElement('div');
    box.className = 'whoami-box';
    box.innerHTML = `
      <strong>🔑 내 계정 UID</strong>
      <code>${user.uid}</code>
      <p>${isCreator ? '✅ 이 계정은 제작자 모드가 켜져 있어요.' : 'js/creator-config.js 에 이 UID를 넣으면 제작자 모드가 켜져요.'}</p>
      <div><button type="button" class="whoami-copy">복사</button><button type="button" class="whoami-close">닫기</button></div>`;
    document.body.appendChild(box);
    box.querySelector('.whoami-copy').onclick = async () => {
      try { await navigator.clipboard.writeText(user.uid); box.querySelector('.whoami-copy').textContent = '복사됨 ✓'; }
      catch (e) { prompt('아래 UID를 복사하세요', user.uid); }
    };
    box.querySelector('.whoami-close').onclick = () => box.remove();
  }

  // ---------- 도우미 ----------
  function loadJSZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (!jszipPromise) {
      jszipPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = './js/vendor/jszip.min.js';
        s.onload = () => resolve(window.JSZip);
        s.onerror = () => reject(new Error('압축 도구를 불러오지 못했어요.'));
        document.head.appendChild(s);
      });
    }
    return jszipPromise;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function canvasToBlob(canvas) {
    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  }

  function newCanvas() {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    return c;
  }

  const FONT = '"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif';

  function wrapLines(ctx, text, maxWidth) {
    // 한국어는 어절(띄어쓰기) 단위로, 너무 긴 어절은 글자 단위로 줄바꿈
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width <= maxWidth) { line = test; continue; }
      if (line) lines.push(line);
      if (ctx.measureText(w).width <= maxWidth) { line = w; continue; }
      let part = '';
      for (const ch of w) {
        if (ctx.measureText(part + ch).width > maxWidth) { lines.push(part); part = ch; }
        else part += ch;
      }
      line = part;
    }
    if (line) lines.push(line);
    return lines;
  }

  // ---------- 16:9 페이지 이미지 (양옆은 같은 그림을 흐리게) ----------
  async function makePageImage(base64) {
    const c = newCanvas();
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1d1530';
    ctx.fillRect(0, 0, W, H);
    if (!base64) return canvasToBlob(c);
    const img = await loadImage(`data:image/png;base64,${base64}`);

    const cover = Math.max(W / img.width, H / img.height) * 1.1;
    ctx.save();
    ctx.filter = 'blur(40px) brightness(0.55) saturate(1.2)';
    ctx.drawImage(img, (W - img.width * cover) / 2, (H - img.height * cover) / 2, img.width * cover, img.height * cover);
    ctx.restore();

    const fit = Math.min(W / img.width, H / img.height);
    ctx.drawImage(img, (W - img.width * fit) / 2, (H - img.height * fit) / 2, img.width * fit, img.height * fit);
    return canvasToBlob(c);
  }

  // ---------- 제목·끝 카드 (녹화 화면과 같은 디자인) ----------
  async function makeCard({ kicker, title, sub, titleSize }) {
    const c = newCanvas();
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, W * 0.7);
    g.addColorStop(0, '#fff8e6'); g.addColorStop(0.55, '#fde7f3'); g.addColorStop(1, '#e9ddff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    let y = H * 0.14;
    const muniSrc = new URL('./assets/guide-listen.png', location.href).href; // 🌙 들려주는 뮤인이
    if (muniSrc) {
      try {
        const m = await loadImage(muniSrc);
        const mh = H * 0.38, mw = m.width * (mh / m.height);
        ctx.drawImage(m, (W - mw) / 2, y, mw, mh);
        y += mh + 50;
      } catch (e) { y = H * 0.35; }
    } else y = H * 0.35;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    if (kicker) {
      ctx.fillStyle = '#8a63e8';
      ctx.font = `900 40px ${FONT}`;
      ctx.fillText(kicker, W / 2, y);
      y += 70;
    }
    ctx.fillStyle = '#4a2f8f';
    ctx.font = `900 ${titleSize}px ${FONT}`;
    for (const line of wrapLines(ctx, title, W * 0.84)) {
      ctx.fillText(line, W / 2, y);
      y += titleSize * 1.2;
    }
    if (sub) {
      y += 16;
      ctx.fillStyle = '#8a6a3a';
      ctx.font = `800 38px ${FONT}`;
      ctx.fillText(sub, W / 2, y);
    }
    return canvasToBlob(c);
  }

  // ---------- 대본 ----------
  function roleLabel(role, isEn) {
    const ko = { narrator: '해설', hero: '주인공', child: '주인공', friend: '친구', elder: '어른', villain: '악당', monster: '악당' };
    const en = { narrator: 'Narrator', hero: 'Hero', child: 'Hero', friend: 'Friend', elder: 'Elder', villain: 'Villain', monster: 'Villain' };
    return (isEn ? en : ko)[role] || (isEn ? 'Character' : '등장인물');
  }

  function makeScript(book, isEn) {
    const title = getActiveStoryTitle(book);
    const pages = getActiveStoryPages(book);
    const out = [];
    out.push(isEn ? `[Title card] ${title}` : `[제목 카드] ${title}`);
    out.push(isEn ? `Read: "Title: ${title}"` : `읽기: "제목, ${title}"`);
    out.push('');
    pages.forEach((p, i) => {
      const num = String(i + 1).padStart(2, '0');
      out.push(isEn ? `[Page ${num}]  (image: ${num}.png)` : `[${num} 페이지]  (이미지: ${num}.png)`);
      const lines = Array.isArray(p.dialogue_list) && p.dialogue_list.length
        ? p.dialogue_list
        : [{ role: 'narrator', text: p.full_text || '' }];
      lines.forEach(d => {
        const text = String(d.text || '').replace(/[*#]/g, '').trim();
        if (text) out.push(`${roleLabel(d.role, isEn)}: ${text}`);
      });
      out.push('');
    });
    out.push(isEn ? '[End card] The End' : '[끝 카드] 끝');
    return out.join('\r\n');
  }

  // ---------- 캡컷용 재료 내려받기 ----------
  async function exportCapCutKit(btn) {
    const book = typeof currentStoryBookObject !== 'undefined' ? currentStoryBookObject : null;
    if (!book || !book.pages?.length) { alert('먼저 동화를 만들거나 내 서재에서 동화를 열어주세요.'); return; }
    if (!document.body.classList.contains('is-creator')) return;

    const oldText = btn ? btn.textContent : '';
    const say = (t) => { if (btn) btn.textContent = t; };
    if (btn) btn.disabled = true;

    try {
      say('⏳ 압축 도구 준비 중...');
      const JSZip = await loadJSZip();
      const zip = new JSZip();
      const isEn = typeof isEnglishStoryMode === 'function' && isEnglishStoryMode();
      const title = getActiveStoryTitle(book) || '동화';
      const author = book.author || '';

      say('🎁 인트로 담는 중...');
      try {
        const ir = await fetch('./assets/intro/mutoniz-intro.mp4');
        if (ir.ok) zip.file('000_인트로_뮤토니즈.mp4', await ir.blob());
      } catch (e) { console.log('intro skip:', e); }

      say('🎨 제목·끝 카드 그리는 중...');
      zip.file('00_제목카드.png', await makeCard({
        kicker: isEn ? "Eoreuni Story Village" : '어른이 동화마을',
        title,
        sub: author ? (isEn ? `Written by ${author}` : `글 · ${author} 작가`) : '',
        titleSize: 96
      }));
      zip.file('99_끝카드.png', await makeCard({
        kicker: '',
        title: isEn ? 'The End' : '끝',
        sub: isEn ? "Eoreuni Story Village · Mutonies" : '어른이 동화마을 · Mutonies',
        titleSize: 130
      }));

      const original = zip.folder('원본_정사각형');
      for (let i = 0; i < book.pages.length; i++) {
        say(`🖼️ 페이지 이미지 ${i + 1}/${book.pages.length}`);
        const num = String(i + 1).padStart(2, '0');
        const b64 = book.pages[i]?.imageBase64 || '';
        zip.file(`${num}.png`, await makePageImage(b64));
        if (b64) original.file(`${num}.png`, b64, { base64: true });
        if (!isEn && book.pages[i]?.aiVoice?.blob) zip.file(`${num}.wav`, book.pages[i].aiVoice.blob);
      }

      zip.file(isEn ? '대본_영어.txt' : '대본.txt', '\ufeff' + makeScript(book, isEn));

      say('🎵 배경음악 담는 중...');
      try {
        const sel = typeof getCurrentBgmSelection === 'function' ? getCurrentBgmSelection() : null;
        if (sel?.data?.url) {
          const res = await fetch(sel.data.url);
          if (res.ok) {
            const bb = await res.blob();
            const ext = /wav/.test(bb.type) ? 'wav' : /mp4|m4a|aac/.test(bb.type) ? 'm4a' : /ogg/.test(bb.type) ? 'ogg' : 'mp3';
            zip.file(`배경음악_${sel.data.name}.${ext}`, bb);
          }
        }
      } catch (e) { console.log('bgm skip:', e); }

      zip.file('사용법.txt', '\ufeff' + [
        '🎞️ 캡컷에서 이렇게 쓰세요',
        '',
        '1. 000_인트로_뮤토니즈.mp4 → 00_제목카드 → 01.png, 02.png ... → 99_끝카드 순서로 타임라인에 올리기',
        '2. 대본.txt를 보면서 페이지마다 목소리 녹음 (캡컷 [오디오] → [녹음])',
        '   🎙️ AI 성우 목소리가 있는 동화는 01.wav, 02.wav ... 를 그대로 쓰면 돼요 (1페이지 소리에 제목 포함)',
        '3. 이미지 길이를 목소리 길이에 맞게 늘리기',
        '4. [텍스트] → [자동 자막]으로 자막 만들기',
        '5. 배경음악 mp3를 깔고 목소리보다 작게(약 20~30%) 조절',
        '',
        '※ 페이지 이미지는 16:9(1920×1080)로 맞춰져 있어요. 원래 정사각형 그림은 "원본_정사각형" 폴더에 있어요.',
        '※ 유튜브 업로드 시 "아동용 아님"으로 설정하세요(어른이 동화마을은 성인 채널).'
      ].join('\r\n'));

      say('📦 압축하는 중...');
      const blob = await zip.generateAsync({ type: 'blob' });
      const safeTitle = title.replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 40) || '동화';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${safeTitle}_캡컷재료${isEn ? '_영어' : ''}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) {
      console.error(e);
      alert(`⚠️ 재료를 만들지 못했어요: ${e.message}`);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = oldText; }
    }
  }

  window.exportCapCutKit = exportCapCutKit;
})();
