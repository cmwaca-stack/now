// api/tools.js — 에이전트가 쓰는 도구 모음
// 지금은 find_spots(관광지 찾기) 하나. 도구를 더 만들면 TOOLS 와 runTool 에 추가하세요.

const DATA = require('../jeju_spots.json');
const SPOTS = DATA.spots;
const AREA_NAMES = ['동쪽', '서쪽', '서귀포', '제주시'];
const MAX_SPOTS = 8;

// 목록의 area 가 "동쪽" 이든 "동쪽(성산)" 이든 같은 지역으로 본다
const inArea = (spotArea, area) => spotArea === area || String(spotArea).startsWith(area + '(');

// ── 도구: 관광지 찾기 ──
function find_spots({ area, indoor } = {}) {
  if (!AREA_NAMES.includes(area)) return { error: `area 는 ${AREA_NAMES.join(' · ')} 중 하나여야 해요` };
  let list = SPOTS.filter(s => inArea(s.area, area));
  if (indoor === true || indoor === false) list = list.filter(s => s.indoor === indoor);
  return {
    area: area || '전체',
    count: list.length,                       // 조건에 맞는 전체 개수 (spots 는 최대 8곳)
    spots: list.slice(0, MAX_SPOTS).map(s => ({
      name: s.name,
      areas: s.area,
      indoor: s.indoor,
      desc: s.desc || s.type || '',           // 좌표(lat · lon)는 화면용이라 뺌
    })),
  };
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
];

async function runTool(name, input) {
  return name === 'find_spots' ? find_spots(input || {}) : { error: '없는 도구' };
}

module.exports = { find_spots, TOOLS, runTool };
