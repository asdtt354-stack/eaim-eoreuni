// eaim-auto-recorder.js — EAIM 자동 녹화 모듈 v1.2 (v1.1 세로 릴스·전체 배경음악·자막 비율 + v1.2 둘째 자막 subCaptions·제목 배지 titleBadge·세로 자막을 쇼츠 버튼 위로) (2026-10-05, 공통규칙 5-4 기준 구현)
//
// 무엇을 하나요?
//   장면(scene) 목록을 받아서, 화면 공유 없이 앱이 직접 16:9 영상(mp4 우선, 안 되면 webm)을 만듭니다.
//   - 소리 층(레이어): 넘버(주 음악) · 배경음악 · 장면전환 음악을 앱 안의 믹서(Web Audio)로 섞어서 녹화
//   - 화면: 제목 카드 → (장면전환 카드) → 장면 그림(곡 길이에 맞춰 자동으로 넘어감, 천천히 확대) + 자막 → 끝 카드
//   - 버튼 한 번이면 끝까지 자동. 중간에 stop()을 부르면 거기까지 저장.
//
// 사용법 (예)
//   const rec = EAIMAutoRecorder.create({
//     title: '숲속의 친구들',                 // 제목 카드
//     subtitle: '뮤지컬메이커',               // 제목 카드 아래 작은 글씨 (학생 이름·번호는 넣지 않기!)
//     brand: 'MUTONIZ',                      // 끝 카드 글씨
//     logoSrc: './assets/mutoniz.png',       // (선택) 제목·끝 카드 로고 — 같은 주소이거나 CORS 허용 필요
//     titleBadge: '한국어 + English 🎧',       // (선택, v1.2) 제목 카드 아래 둥근 배지
//     scenes: [
//       { title: '1장 · 숲속의 아침',
//         images: ['https://…/scene1a.png', 'https://…/scene1b.png'],
//         bgm:    { src: 'https://…/bgm1.mp3', volume: 0.35 },        // 배경음악 (선택)
//         bgmIntro: 6,                                               // 넘버 전에 배경음악만 흐르는 초 (선택)
//         bgmMode: 'fade',                                           // 넘버가 나오면 'fade'(사라짐) | 'duck'(작게 계속)
//         number: { src: 'https://…/song1.mp3', volume: 1 },         // 넘버 (선택)
//         captions: ['숲속에 아침이 밝았어요', '새들이 노래해요'],     // 자막: 장면 길이에 고르게 나눔
//         subCaptions: ['Morning comes to the forest.', 'Birds sing.'], // (선택, v1.2) 자막 아래 작은 둘째 자막(영어 등) — captions와 같은 순서
//         titleLine: true,   // (선택, v1.2) captions[0]이 목소리로 읽는 제목 → 그동안 제목 카드를 보여 주고, 첫 장면이면 소리 없는 제목 카드는 뺀다
//         // 또는 lyrics: [{ t: 0, text: '…' }, { t: 12.5, text: '…' }]  // 넘버 시작 기준 초
//         transitionBefore: { src: 'https://…/transition.mp3' }      // (선택) 이 장면 앞 장면전환 음악 + 장면 카드
//       },
//       …
//     ],
//     fileName: '숲속의친구들_뮤지컬메이커',
//     onProgress: (p) => console.log(p.label, p.ratio)
//   });
//   await rec.prepare();        // 모든 소리·그림 미리 불러오기 (끊김 방지)
//   const result = await rec.start();   // 반드시 버튼 클릭 안에서 호출 (소리 재생 권한)
//   // result = { blob, url, fileName, mime, seconds }
//   rec.download(result);       // 파일로 저장
//
// 꼭 알아둘 점
//   - 녹화하는 동안 이 탭을 **화면에 띄워 두세요**. 다른 탭으로 가면 브라우저가 그리기를 늦춰 영상이 끊깁니다.
//   - Firebase Storage 등 다른 주소의 그림·소리는 **CORS 허용**이 되어 있어야 합니다(안 되면 그림이 빠지거나 소리가 무음).
//   - 녹화는 실시간입니다. 5분짜리 뮤지컬은 녹화에도 5분이 걸립니다.
//   - 영상은 메모리에 쌓이므로 한 파일은 20분 이내를 권장합니다. 더 길면 곡(장면)별로 나눠 녹화하세요.
(function (global) {
  const FPS = 30;
  const FONT = '"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif';
  const CARD_SEC = 3, END_SEC = 4, SCENE_CARD_SEC = 2.2, TAIL_SEC = 0.8, FADE = 1.5;

  function pickMime() {
    const list = ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4',
      'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    return list.find(t => { try { return MediaRecorder.isTypeSupported(t); } catch (e) { return false; } }) || '';
  }

  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => { console.warn('[recorder] 그림을 불러오지 못함:', src); resolve(null); };
      img.src = src;
    });
  }

  async function loadAudio(ac, src) {
    if (!src) return null;
    try {
      const res = await fetch(src, { mode: 'cors' });
      if (!res.ok) throw new Error(res.status);
      return await ac.decodeAudioData(await res.arrayBuffer());
    } catch (e) {
      console.warn('[recorder] 소리를 불러오지 못함(CORS 확인):', src, e);
      return null;
    }
  }

  function wrapText(ctx, text, maxW) {
    const words = String(text || '').split(/\s+/); const lines = []; let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width <= maxW) { line = t; continue; }
      if (line) lines.push(line);
      line = w;
    }
    if (line) lines.push(line);
    return lines;
  }

  function create(opts) {
    const o = Object.assign({ title: '', subtitle: '', brand: 'MUTONIZ', scenes: [], fileName: 'eaim-video' }, opts || {});
    // vertical: true → 1080×1920 세로(릴스·쇼츠)
    const W = o.vertical ? 1080 : 1920, H = o.vertical ? 1920 : 1080;
    let globalBgmBuf = null, brandLogo = null;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    let ac = null, timeline = [], totalSec = 0, logo = null;
    let recorder = null, chunks = [], rafId = null, t0 = 0, stopRequested = false, finishResolve = null;
    const progress = (label, ratio) => { try { o.onProgress && o.onProgress({ label, ratio }); } catch (e) {} };

    // ---------- 1. 미리 불러오기 + 시간표 만들기 ----------
    async function prepare() {
      ac = new (global.AudioContext || global.webkitAudioContext)();
      logo = o.logoSrc ? await loadImage(o.logoSrc) : null;
      brandLogo = logo;
      if (o.globalBgm && o.globalBgm.src) globalBgmBuf = await loadAudio(ac, o.globalBgm.src);
      const n = o.scenes.length;
      for (let i = 0; i < n; i++) {
        const sc = o.scenes[i];
        progress(`불러오는 중 ${i + 1}/${n}`, i / n);
        sc._imgs = (await Promise.all((sc.images || []).map(loadImage))).filter(Boolean);
        sc._num = await loadAudio(ac, sc.number && sc.number.src);
        sc._bgm = await loadAudio(ac, sc.bgm && sc.bgm.src);
        sc._tr = await loadAudio(ac, sc.transitionBefore && sc.transitionBefore.src);
      }
      buildTimeline();
      progress('준비 완료', 1);
      return { seconds: totalSec };
    }

    function buildTimeline() {
      timeline = []; let t = 0;
      // 첫 장면 목소리가 제목부터 읽으면(titleLine) 소리 없는 제목 카드 대신 그 목소리에 맞춰 제목 카드를 보여 준다
      if (!(o.scenes[0] && o.scenes[0].titleLine)) { timeline.push({ kind: 'title', start: t, end: t + CARD_SEC }); t += CARD_SEC; }
      for (const sc of o.scenes) {
        if (sc._tr || sc.transitionBefore) {
          const d = Math.max(SCENE_CARD_SEC, sc._tr ? sc._tr.duration : 0);
          timeline.push({ kind: 'sceneCard', scene: sc, start: t, end: t + d, audio: sc._tr ? [{ buf: sc._tr, at: t, vol: (sc.transitionBefore.volume ?? 1) }] : [] });
          t += d;
        } else if (sc.title) {
          timeline.push({ kind: 'sceneCard', scene: sc, start: t, end: t + SCENE_CARD_SEC, audio: [] });
          t += SCENE_CARD_SEC;
        }
        const intro = sc._num && sc._bgm ? Math.max(0, Number(sc.bgmIntro) || 0) : 0;
        const numDur = sc._num ? sc._num.duration : 0;
        let dur = sc._num ? intro + numDur : (Number(sc.duration) || (sc._bgm ? sc._bgm.duration : 6));
        dur += TAIL_SEC;
        const item = { kind: 'scene', scene: sc, start: t, end: t + dur, numStart: t + intro, numEnd: t + intro + numDur };
        timeline.push(item);
        t += dur;
      }
      timeline.push({ kind: 'end', start: t, end: t + END_SEC }); t += END_SEC;
      totalSec = t;
    }

    // ---------- 2. 소리 예약 (믹서) ----------
    function scheduleAudio(dest, base) {
      const master = ac.createGain(); master.gain.value = 1;
      master.connect(dest);
      master.connect(ac.destination); // 선생님도 들을 수 있게
      const play = (buf, when, vol, opts2 = {}) => {
        if (!buf) return ac.createGain();
        const src = ac.createBufferSource(); src.buffer = buf; src.loop = !!opts2.loop;
        const g = ac.createGain(); src.connect(g); g.connect(master);
        g.gain.setValueAtTime(vol, base + when);
        src.start(base + when);
        if (opts2.stopAt) src.stop(base + opts2.stopAt);
        return g;
      };
      // 작품 전체에 한 곡으로 깔리는 배경음악 (반복, 처음·끝 부드럽게)
      if (globalBgmBuf) {
        const gv = o.globalBgm.volume ?? 0.22;
        const g = play(globalBgmBuf, 0, gv, { loop: true, stopAt: totalSec + 0.05 }).gain;
        g.setValueAtTime(0.0001, base); g.linearRampToValueAtTime(gv, base + 1.2);
        g.setValueAtTime(gv, base + Math.max(1.2, totalSec - 2.5)); g.linearRampToValueAtTime(0.0001, base + totalSec);
      }
      for (const it of timeline) {
        (it.audio || []).forEach(a => play(a.buf, a.at, a.vol));
        if (it.kind !== 'scene') continue;
        const sc = it.scene;
        if (sc._num) play(sc._num, it.numStart, sc.number.volume ?? 1);
        if (sc._bgm) {
          const vol = sc.bgm.volume ?? 0.35;
          const g = play(sc._bgm, it.start, vol, { loop: sc.bgm.loop !== false, stopAt: it.end + 0.05 });
          const gp = g.gain;
          gp.setValueAtTime(0, base + it.start);
          gp.linearRampToValueAtTime(vol, base + it.start + 0.8);
          if (sc._num) {
            const target = sc.bgmMode === 'duck' ? vol * 0.25 : 0.0001;
            gp.setValueAtTime(vol, base + Math.max(it.start + 0.8, it.numStart - FADE));
            gp.linearRampToValueAtTime(target, base + it.numStart + 0.2);
            gp.setValueAtTime(target, base + it.end - FADE);
          } else {
            gp.setValueAtTime(vol, base + it.end - FADE);
          }
          gp.linearRampToValueAtTime(0.0001, base + it.end);
        }
      }
    }

    // ---------- 3. 화면 그리기 ----------
    function drawCover(img, zoom = 1) {
      ctx.fillStyle = '#1d1530'; ctx.fillRect(0, 0, W, H);
      if (!img) return;
      const cs = Math.max(W / img.width, H / img.height) * 1.08;
      ctx.save(); ctx.filter = 'blur(36px) brightness(0.55)';
      ctx.drawImage(img, (W - img.width * cs) / 2, (H - img.height * cs) / 2, img.width * cs, img.height * cs);
      ctx.restore();
      if (o.vertical) {
        // 세로: 위쪽 띠·로고와 아래 자막 사이(화면 19%~61%)에 그림을 놓아 자막이 그림을 가리지 않게
        const top = H * 0.19, bottom = H * 0.61, cy = (top + bottom) / 2;
        const fv = Math.min(W / img.width, (bottom - top) / img.height) * zoom;
        ctx.drawImage(img, (W - img.width * fv) / 2, cy - img.height * fv / 2, img.width * fv, img.height * fv);
        return;
      }
      const fs = Math.min(W / img.width, H / img.height) * zoom;
      ctx.drawImage(img, (W - img.width * fs) / 2, (H - img.height * fs) / 2, img.width * fs, img.height * fs);
    }

    function drawCard(big, small, alpha = 1, badge = '') {
      const g = ctx.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, W * 0.7);
      g.addColorStop(0, '#fff8e6'); g.addColorStop(0.55, '#fde7f3'); g.addColorStop(1, '#e9ddff');
      ctx.globalAlpha = alpha; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const top = o.vertical ? H * 0.30 : H * 0.14;
      let y = o.vertical ? H * 0.42 : H * 0.36;
      // 세로: 인스타·쇼츠 목록 칸은 양옆이 잘리므로 로고·제목을 가운데 약 70% 안에 둔다
      if (logo) {
        const lw = W * (o.vertical ? 0.52 : 0.34), lh = logo.height * lw / logo.width;
        ctx.drawImage(logo, (W - lw) / 2, top, lw, lh); y = top + lh + 60;
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const bigPx = o.vertical ? 74 : 88;
      ctx.fillStyle = '#4a2f8f'; ctx.font = `900 ${bigPx}px ${FONT}`;
      for (const line of wrapText(ctx, big, W * (o.vertical ? 0.68 : 0.84))) { ctx.fillText(line, W / 2, y); y += Math.round(bigPx * 1.25); }
      if (small) { ctx.fillStyle = '#8a6a3a'; ctx.font = `800 40px ${FONT}`; ctx.fillText(small, W / 2, y + 12); y += 64; }
      if (badge) {
        ctx.font = `900 ${o.vertical ? 42 : 36}px ${FONT}`; ctx.textBaseline = 'middle';
        const bw = ctx.measureText(badge).width + 64, bh = o.vertical ? 76 : 66, bx = (W - bw) / 2, by = y + 28;
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, bh / 2) : ctx.rect(bx, by, bw, bh); ctx.fill();
        ctx.lineWidth = 4; ctx.strokeStyle = '#c9a8f5'; ctx.stroke();
        ctx.fillStyle = '#6a3fb0'; ctx.fillText(badge, W / 2, by + bh / 2 + 2);
      }
      ctx.globalAlpha = 1;
    }

    function drawCaption(text, sub = '') {
      if (!text && !sub) return;
      // 세로(쇼츠·릴스): 아래쪽 약 22%는 채널 이름·제목, 오른쪽은 좋아요·댓글 버튼 자리 → 자막을 그 위·안쪽에
      const maxW = W * (o.vertical ? 0.70 : 0.78);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const mainFont = `800 ${o.vertical ? 56 : 48}px ${FONT}`, subFont = `700 ${o.vertical ? 40 : 34}px ${FONT}`;
      ctx.font = mainFont;
      const lines = text ? wrapText(ctx, text, maxW).slice(0, o.vertical ? 3 : 2) : [];
      const mainW = lines.length ? Math.max(...lines.map(l => ctx.measureText(l).width)) : 0;
      ctx.font = subFont;
      const subLines = sub ? wrapText(ctx, sub, maxW).slice(0, 2) : [];
      const subW = subLines.length ? Math.max(...subLines.map(l => ctx.measureText(l).width)) : 0;
      const lh = o.vertical ? 74 : 64, slh = o.vertical ? 54 : 46, gap = lines.length && subLines.length ? 14 : 0;
      const boxH = lines.length * lh + gap + subLines.length * slh + 44;
      const boxW = Math.min(W * (o.vertical ? 0.78 : 0.9), Math.max(mainW, subW) + 90);
      const x = (W - boxW) / 2, y = H - boxH - (o.vertical ? Math.round(H * 0.22) : 60);
      ctx.fillStyle = 'rgba(20,15,34,0.72)';
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, boxW, boxH, 28) : ctx.rect(x, y, boxW, boxH); ctx.fill();
      ctx.font = mainFont; ctx.fillStyle = '#fff';
      lines.forEach((l, i) => ctx.fillText(l, W / 2, y + 22 + lh / 2 + i * lh));
      if (subLines.length) {
        ctx.font = subFont; ctx.fillStyle = '#ffe58a';
        const sy = y + 22 + lines.length * lh + gap;
        subLines.forEach((l, i) => ctx.fillText(l, W / 2, sy + slh / 2 + i * slh));
      }
    }

    function drawBrandTop() {
      // 세로 화면 위쪽: 띠 글씨 + 로고 (릴스에서 채널이 보이게)
      let y = 110;
      if (o.bandText) {
        ctx.font = `900 44px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const w = ctx.measureText(o.bandText).width + 70, h = 78, x = (W - w) / 2;
        const g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, '#ff8fc4'); g.addColorStop(1, '#b08cf5');
        ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, h / 2) : ctx.rect(x, y, w, h); ctx.fill();
        ctx.lineWidth = 5; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.lineWidth = 8; ctx.strokeStyle = '#6e3c96'; ctx.strokeText(o.bandText, W / 2, y + h / 2 + 2);
        ctx.fillStyle = '#fff'; ctx.fillText(o.bandText, W / 2, y + h / 2 + 2);
        y += h + 18;
      }
      if (brandLogo) { const lw = W * 0.42, lh = brandLogo.height * lw / brandLogo.width; ctx.drawImage(brandLogo, (W - lw) / 2, y, lw, lh); }
    }

    // 지금 보여 줄 자막 번호(captions 기준). 가사(lyrics) 모드면 -1
    function captionIndexAt(sc, it, t) {
      const caps = sc.captions || [];
      if (!caps.length) return -1;
      if (Array.isArray(sc.captionWeights) && sc.captionWeights.length === caps.length && it.numEnd > it.numStart) {
        const total = sc.captionWeights.reduce((a, b) => a + b, 0) || 1;
        const f = Math.max(0, Math.min(0.999, (t - it.numStart) / (it.numEnd - it.numStart))) * total;
        let acc = 0;
        for (let i = 0; i < caps.length; i++) { acc += sc.captionWeights[i]; if (f < acc) return i; }
        return caps.length - 1;
      }
      return Math.min(caps.length - 1, Math.floor((t - it.start) / ((it.end - it.start) / caps.length)));
    }
    function captionAt(sc, it, t) {
      if (Array.isArray(sc.lyrics) && sc.lyrics.length && t >= it.numStart) {
        const rel = t - it.numStart; let cur = '';
        for (const l of sc.lyrics) { if (rel >= l.t) cur = l.text; }
        return cur;
      }
      const i = captionIndexAt(sc, it, t);
      return i < 0 ? '' : sc.captions[i];
    }
    function subCaptionAt(sc, it, t) {
      if (!Array.isArray(sc.subCaptions) || !sc.subCaptions.length) return '';
      if (Array.isArray(sc.lyrics) && sc.lyrics.length && t >= it.numStart) return '';
      const i = captionIndexAt(sc, it, t);
      return i < 0 ? '' : (sc.subCaptions[i] || '');
    }

    function render(t) {
      const it = timeline.find(x => t >= x.start && t < x.end) || timeline[timeline.length - 1];
      const local = t - it.start, len = it.end - it.start;
      if (it.kind === 'title') { drawCard(o.title, o.subtitle, 1, o.titleBadge || ''); return; }
      if (it.kind === 'end') { drawCard(o.endText || '끝', o.endSub || o.brand); return; }
      const sc = it.scene;
      if (it.kind === 'sceneCard') { drawCover(sc._imgs[0], 1); ctx.fillStyle = 'rgba(20,15,34,0.45)'; ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.font = `900 96px ${FONT}`;
        ctx.fillText(sc.title || '', W / 2, H / 2); return; }
      // 제목을 읽는 동안은 제목 카드 → 다 읽으면 0.5초 동안 그림으로 넘어감
      let titleFade = 0;
      if (sc.titleLine && (sc.captions || []).length) {
        const ws = Array.isArray(sc.captionWeights) && sc.captionWeights.length === sc.captions.length ? sc.captionWeights : sc.captions.map(() => 1);
        const sum = ws.reduce((a, b) => a + b, 0) || 1;
        const tb = it.numStart + (it.numEnd - it.numStart) * (ws[0] / sum);
        if (t < tb) { drawCard(o.title, o.subtitle, 1, o.titleBadge || ''); return; }
        if (t < tb + 0.5) titleFade = 1 - (t - tb) / 0.5;
      }
      // 장면: 그림을 장면 길이에 고르게 나누고, 각 그림은 천천히 확대
      const imgs = sc._imgs.length ? sc._imgs : [null];
      const per = len / imgs.length;
      const k = Math.min(imgs.length - 1, Math.floor(local / per));
      const within = (local - k * per) / per;
      drawCover(imgs[k], 1 + 0.06 * within);
      // 그림이 바뀔 때 0.6초 겹쳐 사라지기
      const fadeIn = Math.min(1, (local - k * per) / 0.6);
      if (k > 0 && fadeIn < 1) { ctx.globalAlpha = 1 - fadeIn; drawCover(imgs[k - 1], 1.06); ctx.globalAlpha = 1; }
      const capNow = captionAt(sc, it, t);
      if (!(sc.titleLine && capNow === sc.captions[0])) drawCaption(capNow, subCaptionAt(sc, it, t));
      if (o.vertical) drawBrandTop();
      if (titleFade > 0) { ctx.save(); ctx.globalAlpha = titleFade; drawCard(o.title, o.subtitle, 1, o.titleBadge || ''); ctx.restore(); }
      // 오른쪽 위 장면 표시
      if (sc.title) { ctx.font = `800 30px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
        const w = ctx.measureText(sc.title).width + 40; ctx.fillStyle = 'rgba(20,15,34,0.5)';
        ctx.fillRect(W - w - 36, 36, w, 52); ctx.fillStyle = '#fff'; ctx.fillText(sc.title, W - 56, 46); }
      // 장면 시작·끝 부드럽게
      const edge = Math.min(local, len - local);
      if (edge < 0.5) { ctx.fillStyle = `rgba(0,0,0,${1 - edge / 0.5})`; ctx.fillRect(0, 0, W, H); }
    }

    // ---------- 4. 녹화 ----------
    async function start() {
      if (!timeline.length) await prepare();
      if (ac.state === 'suspended') await ac.resume();
      const mime = pickMime();
      const dest = ac.createMediaStreamDestination();
      const stream = canvas.captureStream(FPS);
      dest.stream.getAudioTracks().forEach(tr => stream.addTrack(tr));
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 10000000, audioBitsPerSecond: 192000 } : undefined);
      chunks = [];
      recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      const done = new Promise(res => { finishResolve = res; });
      recorder.onstop = () => {
        const type = (recorder.mimeType || mime || 'video/webm').split(';')[0];
        const blob = new Blob(chunks, { type });
        finishResolve({ blob, url: URL.createObjectURL(blob), mime: type, seconds: Math.round(ac.currentTime - t0),
          fileName: `${String(o.fileName).replace(/[\\/:*?"<>|]/g, '')}.${type.includes('mp4') ? 'mp4' : 'webm'}` });
      };
      render(0);
      recorder.start(1000);
      t0 = ac.currentTime + 0.25;           // 소리 예약 기준 시각
      scheduleAudio(dest, t0);
      const tick = () => {
        const t = ac.currentTime - t0;
        if (stopRequested || t >= totalSec) { finish(); return; }
        render(Math.max(0, t));
        progress('녹화 중', Math.max(0, t) / totalSec);
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
      return done;
    }

    function finish() {
      if (rafId) cancelAnimationFrame(rafId); rafId = null;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      setTimeout(() => { try { ac.close(); } catch (e) {} }, 500);
    }

    function stop() { stopRequested = true; }

    function download(result) {
      const a = document.createElement('a');
      a.href = result.url; a.download = result.fileName;
      document.body.appendChild(a); a.click(); a.remove();
    }

    return { prepare, start, stop, download, get seconds() { return totalSec; }, canvas };
  }

  global.EAIMAutoRecorder = { create };
})(window);
