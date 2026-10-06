// 🏛️ 다시 읽는 명작 — 선생님이 만든 동화를 누구나 무료로 보고 듣는 공간
//
// 보는 쪽(누구나): 로그인·API 키 없이 library/index.json 의 동화 목록 → 동화 열기(그림·글·AI 성우·배경음악·영어판) → 🎬 영상 보기
// 올리는 쪽(제작자): 동화를 열고 "📚 도서관에 올리기" → library 묶음 zip 내려받기 → GitHub 저장소에 library 폴더째 올리기
//
// 파일 구조 (저장소 안, 공통규칙 3번: 외부 이미지 링크 대신 저장소 안 파일)
//   library/index.json                 목록
//   library/<slug>/story.json          동화 내용(글·대사·영어판·유튜브 주소)
//   library/<slug>/p01.jpg …           삽화(1024px JPEG)
//   library/<slug>/v01.wav …           AI 성우 목소리(16kHz WAV)
//   library/<slug>/bgm.mp3|wav …       선생님 배경음악(있을 때)
// 도서관 동화는 AI를 부르지 않는다 → 비용 0원, 아이들이 AI를 쓰지 않는 구조(공통규칙 6-5).
(function () {
  const LIB = './library';
  const esc = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- 공통 도우미 ----------
  function blobToBase64(blob) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
  }
  function pngToJpegBlob(base64, maxDim = 1024) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, maxDim / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(b => resolve(b), 'image/jpeg', 0.86);
      };
      img.onerror = () => resolve(null);
      img.src = `data:image/png;base64,${base64}`;
    });
  }
  // 목소리를 16kHz 모노 WAV로 줄이기 (용량 약 1/3)
  async function toVoiceWav16k(blob) {
    try {
      const buf = await blob.arrayBuffer();
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const decoded = await ctx.decodeAudioData(buf.slice(0));
      ctx.close();
      const rate = 16000;
      const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * rate), rate);
      const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start();
      const out = await off.startRendering();
      const ch = out.getChannelData(0);
      const pcm = new Int16Array(ch.length);
      for (let i = 0; i < ch.length; i++) { const v = Math.max(-1, Math.min(1, ch[i])); pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff; }
      const h = new DataView(new ArrayBuffer(44)); const w = (o, s) => { for (let i = 0; i < s.length; i++) h.setUint8(o + i, s.charCodeAt(i)); };
      w(0, 'RIFF'); h.setUint32(4, 36 + pcm.byteLength, true); w(8, 'WAVE'); w(12, 'fmt '); h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true);
      h.setUint32(24, rate, true); h.setUint32(28, rate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true); w(36, 'data'); h.setUint32(40, pcm.byteLength, true);
      return new Blob([h.buffer, pcm.buffer], { type: 'audio/wav' });
    } catch (e) {
      console.warn('voice resample skip:', e);
      return blob;
    }
  }
  function youtubeId(url) {
    const s = String(url || '');
    const m = s.match(/youtu\.be\/([\w-]{6,})/) || s.match(/[?&]v=([\w-]{6,})/) || s.match(/shorts\/([\w-]{6,})/) || s.match(/embed\/([\w-]{6,})/);
    return m ? m[1] : '';
  }
  function audioExt(blob) { const t = blob.type || ''; return /wav/.test(t) ? 'wav' : /mp4|m4a|aac/.test(t) ? 'm4a' : /ogg/.test(t) ? 'ogg' : 'mp3'; }
  async function fetchIndex() {
    try {
      const r = await fetch(`${LIB}/index.json?v=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) return { version: 1, stories: [] };
      const j = await r.json();
      return j && Array.isArray(j.stories) ? j : { version: 1, stories: [] };
    } catch (e) { return { version: 1, stories: [] }; }
  }
  // 제작자가 만든 도서관 목록을 기기에도 기억 (연달아 여러 편을 묶어도 목록이 빠지지 않게)
  const PUB_KEY = 'eoreuni_library_published';
  function localPublished() { try { return JSON.parse(localStorage.getItem(PUB_KEY) || '[]'); } catch (e) { return []; } }
  function rememberPublished(entry) {
    const list = [entry, ...localPublished().filter(x => x.slug !== entry.slug)].slice(0, 300);
    try { localStorage.setItem(PUB_KEY, JSON.stringify(list)); } catch (e) {}
  }
  // 🗑️ 도서관에서 뺀 동화 번호(slug)도 기기에 기억 — GitHub에 올리기 전에 다른 동화를 묶어도 되살아나지 않게
  const REMOVED_KEY = 'eoreuni_library_removed';
  function removedSlugs() { try { return JSON.parse(localStorage.getItem(REMOVED_KEY) || '[]'); } catch (e) { return []; } }
  function setRemoved(list) { try { localStorage.setItem(REMOVED_KEY, JSON.stringify([...new Set(list)].slice(-300))); } catch (e) {} }
  function forgetPublished(slug) {
    try { localStorage.setItem(PUB_KEY, JSON.stringify(localPublished().filter(x => x.slug !== slug))); } catch (e) {}
  }
  async function fetchIndexForPublish() {
    const idx = await fetchIndex();
    const removed = new Set(removedSlugs());
    idx.stories = idx.stories.filter(x => !removed.has(x.slug));
    const have = new Set(idx.stories.map(x => x.slug));
    localPublished().forEach(x => { if (!have.has(x.slug) && !removed.has(x.slug)) idx.stories.push(x); });
    return idx;
  }

  async function loadJSZip() {
    if (window.JSZip) return window.JSZip;
    await new Promise((res, rej) => { const s = document.createElement('script'); s.src = './js/vendor/jszip.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    return window.JSZip;
  }

  // =====================================================================
  // 1) 보는 쪽 — 도서관 목록
  // =====================================================================
  async function renderLibrary() {
    const box = document.getElementById('muniLibraryList');
    if (!box) return;
    box.innerHTML = '<p class="ml-empty">📚 도서관을 여는 중...</p>';
    const idx = await fetchIndex();
    const list = [...idx.stories].sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
    if (!list.length) { box.innerHTML = '<p class="ml-empty">곧 첫 번째 명작이 꽂힐 거예요. 🌙</p>'; return; }
    box.innerHTML = list.map(s => `
      <article class="ml-card">
        <button type="button" class="ml-cover" onclick="openLibraryStory('${esc(s.slug)}')">
          <img class="ml-cover-bg" src="${LIB}/${esc(s.cover)}" alt="" aria-hidden="true" loading="lazy" onerror="this.remove()">
          <img class="ml-cover-img" src="${LIB}/${esc(s.cover)}" alt="${esc(s.title)}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'ml-nocover',textContent:'📕 그림을 찾지 못했어요'}))">
          ${s.hasVoice ? '<span class="ml-badge">🎙️ AI 성우</span>' : ''}
        </button>
        <div class="ml-body">
          <h3>${esc(s.title)}</h3>
          ${s.summary ? `<p>${esc(s.summary)}</p>` : ''}
          <div class="ml-tags">${s.origin ? `<span>📖 ${esc(s.origin)}</span>` : ''}${s.hasEnglish ? '<span>🇬🇧 English</span>' : ''}</div>
          <div class="ml-actions">
            <button type="button" class="ml-read" onclick="openLibraryStory('${esc(s.slug)}')">📖 동화 보기</button>
            ${(s.youtube && (s.youtube.ko || s.youtube.en)) ? `<button type="button" class="ml-video" onclick="openLibraryVideo('${esc(s.slug)}')">🎬 영상 보기</button>` : ''}
          </div>
          <button type="button" class="ml-share" onclick="copyLibraryLink('${esc(s.slug)}', this)">🔗 이 동화 링크 복사</button>
          <button type="button" class="ml-remove creator-only" onclick="removeFromLibrary('${esc(s.slug)}')">🗑️ 도서관에서 빼기 <small>(제작자)</small></button>
        </div>
      </article>`).join('');
    window.__muniLibraryIndex = list;
  }

  function showMuniLibrary() {
    ['create-view', 'library-view'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    const v = document.getElementById('muni-library-view'); if (v) v.style.display = 'block';
    document.querySelectorAll('.tab-nav .tab-btn').forEach(b => b.classList.toggle('active', b.id === 'tabMuniLibraryBtn'));
    renderLibrary();
  }
  window.showMuniLibrary = showMuniLibrary;

  // 📖 첫 화면 "무료 동화 읽기 → 다시 읽는 명작으로 고고!" 띠
  window.goMuniLibrary = function () {
    showMuniLibrary();
    const v = document.getElementById('muni-library-view');
    if (v) setTimeout(() => v.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };
  // 띠에 도서관 동화 수 표시 (예: · 지금 4편)
  (async () => {
    try {
      const idx = await fetchIndex();
      const n = (idx.stories || []).length;
      const el = document.getElementById('goLibCount');
      if (el && n) el.textContent = ` · 지금 ${n}편`;
    } catch (e) {}
  })();

  // 🔗 바로 가는 주소: …/?library (도서관) · …/?story=<slug> (그 동화 바로 열기)
  function siteBase() { return `${location.origin}${location.pathname.replace(/index\.html$/, '')}`; }
  // 인스타 등은 주소의 '?' 뒤를 잘라내므로, 물음표 없는 주소를 우선 복사합니다.
  //   도서관: …/classics/      동화: …/library/<slug>/ (도서관에 올린 동화 폴더의 안내 페이지)
  window.copyLibraryLink = async function (slug, btn) {
    let url = `${siteBase()}classics/`;
    if (slug) {
      url = `${siteBase()}library/${encodeURIComponent(slug)}/`;
      try {
        const r = await fetch(`${LIB}/${slug}/index.html`, { method: 'HEAD', cache: 'no-store' });
        if (!r.ok) url = `${siteBase()}?story=${encodeURIComponent(slug)}`; // 예전에 올린 동화는 다시 올리면 짧은 주소가 생겨요
      } catch (e) { url = `${siteBase()}?story=${encodeURIComponent(slug)}`; }
    }
    try { await navigator.clipboard.writeText(url); if (btn) { const o = btn.textContent; btn.textContent = '✅ 복사했어요!'; setTimeout(() => { btn.textContent = o; }, 1800); } }
    catch (e) { prompt('아래 주소를 복사하세요', url); }
  };
  function handleDeepLink() {
    const q = new URLSearchParams(location.search);
    const story = q.get('story');
    if (story) { window.openLibraryStory(story); return; }
    if (q.has('library') || location.hash === '#library') {
      showMuniLibrary();
      // 휴대폰에서 도서관 카드가 바로 보이도록 도서관 쪽으로 내려가기
      setTimeout(() => document.getElementById('muni-library-view')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 600);
    }
  }
  if (document.readyState === 'complete') setTimeout(handleDeepLink, 300);
  else window.addEventListener('load', () => setTimeout(handleDeepLink, 300));

  // 기존 탭 전환이 도서관 화면을 닫도록
  const origSwitch = window.switchTab;
  if (typeof origSwitch === 'function') {
    window.switchTab = function (tab) {
      const v = document.getElementById('muni-library-view'); if (v) v.style.display = 'none';
      const b = document.getElementById('tabMuniLibraryBtn'); if (b) b.classList.remove('active');
      return origSwitch.apply(this, arguments);
    };
  }

  // =====================================================================
  // 2) 보는 쪽 — 동화 열기
  // =====================================================================
  function busy(on, text) {
    let o = document.getElementById('mlBusy');
    if (!o) { o = document.createElement('div'); o.id = 'mlBusy'; o.className = 'ml-busy'; document.body.appendChild(o); }
    o.innerHTML = `<div><img src="./assets/guide-listen.png" alt=""><p>${esc(text || '')}</p></div>`;
    o.style.display = on ? 'grid' : 'none';
  }

  window.openLibraryStory = async function (slug) {
    try {
      if (typeof stopVoice === 'function') stopVoice();
      busy(true, '동화책을 꺼내는 중이에요...');
      const base = `${LIB}/${slug}`;
      const r = await fetch(`${base}/story.json?v=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('동화를 찾지 못했어요.');
      const s = await r.json();
      const pages = [];
      for (let i = 0; i < s.pages.length; i++) {
        const p = s.pages[i];
        busy(true, `그림과 목소리를 불러오는 중... ${i + 1}/${s.pages.length}`);
        const page = { page_num: p.page_num, full_text: p.full_text, dialogue_list: p.dialogue_list, imageBase64: '' };
        if (p.image) { const ib = await (await fetch(`${base}/${p.image}`)).blob(); page.imageBase64 = await blobToBase64(ib); }
        if (p.voice && p.voice.file) {
          const vr = await fetch(`${base}/${p.voice.file}`);
          if (vr.ok) page.aiVoice = { blob: await vr.blob(), lines: p.voice.lines || [], lang: 'ko' };
        }
        pages.push(page);
      }
      const book = Object.assign({}, s.english || {}, {
        title: s.title, author: s.author, genre: s.genre || 'fantasy', storyTheme: s.theme || '',
        villagePlace: s.villagePlace || null, pages, isLibraryBook: true, librarySlug: slug,
        youtube: s.youtube || {}, createdAt: s.publishedAt
      });
      if (s.bgm && s.bgm.file) {
        const br = await fetch(`${base}/${s.bgm.file}`);
        if (br.ok) book.customBgm = { name: s.bgm.name || '명작 서가 음악', blob: await br.blob() };
      }
      currentStoryBookObject = book;
      storyUnsaved = false;
      const genreEl = document.getElementById('storyGenre'); if (genreEl) genreEl.value = book.genre;
      currentStoryLanguage = 'ko'; showKoreanAlongsideEnglish = false;
      const t = document.getElementById('story-main-title'); if (t) t.innerText = `📖 ${book.title}`;
      const bc = document.getElementById('book-container'); if (bc) bc.style.display = 'block';
      window.switchTab('create');
      renderBookPages(book); showPage(0);
      if (typeof updateLanguageButtons === 'function') updateLanguageButtons();
      if (typeof updateBgmGenrePreview === 'function') updateBgmGenrePreview(book.genre);
      busy(false);
      setTimeout(() => document.getElementById('book-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
    } catch (e) {
      busy(false);
      alert(`⚠️ ${e.message}`);
    }
  };

  // 도서관 동화를 보고 있을 때만 보이는 띠 (영상 보기 버튼)
  window.updateLibraryBookBar = function () {
    const bar = document.getElementById('libraryBookBar');
    const book = typeof currentStoryBookObject !== 'undefined' ? currentStoryBookObject : null;
    const isLib = !!(book && book.isLibraryBook);
    document.body.classList.toggle('viewing-library-book', isLib);
    if (!bar) return;
    bar.style.display = isLib ? 'flex' : 'none';
    const yt = isLib && book.youtube && (book.youtube.ko || book.youtube.en);
    const vb = bar.querySelector('.ml-bar-video'); if (vb) vb.style.display = yt ? '' : 'none';
  };

  // =====================================================================
  // 3) 보는 쪽 — 영상
  // =====================================================================
  window.openLibraryVideo = async function (slug) {
    let yt = null, title = '';
    if (slug) {
      const hit = (window.__muniLibraryIndex || []).find(x => x.slug === slug);
      if (hit) { yt = hit.youtube; title = hit.title; }
    } else if (currentStoryBookObject && currentStoryBookObject.youtube) {
      yt = currentStoryBookObject.youtube; title = currentStoryBookObject.title;
    }
    if (!yt || !(yt.ko || yt.en)) { alert('이 동화는 아직 영상이 없어요.'); return; }
    if (typeof stopVoice === 'function') stopVoice();
    const m = document.createElement('div');
    m.className = 'ml-video-modal';
    const langs = [['ko', '🇰🇷 한국어'], ['en', '🇬🇧 English']].filter(([k]) => yt[k] && youtubeId(yt[k]));
    m.innerHTML = `
      <div class="ml-video-box">
        <div class="ml-video-head"><b>🎬 ${esc(title)}</b><button type="button" class="ml-video-close">✕</button></div>
        ${langs.length > 1 ? `<div class="ml-video-tabs">${langs.map(([k, l], i) => `<button type="button" data-k="${k}" class="${i === 0 ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}
        <div class="ml-video-frame"></div>
        <a class="ml-video-link" target="_blank" rel="noopener">유튜브에서 열기 ↗</a>
      </div>`;
    document.body.appendChild(m);
    const frame = m.querySelector('.ml-video-frame'), link = m.querySelector('.ml-video-link');
    const show = (k) => {
      const id = youtubeId(yt[k]);
      frame.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1" title="${esc(title)}" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
      link.href = yt[k];
      m.querySelectorAll('.ml-video-tabs button').forEach(b => b.classList.toggle('on', b.dataset.k === k));
    };
    show(langs[0][0]);
    m.querySelectorAll('.ml-video-tabs button').forEach(b => { b.onclick = () => show(b.dataset.k); });
    m.querySelector('.ml-video-close').onclick = () => m.remove();
    m.onclick = (e) => { if (e.target === m) m.remove(); };
  };

  // =====================================================================
  // 3-2) 제작자 — 🗑️ 도서관에서 빼기
  //   목록(index.json)에서 그 동화를 뺀 묶음(zip)을 내려받아 GitHub에 library 폴더째 올린다.
  //   동화 폴더(library/<slug>)는 GitHub 화면에서 Delete directory로 지운다(앱이 저장소를 직접 지울 수 없음).
  //   기기에 "뺀 동화"로 기억해서, 다음에 다른 동화를 올릴 때 목록에 되살아나지 않게 한다.
  // =====================================================================
  window.removeFromLibrary = async function (slug) {
    if (!document.body.classList.contains('is-creator')) return;
    const hit = (window.__muniLibraryIndex || []).find(x => x.slug === slug) || { slug, title: slug };
    if (!confirm(`「${hit.title}」을(를) 다시 읽는 명작에서 뺄까요?\n(도서관 번호: ${slug})\n\n빼기 묶음(zip)을 내려받아 GitHub에 올리면 목록에서 사라져요.`)) return;
    try {
      busy(true, '도서관 목록에서 빼는 중...');
      const JSZip = await loadJSZip();
      setRemoved([...removedSlugs(), slug]);
      forgetPublished(slug);
      const idx = await fetchIndexForPublish();
      idx.stories = idx.stories.filter(x => x.slug !== slug);
      idx.updatedAt = new Date().toISOString();
      let hasFolder = false;
      try { hasFolder = (await fetch(`${LIB}/${slug}/story.json?v=${Date.now()}`, { method: 'HEAD', cache: 'no-store' })).ok; } catch (e) {}
      const zip = new JSZip();
      zip.folder('library').file('index.json', JSON.stringify(idx, null, 2));
      zip.file('도서관에서_빼는법.txt', '\ufeff' + [
        `🗑️ 다시 읽는 명작에서 「${hit.title}」 빼기`, '',
        '1. 이 zip을 풀면 library 폴더가 나와요(안에 index.json 하나).',
        '2. GitHub 저장소(eaimfairytale) → Add file → Upload files 에 library 폴더를 통째로 끌어다 놓기 → Commit changes',
        hasFolder
          ? `3. GitHub에서 library → ${slug} 폴더를 열고, 오른쪽 위 … 메뉴 → Delete directory → Commit changes (그림·목소리 파일 정리)`
          : `3. 이 동화는 저장소에 폴더(library/${slug})가 없어요. 1~2번만 하면 끝이에요.`,
        '4. 1~2분 뒤 도서관을 Ctrl + Shift + R 로 새로고침하면 사라져요.', '',
        '※ 이 기기는 이 동화를 "뺀 동화"로 기억해요. 다른 동화를 올려도 다시 끼어들지 않아요.',
        '※ 같은 원본 동화를 다시 "도서관에 올리기" 하면 목록에 돌아와요.',
        '※ index.json 은 직접 고치지 말고 이 묶음으로 바꿔 주세요.'
      ].join('\r\n'));
      const out = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(out);
      a.download = `eoreuni-classics_빼기_${String(hit.title).replace(/[\\/:*?"<>|]/g, '').slice(0, 24)}.zip`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      busy(false);
      alert(`✅ 빼기 묶음을 내려받았어요.\n\n1) library 폴더째 GitHub에 올리기${hasFolder ? `\n2) GitHub에서 library/${slug} 폴더 → … → Delete directory` : ''}\n\n자세한 순서는 zip 안의 '도서관에서_빼는법.txt'를 보세요.`);
    } catch (e) {
      busy(false);
      alert(`⚠️ ${e.message}`);
    }
  };

  // =====================================================================
  // 4) 올리는 쪽(제작자) — 도서관 묶음 만들기
  // =====================================================================
  window.openLibraryPublish = function () {
    if (!document.body.classList.contains('is-creator')) return;
    const book = currentStoryBookObject;
    if (!book || !book.pages?.length) { alert('먼저 동화를 열어주세요.'); return; }
    if (book.isLibraryBook) { alert('도서관에서 연 동화예요. 수정하려면 선생님 서재의 원본 동화를 열어 다시 올려주세요.'); return; }
    const m = document.createElement('div');
    m.className = 'cm-overlay'; m.style.display = 'grid';
    const hasEn = !!(book.preschoolEnglishPages?.length || book.childEnglishPages?.length || book.englishPages?.length);
    const yt = book.youtube || {};
    m.innerHTML = `
      <div class="cm-box">
        <div class="cm-head"><b>📚 다시 읽는 명작에 올리기</b><button type="button" class="cm-close">✕</button></div>
        <p class="cm-current">「${esc(book.title)}」 · ${book.pages.length}페이지 · ${book.pages.some(p => p.aiVoice?.blob) ? '🎙️ AI 성우 있음' : '🎙️ AI 성우 없음(기본 음성으로 읽어요)'} · ${book.customBgm ? `🎵 ${esc(book.customBgm.name)}` : '🎵 기본 음악'} · ${hasEn ? '🇬🇧 영어판 있음' : '영어판 없음'}</p>
        <div class="ml-form">
          <label>한 줄 소개<input class="mlp-summary" maxlength="80" value="${esc(book.villagePlace?.description || '')}" placeholder="예: 네 친구가 함께 음악대를 만들어요!"></label>
          <label>원작 (선택)<input class="mlp-origin" maxlength="40" placeholder="예: 그림 형제 · 이솝 우화 · 전래동화"></label>
          <label>🎬 한국어 영상 주소 (선택)<input class="mlp-ko" placeholder="https://youtu.be/..." value="${esc(yt.ko || '')}"></label>
          <label>🇬🇧 영어 영상 주소 (선택)<input class="mlp-en" placeholder="https://youtu.be/..." value="${esc(yt.en || '')}"></label>
        </div>
        <button type="button" class="cm-make mlp-go">📦 도서관 묶음 만들기</button>
        <p class="cm-lyria-status mlp-status"></p>
        <p class="cm-note">받은 zip을 풀면 <b>library</b> 폴더가 나와요. GitHub 저장소에 <b>library 폴더째</b> 올리면 1~2분 뒤 누구나 도서관에서 볼 수 있어요.<br>같은 동화를 다시 올리면 그 동화가 새것으로 바뀌어요. 실제 사람 얼굴 사진이나 개인 이야기가 드러나는 동화는 올리지 마세요.</p>
      </div>`;
    document.body.appendChild(m);
    m.querySelector('.cm-close').onclick = () => m.remove();
    m.querySelector('.mlp-go').onclick = async (e) => {
      const btn = e.currentTarget, st = m.querySelector('.mlp-status');
      btn.disabled = true;
      try {
        await buildPackage(book, {
          summary: m.querySelector('.mlp-summary').value.trim(),
          origin: m.querySelector('.mlp-origin').value.trim(),
          youtube: { ko: m.querySelector('.mlp-ko').value.trim(), en: m.querySelector('.mlp-en').value.trim() }
        }, (t) => { st.textContent = t; });
        st.textContent = '✅ 묶음을 내려받았어요. library 폴더째 GitHub에 올려주세요!';
      } catch (err) { st.textContent = `⚠️ ${err.message}`; }
      finally { btn.disabled = false; }
    };
  };

  async function buildPackage(book, info, say) {
    const JSZip = await loadJSZip();
    const zip = new JSZip();
    const slug = book.librarySlug || `s${Date.now().toString(36)}`;
    const dir = zip.folder('library').folder(slug);
    const pages = [];
    let hasVoice = false;
    for (let i = 0; i < book.pages.length; i++) {
      const p = book.pages[i]; const n = String(i + 1).padStart(2, '0');
      say(`🖼️ ${i + 1}/${book.pages.length} 페이지 담는 중...`);
      const out = { page_num: p.page_num || i + 1, full_text: p.full_text || '', dialogue_list: p.dialogue_list || [] };
      if (p.imageBase64) { const jb = await pngToJpegBlob(p.imageBase64); if (jb) { dir.file(`p${n}.jpg`, jb); out.image = `p${n}.jpg`; } }
      if (p.aiVoice?.blob) { const wv = await toVoiceWav16k(p.aiVoice.blob); dir.file(`v${n}.wav`, wv); out.voice = { file: `v${n}.wav`, lines: p.aiVoice.lines || [] }; hasVoice = true; }
      pages.push(out);
    }
    let bgm = null;
    if (book.customBgm?.blob) { const ext = audioExt(book.customBgm.blob); dir.file(`bgm.${ext}`, book.customBgm.blob); bgm = { file: `bgm.${ext}`, name: book.customBgm.name }; }
    // 영어판(글만)
    const english = {};
    Object.keys(book).filter(k => /english/i.test(k)).forEach(k => {
      const v = book[k];
      if (Array.isArray(v)) english[k] = v.map(x => { if (x && typeof x === 'object') { const c = { ...x }; delete c.imageBase64; delete c.aiVoice; return c; } return x; });
      else if (typeof v !== 'object') english[k] = v;
    });
    const hasEnglish = !!(english.preschoolEnglishPages?.length || english.childEnglishPages?.length || english.englishPages?.length);
    const publishedAt = new Date().toISOString();
    const story = {
      version: 1, slug, title: book.title, author: book.author || '', theme: book.storyTheme || '', genre: book.genre || 'fantasy',
      villagePlace: book.villagePlace || null, summary: info.summary, origin: info.origin, youtube: info.youtube,
      publishedAt, bgm, pages, english
    };
    dir.file('story.json', JSON.stringify(story, null, 2));
    // 물음표 없는 동화 주소(…/library/<slug>/)로 들어오면 그 동화를 바로 열어 주는 안내 페이지
    const safeTitle = String(book.title || '').replace(/[<>&"]/g, '');
    dir.file('index.html', `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>📖 ${safeTitle} · 다시 읽는 명작</title><meta name="description" content="${(info.summary || '어른이 동화마을 무료 명작').replace(/[<>&"]/g, '')}"><meta http-equiv="refresh" content="0; url=../../?story=${slug}"><script>location.replace('../../?story=${slug}');</script></head><body><p>📚 동화책을 펼치는 중이에요… <a href="../../?story=${slug}">바로 가기</a></p></body></html>`);
    say('📚 도서관 목록 합치는 중...');
    const idx = await fetchIndexForPublish();
    const entry = { slug, title: book.title, cover: `${slug}/${pages[0]?.image || 'p01.jpg'}`, summary: info.summary, origin: info.origin,
      theme: book.storyTheme || '', genre: book.genre || '', hasVoice, hasEnglish, youtube: info.youtube, author: book.author || '', publishedAt };
    const old = idx.stories.find(s => s.slug === slug);
    if (old && old.publishedAt) entry.publishedAt = old.publishedAt; // 순서 유지
    idx.stories = [entry, ...idx.stories.filter(s => s.slug !== slug)];
    rememberPublished(entry);
    setRemoved(removedSlugs().filter(x => x !== slug)); // 뺐던 동화를 다시 올리면 목록에 돌아와요
    idx.updatedAt = publishedAt;
    zip.folder('library').file('index.json', JSON.stringify(idx, null, 2));
    zip.file('도서관_올리는법.txt', '\ufeff' + [
      '📚 다시 읽는 명작 올리는 법', '',
      '1. 이 zip을 풀면 library 폴더가 나와요.',
      '2. GitHub 저장소(eaimfairytale) → Add file → Upload files 에 library 폴더를 통째로 끌어다 놓기',
      '3. Commit changes → 1~2분 뒤 앱의 🏛️ 다시 읽는 명작에 보여요.', '',
      `※ 이 동화의 도서관 번호(slug): ${slug} — 같은 동화를 다시 올리면 새것으로 바뀌어요.`,
      '※ index.json 은 지금까지 올린 동화 목록이에요(자동으로 합쳐져 있어요). 직접 고치지 말고 library 폴더째 올려주세요.',
      '※ 저장소 맨 바깥의 index.html(앱 화면)은 건드리지 않아요.',
      '※ 여러 편을 연달아 묶었다면 마지막에 만든 묶음의 index.json 이 가장 최신이에요.'
    ].join('\r\n'));
    say('📦 압축하는 중...');
    const out = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(out);
    a.download = `eoreuni-classics_${String(book.title).replace(/[\\/:*?"<>|]/g, '').slice(0, 30)}.zip`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    // 다음에 같은 동화를 올릴 때 같은 번호를 쓰도록 원본 동화에 기억
    book.librarySlug = slug; book.youtube = info.youtube;
    if (book.id) { try { await saveCurrentStoryToDB({ silent: true, localOnly: true }); } catch (e) {} }
  }
})();
