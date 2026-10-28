// api/agent.js — 제주 여행 추천 에이전트 (Vercel 서버리스 함수, POST /api/agent)
// find_spots(관광지 찾기) · get_weather(날씨)를 AI가 스스로 골라 쓴다.
// 열쇠는 Vercel 환경변수 ANTHROPIC_API_KEY 에서만 읽는다. 없으면 ‘연습 모드’(정해 둔 순서로 같은 도구 사용).

const { find_spots, get_weather, TOOLS, runTool, SPOTS, AREAS, AREA_NAMES, areaOf } = require('./tools');

const RAIN = 50;          // 판단 규칙: 강수확률 50% 이상이면 실내 위주
const MAX_TURNS = 5;      // 에이전트 반복은 5번까지

const SYSTEM = [
  '너는 제주 여행 안내 에이전트 ‘오름 길잡이’야. 존댓말, 짧게, 모르는 건 모른다고 말해.',
  '반드시 도구로 확인한 뒤 답해: find_spots 로 장소를 찾고, get_weather 로 그 지역 날씨를 봐.',
  `판단 규칙: 강수확률 ${RAIN}% 이상이면 실내 위주 · 코스는 한 지역 안에서 · find_spots 에 없는 장소는 추천하지 마 · 날씨를 못 가져오면 그렇다고 말해 · 운영시간과 요금은 단정하지 마.`,
  '최종 답은 JSON 으로만: {"places":[{"name":"","why":""}],"judge":"한 줄 판단 이유","tip":""} — 장소는 3곳.',
].join('\n');

const REGION_WORDS = [
  ['동쪽', ['동쪽', '동부', '성산', '구좌', '표선', '우도']],
  ['서쪽', ['서쪽', '서부', '애월', '협재', '한림', '안덕']],
  ['서귀포', ['서귀포', '남쪽', '중문', '남원']],
  ['제주시', ['제주시', '시내', '공항', '구도심']],
];
const norm = s => String(s || '').replace(/[\s()·\-]/g, '');
const spotOf = name => SPOTS.find(s => norm(s.name) === norm(name)) ||
  SPOTS.find(s => norm(s.name).includes(norm(name)) || norm(name).includes(norm(s.name)));

// 추천 장소를 목록과 대조하고, 지도 핀은 지역 중심점에 (같은 지역끼리 겹치지 않게 조금씩 벌린다)
function finish(places) {
  return (places || []).slice(0, 3).map((p, i) => {
    const s = p && p.name ? spotOf(p.name) : null;
    if (!s) return { name: p && p.name, why: p && p.why, inList: false };
    const area = areaOf(s.area), c = AREAS[area];
    return { name: s.name, why: p.why, area: s.area, indoor: s.indoor, inList: true,
      lat: c[0] + 0.03 * Math.cos(i * 2.1), lon: c[1] + 0.03 * Math.sin(i * 2.1) };
  });
}

function toolStep(name, input, out) {            // ‘생각 과정’에 보일 한 줄
  if (name === 'find_spots') {
    if (out.error) return `관광지 찾기 — ${out.error}`;
    return `관광지 찾기 — ${out.area}${input.indoor === true ? ' 실내' : input.indoor === false ? ' 야외' : ''} ${out.count}곳`;
  }
  if (name === 'get_weather')
    return out.ok ? `날씨 보기 — ${out.area} ${out.day} 강수확률 ${out.rain_prob}% · 최고 ${out.tmax}℃ (${out.source})` : `날씨 보기 — ${out.note}`;
  return name;
}

// ── 연습 모드: AI 대신 정해 둔 순서로 같은 도구를 쓴다 ──
async function practiceAgent(question) {
  const area = (REGION_WORDS.find(([, ws]) => ws.some(w => question.includes(w))) || ['동쪽'])[0];
  const day = /내일/.test(question) ? '내일' : '오늘';
  const steps = [];
  const w = await get_weather({ area, day });
  const askRain = /비\s?(와|오|올)/.test(question);
  const indoorFirst = askRain || (w.ok && w.rain_prob >= RAIN);
  const found = find_spots({ area, indoor: indoorFirst ? true : undefined });
  steps.push({ kind: 'find', text: toolStep('find_spots', { area, indoor: indoorFirst ? true : undefined }, found) });
  steps.push({ kind: 'find', text: toolStep('get_weather', { area, day }, w) });
  const judge = askRain ? '질문에 “비”가 있어 실내 위주'
    : !w.ok ? '날씨를 몰라 실내 · 야외 섞기'
    : indoorFirst ? `강수확률 ${w.rain_prob}% ≥ ${RAIN}% → 실내 위주` : `강수확률 ${w.rain_prob}% < ${RAIN}% → 야외도 OK`;
  steps.push({ kind: 'judge', text: judge });
  const places = finish(found.spots.slice(0, 3).map(s => ({ name: s.name, why: s.desc })));
  steps.push({ kind: 'act', text: `${area} 코스 ${places.length}곳 · 지도 핀` });
  return { mode: 'practice', steps, places, judge, weather: w, tip: '연습 모드(정해 둔 순서) · 방문 전 운영 여부를 확인하세요.' };
}

async function askClaude(key, messages) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: process.env.CLAUDE_MODEL || 'claude-haiku-5-5', max_tokens: 800, system: SYSTEM, tools: TOOLS, messages }),
  });
  if (!r.ok) throw new Error('claude ' + r.status);
  return r.json();
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 로만 물어봐 주세요' });
  const body = req.body || {};
  const question = String(body.question || '').slice(0, 300);
  if (!question.trim()) return res.status(400).json({ error: '질문이 비어 있어요' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(200).json(await practiceAgent(question));

  const steps = [];
  const messages = [{ role: 'user', content: `질문: ${question}` }];
  let weather = null;
  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {          // 에이전트 반복: 도구 고르기 → 결과 보기 → 다시 판단
      const r = await askClaude(key, messages);
      if (r.stop_reason === 'tool_use') {
        messages.push({ role: 'assistant', content: r.content });
        const results = [];
        for (const b of r.content) {
          if (b.type !== 'tool_use') continue;
          const out = await runTool(b.name, b.input);
          if (b.name === 'get_weather') weather = out;
          steps.push({ kind: 'find', text: toolStep(b.name, b.input || {}, out) });
          results.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(out) });
        }
        messages.push({ role: 'user', content: results });
        continue;
      }
      const text = (r.content || []).map(c => c.text || '').join('');
      let out;
      try { out = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); }
      catch (e) { return res.status(200).json({ mode: 'ai', steps, text }); }
      const places = finish(out.places);
      steps.push({ kind: 'judge', text: out.judge || '판단 이유를 말하지 않았어요' });
      steps.push({ kind: 'act', text: `코스 ${places.length}곳 · 지도 핀 ${places.filter(p => p.lat).length}개` + (places.some(p => !p.inList) ? ' · 목록에 없는 곳은 직접 확인 ⚠' : '') });
      return res.status(200).json({ mode: 'ai', steps, places, judge: out.judge, weather, tip: out.tip || '방문 전 운영 여부를 확인하세요.' });
    }
    return res.status(200).json({ mode: 'ai', steps, text: '도구를 너무 여러 번 써서 멈췄어요. 질문을 조금 더 구체적으로 해 주세요.' });
  } catch (e) {
    const p = await practiceAgent(question);                // AI 연결이 안 되면 연습 모드로
    return res.status(200).json({ ...p, mode: 'error', tip: '잠시 AI 연결이 안 돼 연습 모드로 답했어요.' });
  }
};
