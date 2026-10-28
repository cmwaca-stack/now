# 제주 여행 추천 에이전트

AI(Google Gemini)가 `find_spots`(관광지 찾기)와 `get_weather`(Open-Meteo 날씨) 도구를 스스로 골라 추천합니다.

## Gemini API 키 발급
1. https://aistudio.google.com/apikey 에 구글 계정으로 로그인
2. **Create API key** 클릭 → 프로젝트 선택(없으면 새로 만들기) → 키 복사
3. 키는 비밀번호처럼 다루기: GitHub·HTML·화면 코드에 넣지 않는다. (AI Studio에서 *Restrict to Gemini API only* 제한 권장)

## Vercel 환경변수
Vercel → 프로젝트 → Settings → Environment Variables

| 이름 | 값 | 필수 |
|---|---|---|
| `GEMINI_API_KEY` | 발급받은 키 | 예 (없으면 연습 모드) |
| `GEMINI_MODEL` | 사용할 모델 이름 (기본 `gemini-3.8-flash`) | 아니오 |

저장한 뒤 **Redeploy** 해야 적용됩니다.
