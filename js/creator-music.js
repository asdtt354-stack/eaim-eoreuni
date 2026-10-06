// 🎵 제작자 음악 보관함 — 동화마다 선생님이 만든 곡(수노 등)을 배경음악으로 넣기 (제작자 전용)
// - 곡 파일은 이 기기의 보관함(IndexedDB 'eoreuni_creator_music')에 모아 두고, 동화마다 골라 씁니다.
// - 고른 곡은 동화에 함께 저장됩니다(currentStoryBookObject.customBgm = { name, blob }).
//   파일이 커서 클라우드 서재에는 올리지 않고 이 기기 서재에만 저장합니다(AI 성우 목소리와 같은 방식).
// - 동화 재생·녹화·캡컷 재료에서 기본 7곡 대신 이 곡이 쓰입니다.
(function () {
  const DB = 'eoreuni_creator_music', STORE = 'tracks';
  let dbp = null;
  const urlCache = new WeakMap();

  function openDB() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function allTracks() {
    const db = await openDB();
    return new Promise(res => {
      const q = db.transaction(STORE).objectStore(STORE).getAll();
      q.onsuccess = () => res((q.result || []).sort((a, b) => b.addedAt - a.addedAt));
      q.onerror = () => res([]);
    });
  }
  async function putTrack(t) {
    const db = await openDB();
    return new Promise(res => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(t); tx.oncomplete = res; tx.onerror = res; });
  }
  async function deleteTrack(id) {
    const db = await openDB();
    return new Promise(res => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(id); tx.oncomplete = res; tx.onerror = res; });
  }

  // app.js 의 배경음악 선택에서 부릅니다.
  window.getCustomBgmData = function (book) {
    const cb = book && book.customBgm;
    if (!cb || !(cb.blob instanceof Blob)) return null;
    let url = urlCache.get(cb.blob);
    if (!url) { url = URL.createObjectURL(cb.blob); urlCache.set(cb.blob, url); }
    return { name: cb.name || '선생님 음악', url };
  };

  // ---------- 🎼 리리아(Lyria)로 동화 음악 만들기 ----------
  // 공식 문서(2026-09): generateContent 로 호출, 응답 parts 에 오디오(inlineData, 기본 MP3)와 가사/구조(text)가 함께 온다.
  const LYRIA = { full: 'lyria-3.5', clip: 'lyria-3-clip-preview' };

  function shrinkToJpeg(base64) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 512 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.82).split(',')[1]);
      };
      img.onerror = () => resolve(null);
      img.src = `data:image/png;base64,${base64}`;
    });
  }

  function storyMoodWords(book) {
    const genre = book.genre || 'fantasy';
    const map = {
      fantasy: 'magical, dreamy, sparkling celesta and harp',
      heroic: 'brave, adventurous, light orchestral march',
      mystery: 'curious, playful tiptoe pizzicato',
      scifi: 'wondrous, spacey, soft synth and bells',
      animal: 'warm, cheerful, acoustic folk with ukulele and glockenspiel',
      comic: 'bouncy, funny, playful clarinet and bassoon',
      custom: 'warm, gentle, storybook feeling'
    };
    const bedtime = (document.getElementById('actingStyle') || {}).value === 'bedtime_calm';
    return (bedtime ? 'very calm lullaby, soft piano and music box, ' : '') + (map[genre] || map.custom);
  }

  async function generateLyriaTrack({ kind, length, style, lyrics }) {
    const apiKey = (document.getElementById('apiKey')?.value || '').trim();
    if (apiKey.length < 5) throw new Error('API 키 칸에 선생님 키를 넣어주세요.');
    const book = currentStoryBookObject;
    const title = (typeof getActiveStoryTitle === 'function' ? getActiveStoryTitle(book) : book.title) || '동화';
    const theme = book.storyTheme ? `, about ${book.storyTheme}` : '';
    const place = book.villagePlace ? ` The story takes place at "${book.villagePlace.name}".` : '';
    const extra = style ? ` Style request from the teacher: ${style}.` : '';

    let prompt;
    if (kind === 'bgm') {
      prompt = `Instrumental only, no vocals. Background music for a Korean audio storybook for adults (late-night, calm, reflective) titled "${title}"${theme}.${place} Mood and instruments: ${storyMoodWords(book)}.${extra} Keep it soft and steady so a narrator's voice can be heard clearly on top. Gentle dynamics, no sudden loud parts, loop-friendly ending.${length === 'full' ? ' About 2 minutes long.' : ''} Inspired by the mood and colors of these illustrations.`;
    } else {
      prompt = `어른 동화 「${title}」의 주제가를 만들어 주세요. 잔잔한 어쿠스틱 발라드 느낌, 차분하고 따뜻한 어른 목소리, 한국어 가사.${extra ? ` 선생님 요청: ${style}.` : ''} 삽화의 분위기를 담아 주세요.` +
        (lyrics && lyrics.trim()
          ? `\n\n아래 가사로 불러 주세요:\n${lyrics.trim()}`
          : `\n\n가사는 동화 내용에 맞게 짧고 쉬운 말로, 후렴을 반복해서 만들어 주세요.`);
    }

    const parts = [{ text: prompt }];
    const pics = (book.pages || []).map(p => p.imageBase64).filter(Boolean);
    const pick = pics.length <= 4 ? pics : [pics[0], pics[Math.floor(pics.length / 3)], pics[Math.floor(pics.length * 2 / 3)], pics[pics.length - 1]];
    for (const b64 of pick) {
      const j = await shrinkToJpeg(b64);
      if (j) parts.push({ inlineData: { mimeType: 'image/jpeg', data: j } });
    }

    const model = length === 'clip' ? LYRIA.clip : LYRIA.full;
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(data.error?.message || `음악을 만들지 못했어요 (${res.status}).`);
    let audio = null, mime = 'audio/mpeg'; const texts = [];
    for (const p of (data.candidates?.[0]?.content?.parts || [])) {
      if (p.inlineData?.data) { audio = p.inlineData.data; mime = p.inlineData.mimeType || mime; }
      else if (p.text) texts.push(p.text);
    }
    if (!audio) throw new Error('음악이 오지 않았어요. 요청을 조금 바꿔 다시 만들어 주세요.');
    const bin = atob(audio); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime });
    const name = `${title} ${kind === 'bgm' ? '배경음악' : '주제가'} (리리아${length === 'clip' ? ' 30초' : ''})`;
    return { id: `l${Date.now()}`, name, blob, addedAt: Date.now(), source: 'lyria', lyrics: texts.join('\n').slice(0, 4000) };
  }

  const esc = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let panel = null, preview = null;

  function stopPreview() { if (preview) { preview.pause(); preview = null; } }

  async function applyToStory(track) {
    if (!currentStoryBookObject) return;
    currentStoryBookObject.customBgm = track ? { name: track.name, blob: track.blob } : null;
    if (!track) delete currentStoryBookObject.customBgm;
    // 지금 음악이 나오고 있으면 바로 바꿔서 들려주기
    try {
      if (isBgmEnabled && bgmAudio && !bgmAudio.paused) playBgmForCurrentStory();
      const sel = getCurrentBgmSelection();
      const t = document.getElementById('bgmTitleText');
      if (t) t.innerText = `배경음악: ${sel.data.name}`;
    } catch (e) {}
    if (currentStoryBookObject.id) await saveCurrentStoryToDB({ silent: true, localOnly: true });
    else storyUnsaved = true;
    updateMusicButtonLabel();
  }

  function updateMusicButtonLabel() {
    const b = document.getElementById('customBgmBtn');
    if (!b) return;
    const cur = currentStoryBookObject && currentStoryBookObject.customBgm;
    b.textContent = cur ? `🎵 배경음악: ${cur.name} (바꾸기)` : '🎵 이 동화의 배경음악 고르기 (제작자)';
  }
  window.updateMusicButtonLabel = updateMusicButtonLabel;

  async function render() {
    const list = await allTracks();
    const cur = currentStoryBookObject && currentStoryBookObject.customBgm;
    panel.querySelector('.cm-list').innerHTML = list.length ? list.map(t => `
      <div class="cm-item ${cur && cur.name === t.name ? 'on' : ''}">
        <button type="button" class="cm-play" data-id="${t.id}" title="미리 듣기">▶</button>
        <span class="cm-name">${esc(t.name)}</span>
        <button type="button" class="cm-use" data-id="${t.id}">${cur && cur.name === t.name ? '✓ 사용 중' : '이 곡 쓰기'}</button>
        <button type="button" class="cm-down" data-id="${t.id}" title="파일로 내려받기(캡컷용)">⬇</button>
        <button type="button" class="cm-del" data-id="${t.id}" title="보관함에서 지우기">🗑</button>
      </div>`).join('') : '<p class="cm-empty">아직 올린 곡이 없어요. 아래에서 수노로 만든 곡을 올려 주세요.</p>';
    panel.querySelector('.cm-current').textContent = cur ? `지금 이 동화: ${cur.name}` : '지금 이 동화: 기본 음악(장르별 7곡 중 하나)';
  }

  window.openCreatorMusicShelf = async function () {
    if (!document.body.classList.contains('is-creator')) return;
    if (!currentStoryBookObject) { alert('먼저 동화를 만들거나 서재에서 열어주세요.'); return; }
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'cm-overlay';
      panel.innerHTML = `
        <div class="cm-box">
          <div class="cm-head"><b>🎵 제작자 음악 보관함</b><button type="button" class="cm-close">✕</button></div>
          <p class="cm-current"></p>
          <div class="cm-list"></div>
          <div class="cm-lyria">
            <b>🎼 리리아로 이 동화 음악 만들기</b>
            <div class="cm-row">
              <select class="cm-kind"><option value="bgm">배경음악 (노래 없는 연주곡)</option><option value="song">주제가 (노래)</option></select>
              <select class="cm-len"><option value="full">완성곡 (2분 안팎)</option><option value="clip">짧게 30초 (빠르고 저렴)</option></select>
            </div>
            <input class="cm-style" type="text" maxlength="120" placeholder="원하는 느낌 (선택) 예: 바이올린 중심의 느긋한 왈츠">
            <textarea class="cm-lyrics" rows="5" placeholder="주제가 가사 (선생님이 직접 쓰면 가장 좋아요)&#10;[Verse]&#10;여름 들판에서 노래하는 베짱이&#10;[Chorus]&#10;랄랄라 함께 불러요" style="display:none"></textarea>
            <button type="button" class="cm-make">🎼 만들기 (내 키로 결제 · 한 곡 약 50~150원)</button>
            <p class="cm-lyria-status"></p>
          </div>
          <label class="cm-upload">＋ 새 곡 올리기 (mp3·wav·m4a)<input type="file" accept="audio/*" multiple></label>
          <button type="button" class="cm-reset">기본 음악으로 되돌리기</button>
          <p class="cm-note">곡은 이 기기에 보관돼요. 동화에 넣은 곡은 이 기기 서재에만 함께 저장되고, 녹화·캡컷 재료에 그대로 들어가요.<br>수노 유료 구독 중에 만든 곡만 올려 주세요.</p>
        </div>`;
      document.body.appendChild(panel);
      panel.querySelector('.cm-close').onclick = () => { stopPreview(); panel.style.display = 'none'; };
      panel.querySelector('.cm-kind').onchange = (e) => { panel.querySelector('.cm-lyrics').style.display = e.target.value === 'song' ? 'block' : 'none'; };
      panel.querySelector('.cm-make').onclick = async (e) => {
        const btn = e.currentTarget; const st = panel.querySelector('.cm-lyria-status');
        const kind = panel.querySelector('.cm-kind').value, length = panel.querySelector('.cm-len').value;
        btn.disabled = true; st.textContent = '🎼 리리아가 작곡하는 중이에요... (1~2분 걸릴 수 있어요)';
        try {
          const t = await generateLyriaTrack({ kind, length, style: panel.querySelector('.cm-style').value.trim(), lyrics: panel.querySelector('.cm-lyrics').value });
          await putTrack(t);
          if (kind === 'bgm') { await applyToStory(t); st.textContent = `✅ "${t.name}"을(를) 만들어 이 동화에 넣었어요. ▶로 들어보세요.`; }
          else { st.textContent = `✅ "${t.name}"을(를) 만들었어요. 주제가는 ⬇로 받아 캡컷에서 영상 앞뒤에 넣어 주세요.`; }
          render();
        } catch (err) {
          st.textContent = `⚠️ ${err.message}`;
        } finally { btn.disabled = false; }
      };
      panel.querySelector('.cm-reset').onclick = async () => { stopPreview(); await applyToStory(null); render(); };
      panel.querySelector('.cm-upload input').onchange = async (e) => {
        for (const f of e.target.files) {
          if (!f.type.startsWith('audio/') && !/\.(mp3|wav|m4a|ogg)$/i.test(f.name)) continue;
          if (f.size > 30 * 1024 * 1024) { alert(`${f.name}: 30MB 이하 곡만 올릴 수 있어요.`); continue; }
          await putTrack({ id: `t${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: f.name.replace(/\.[^.]+$/, ''), blob: f, addedAt: Date.now() });
        }
        e.target.value = '';
        render();
      };
      panel.addEventListener('click', async (e) => {
        const b = e.target.closest('button[data-id]');
        if (!b) return;
        const list = await allTracks();
        const t = list.find(x => x.id === b.dataset.id);
        if (!t) return;
        if (b.classList.contains('cm-play')) {
          const again = preview && preview.__id === t.id;
          stopPreview();
          if (!again) { preview = new Audio(URL.createObjectURL(t.blob)); preview.__id = t.id; preview.play().catch(() => {}); }
        } else if (b.classList.contains('cm-use')) {
          stopPreview(); await applyToStory(t); render();
        } else if (b.classList.contains('cm-down')) {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(t.blob);
          a.download = `${t.name}.${/wav/.test(t.blob.type) ? 'wav' : /mp4|m4a|aac/.test(t.blob.type) ? 'm4a' : 'mp3'}`;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 3000);
          if (t.lyrics) {
            const l = document.createElement('a');
            l.href = URL.createObjectURL(new Blob(['\ufeff' + t.lyrics], { type: 'text/plain' }));
            l.download = `${t.name}_가사와구조.txt`;
            document.body.appendChild(l); l.click(); l.remove();
          }
        } else if (b.classList.contains('cm-del')) {
          if (confirm(`"${t.name}"을(를) 보관함에서 지울까요?\n(이미 이 곡을 넣은 동화에는 그대로 남아 있어요)`)) { await deleteTrack(t.id); render(); }
        }
      });
    }
    panel.style.display = 'grid';
    render();
  };
})();
