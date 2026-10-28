// api/tools.js — 에이전트가 쓰는 도구 모음: ① find_spots(관광지 찾기) ② get_weather(날씨 — Open-Meteo, 키 없음)

const DATA = require('../jeju_spots.json');
const SPOTS = DATA.spots;
const AREAS = {                                  // 지역 중심점 [위도, 경도] — 날씨 조회와 지도 핀에 쓴다
  '동쪽': [33.46, 126.88],
  '서쪽': [33.36, 126.30],
  '서귀포': [33.25, 126.56],
  '제주시': [33.51, 126.52],
};
const AREA_NAMES = Object.keys(AREAS);
const MAX_SPOTS = 8;

// 목록의 area 가 "동쪽" 이든 "동쪽(성산)" 이든 같은 지역으로 본다
const inArea = (spotArea, area) => spotArea === area || String(spotArea).startsWith(area + '(');
const areaOf = spotArea => AREA_NAMES.find(a => inArea(spotArea, a));

// ── 도구 ① 관광지 찾기 ──
function find_spots({ area, indoor } = {}) {
  if (!AREA_NAMES.includes(area)) return { error: `area 는 ${AREA_NAMES.join(' · ')} 중 하나여야 해요` };
  let list = SPOTS.filter(s => inArea(s.area, area));
  if (indoor === true || indoor === false) list = list.filter(s => s.indoor === indoor);
  return {
    area,
    count: list.length,                       // 조건에 맞는 전체 개수 (spots 는 최대 8곳)
    spots: list.slice(0, MAX_SPOTS).map(s => ({
      name: s.name,
      areas: s.area,
      indoor: s.indoor,
      desc: s.desc || s.type || '',           // 좌표(lat · lon)는 화면용이라 뺌
    })),
  };
}

// ── 도구 ② 날씨 보기 (Open-Meteo 예보, 키 없음) ──
async function get_weather({ area, day } = {}) {
  const c = AREAS[area] || AREAS['제주시'], i = day === '내일' ? 1 : 0;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${c[0]}&longitude=${c[1]}` +
    '&daily=precipitation_probability_max,temperature_2m_max&timezone=Asia%2FSeoul&forecast_days=2';
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error('weather ' + r.status);
    const j = await r.json();
    return { ok: true, area: area || '제주시', day: day || '오늘', date: j.daily.time[i],
      rain_prob: j.daily.precipitation_probability_max[i], tmax: Math.round(j.daily.temperature_2m_max[i]), source: 'Open-Meteo 예보' };
  } catch (e) {
    return { ok: false, area, day, note: '날씨를 가져오지 못했어요' };
  }
}

// ── Claude 도구 설명 ──
const TOOLS = [
  {
    name: 'find_spots',
    description: '제주 관광지 목록에서 지역(그리고 실내/야외)으로 장소를 찾아 이름 · 지역 · 실내 여부 · 설명을 최대 8곳 돌려준다. 목록 밖 장소는 없다.',
    input_schema: {
      type: 'object',
      properties: {
        area: { type: 'string', enum: AREA_NAMES, description: '찾을 지역' },
        indoor: { type: 'boolean', description: '실내만 true, 야외만 false, 둘 다면 생략' },
      },
      required: ['area'],
    },
  },
  {
    name: 'get_weather',
    description: '그 지역의 오늘 또는 내일 강수확률(%)과 최고기온을 Open-Meteo 예보로 가져온다.',
    input_schema: {
      type: 'object',
      properties: {
        area: { type: 'string', enum: AREA_NAMES, description: '날씨를 볼 지역' },
        day: { type: 'string', enum: ['오늘', '내일'] },
      },
      required: ['area', 'day'],
    },
  },
];

async function runTool(name, input) {
  if (name === 'find_spots') return find_spots(input || {});
  if (name === 'get_weather') return get_weather(input || {});
  return { error: '없는 도구' };
}

module.exports = { find_spots, get_weather, TOOLS, runTool, SPOTS, AREAS, AREA_NAMES, areaOf };
