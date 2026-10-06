// 📱 세로 릴스 만들기 — AI 성우 목소리가 있는 동화를 인스타 릴스·유튜브 쇼츠용 세로(9:16) 영상으로
// 화면 공유 없이 앱이 직접 그림·자막·목소리·배경음악을 섞어 영상을 만듭니다(js/eaim-auto-recorder.js).
// 동화 전체 또는 "명장면만"(원하는 페이지 범위)을 골라 30~60초 맛보기 영상을 만들 수 있어요.
(function () {
  const esc = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function b64ImageUrl(b64) {
    const bin = atob(b64); const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([u], { type: 'image/png' }));
  }

  window.openReelsMaker = function () {
    const book = currentStoryBookObject;
    if (!book || !book.pages?.length) { alert('먼저 동화를 열어주세요.'); return; }
    if (typeof isEnglishStoryMode === 'function' && isEnglishStoryMode()) { alert('세로 릴스는 지금 한국어(AI 성우 목소리)로만 만들 수 있어요. 한국어로 바꾼 뒤 눌러 주세요.'); return; }
    const voiced = book.pages.map((p, i) => ({ i, ok: !!p.aiVoice?.blob }));
    if (!voiced.some(v => v.ok)) { alert('🎙️ AI 성우 목소리가 있는 동화만 릴스로 만들 수 있어요.\n먼저 "AI 성우 목소리 입히기"를 해 주세요.'); return; }
    try { stopVoice(); } catch (e) {}

    const n = book.pages.length;
    const opts = book.pages.map((p, i) => `<option value="${i}">${i + 1}페이지</option>`).join('');
    const isCreator = document.body.classList.contains('is-creator');
    // 🇬🇧 영어판이 있으면: 제목 화면 배지 + 영어 자막(선택) + 끝 화면 문구로 알린다
    const enPages = (() => {
      if (typeof getEnglishBundle !== 'function') return [];
      for (const lv of ['preschool', 'child']) { const b = getEnglishBundle(book, lv); if (b.pages && b.pages.length) return b.pages; }
      return [];
    })();
    const hasEn = enPages.length > 0;
    const endDefault = hasEn ? '🎧 영어로도 들을 수 있어요! 전체 동화는 프로필 링크에서 📚' : '전체 동화는 프로필 링크에서 📚';
    const m = document.createElement('div');
    m.className = 'cm-overlay'; m.style.display = 'grid';
    m.innerHTML = `
      <div class="cm-box">
        <div class="cm-head"><b>📱 세로 릴스 만들기</b><button type="button" class="cm-close">✕</button></div>
        <p class="cm-current">인스타 릴스·유튜브 쇼츠용 <b>세로(9:16)</b> 영상을 앱이 직접 만들어요. 화면 공유가 필요 없어요.</p>
        <div class="ml-form">
          <label>어디부터 어디까지?
            <div class="cm-row"><select class="rl-from">${opts}</select><select class="rl-to">${opts}</select></div>
          </label>
          <label class="rl-hint">💡 릴스는 <b>30~60초</b>가 좋아요. 명장면 1~2페이지만 고르면 딱 맞아요.</label>
          ${hasEn ? '<label class="rl-check"><input type="checkbox" class="rl-en" checked> 🇬🇧 영어 자막도 함께 넣기 <small>(한국어 자막 아래 작게 · 제목 화면에 \'한국어 + English\' 표시)</small></label>' : ''}
          <label>끝 화면 문구<input class="rl-end" maxlength="50" value="${esc(endDefault)}"></label>
        </div>
        <button type="button" class="cm-make rl-go">🎬 릴스 만들기</button>
        <p class="cm-lyria-status rl-status"></p>
        <div class="rl-preview"></div>
        <p class="cm-note">만드는 동안 이 화면을 켜 둔 채 기다려 주세요(다른 탭으로 가면 영상이 끊겨요). 영상 길이만큼 시간이 걸려요.</p>
      </div>`;
    document.body.appendChild(m);
    const from = m.querySelector('.rl-from'), to = m.querySelector('.rl-to');
    const first = voiced.find(v => v.ok).i;
    from.value = String(first); to.value = String(Math.min(n - 1, first + 1));
    m.querySelector('.cm-close').onclick = () => { if (rec) rec.stop(); m.remove(); };
    let rec = null;

    // 중간 페이지부터 만들 때도 제목은 읽어야 하므로: 첫 페이지 목소리에서 "제목: …" 부분만 잘라 쓴다
    //   (목소리 줄 길이 비율로 제목 끝을 어림한 뒤, 그 근처의 조용한 틈에서 자름)
    async function titleClipUrl() {
      const p0 = book.pages[0], v = p0 && p0.aiVoice;
      if (!v || !v.blob || !(v.lines || []).length || !/^(제목|Title)\s*:/.test(v.lines[0].text)) return null;
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      try {
        const buf = await ac.decodeAudioData(await v.blob.arrayBuffer());
        const ws = v.lines.map(l => l.text.replace(/^(제목|Title)\s*:\s*/, '').length + 6);
        const est = buf.duration * ws[0] / ws.reduce((a, b) => a + b, 0);
        const ch = buf.getChannelData(0), sr = buf.sampleRate, win = Math.round(sr * 0.02);
        const rms = i => { let q = 0; for (let k = i; k < i + win && k < ch.length; k++) q += ch[k] * ch[k]; return Math.sqrt(q / win); };
        let cut = est + 0.15, best = 0;
        for (let t = Math.max(0.4, est * 0.6); t < Math.min(buf.duration - 0.2, est * 1.7); t += 0.02) {
          let run = 0; while (t + run < buf.duration && rms(Math.round((t + run) * sr)) < 0.012) run += 0.02;
          if (run >= 0.2 && run > best) { best = run; cut = t + run / 2; }
          if (run) t += run;
        }
        const n = Math.min(ch.length, Math.round(cut * sr));
        const out = new ArrayBuffer(44 + n * 2), dv = new DataView(out);
        const w = (o, str) => { for (let i = 0; i < str.length; i++) dv.setUint8(o + i, str.charCodeAt(i)); };
        w(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true);
        dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true);
        dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 2, true);
        for (let i = 0; i < n; i++) { const x = Math.max(-1, Math.min(1, ch[i])); dv.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
        return URL.createObjectURL(new Blob([out], { type: 'audio/wav' }));
      } catch (e) { console.warn('제목 목소리 자르기 실패', e); return null; }
      finally { try { ac.close(); } catch (e) {} }
    }

    m.querySelector('.rl-go').onclick = async (e) => {
      const btn = e.currentTarget, st = m.querySelector('.rl-status');
      let a = +from.value, b = +to.value; if (a > b) [a, b] = [b, a];
      const picked = [];
      for (let i = a; i <= b; i++) if (book.pages[i]?.aiVoice?.blob) picked.push(i);
      if (!picked.length) { st.textContent = '⚠️ 고른 페이지에 AI 성우 목소리가 없어요.'; return; }
      btn.disabled = true;
      const urls = [];
      const withEn = hasEn && !!m.querySelector('.rl-en')?.checked;
      // 영어 문장을 한국어 자막 줄 수에 맞춰 나눈다(번역은 줄 수를 맞춰 만들지만, 다르면 문장을 고르게 나눔)
      const englishLinesFor = (i, n) => {
        const ep = enPages[i]; if (!ep || !n) return [];
        const dl = (ep.dialogue_list || []).map(d => String(d.text || '').replace(/[*#"]/g, '').trim()).filter(Boolean);
        if (dl.length === n) return dl;
        const sents = (dl.length ? dl.join(' ') : String(ep.full_text || '')).match(/[^.!?]+[.!?]*/g)?.map(s => s.trim()).filter(Boolean) || [];
        if (!sents.length) return [];
        const out = []; let last = '';
        for (let k = 0; k < n; k++) {
          const part = sents.slice(Math.floor(k * sents.length / n), Math.floor((k + 1) * sents.length / n)).join(' ');
          last = part || last; out.push(part || last);
        }
        return out;
      };
      try {
        const scenes = picked.map(i => {
          const p = book.pages[i];
          const img = p.imageBase64 ? b64ImageUrl(p.imageBase64) : null; if (img) urls.push(img);
          const voice = URL.createObjectURL(p.aiVoice.blob); urls.push(voice);
          const all = p.aiVoice.lines || [];
          const isTitle = l => /^(제목|Title)\s*:/.test(l.text);
          const lines = all.filter(l => !isTitle(l));
          // 첫 페이지 목소리는 "제목: …"부터 읽는다 → 그 줄도 자막 시간에 넣고, 읽는 동안 제목 카드를 보여 준다
          const titleLine = all.length && isTitle(all[0]) ? all[0] : null;
          const caps = (titleLine ? [titleLine] : []).concat(lines);
          const scene = {
            title: '', images: img ? [img] : [],
            number: { src: voice, volume: 1 },
            captions: caps.map(l => l.text.replace(/^(제목|Title)\s*:\s*/, '')),
            captionWeights: caps.map(l => l.text.replace(/^(제목|Title)\s*:\s*/, '').length + 6)
          };
          if (titleLine) scene.titleLine = true;
          if (withEn) { const en = englishLinesFor(i, lines.length); scene.subCaptions = titleLine ? [''].concat(en) : en; }
          return scene;
        });
        const sel = typeof getCurrentBgmSelection === 'function' ? getCurrentBgmSelection() : null;
        const title = typeof getActiveStoryTitle === 'function' ? getActiveStoryTitle(book) : book.title;
        // 중간부터 만들면 첫 페이지 목소리의 제목 부분을 맨 앞에 붙인다(그동안 제목 카드)
        if (picked[0] !== 0) {
          const tu = await titleClipUrl();
          if (tu) {
            urls.push(tu);
            scenes.unshift({ title: '', images: scenes[0].images.slice(0, 1), number: { src: tu, volume: 1 },
              captions: [title], captionWeights: [1], titleLine: true, ...(withEn ? { subCaptions: [''] } : {}) });
          }
        }
        rec = EAIMAutoRecorder.create({
          vertical: true,
          title, subtitle: isCreator || book.isLibraryBook ? '다시 읽는 명작' : '어른이 동화마을',
          titleBadge: withEn ? '한국어 + English 🎧' : '',
          bandText: isCreator || book.isLibraryBook ? '♪ 다시 읽는 명작' : '♪ 어른이 동화마을',
          logoSrc: './assets/mutoniz-logo.png',
          endText: m.querySelector('.rl-end').value.trim() || endDefault,
          endSub: '어른이 동화마을 · MUTONIZ',
          globalBgm: sel && isBgmEnabled ? { src: sel.data.url, volume: 0.2 } : null,
          scenes,
          fileName: `${String(title).replace(/[\\/:*?"<>|]/g, '').slice(0, 30)}_릴스`,
          onProgress: (pr) => { st.textContent = pr.label === '녹화 중' ? `🎬 만드는 중... ${Math.round(pr.ratio * 100)}%` : `⏳ ${pr.label}`; }
        });
        const info = await rec.prepare();
        st.textContent = `🎬 만드는 중... (약 ${Math.round(info.seconds)}초 걸려요)`;
        const r = await rec.start();
        st.textContent = `✅ 완성! ${r.seconds}초짜리 세로 영상이에요.`;
        m.querySelector('.rl-preview').innerHTML = `<video src="${r.url}" controls playsinline></video><button type="button" class="cm-make rl-down">⬇️ 영상 저장하기</button>`;
        m.querySelector('.rl-down').onclick = () => rec.download(r);
      } catch (err) {
        console.error(err); st.textContent = `⚠️ ${err.message || err}`;
      } finally {
        btn.disabled = false;
        setTimeout(() => urls.forEach(u => URL.revokeObjectURL(u)), 60000);
      }
    };
  };
})();
