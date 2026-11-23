# 물리 다시보기

대학 일반물리의 문제와 손글씨 풀이를 근거로 살펴보는 정적 한국어 학습 사이트입니다. 서버·계정·공용 키 없이 개인 OpenAI 키로 브라우저에서 직접 Responses API를 호출합니다. **실제 API의 물리 진단 품질은 미검증**입니다. 완료 검증은 모의 API 응답과 Playwright 브라우저 테스트로 수행합니다. 실제 유료 호출은 하지 않았습니다.

## 실행과 검증

저장소 루트에서 (이 작업 환경의 번들 Node):

```sh
/Users/kanghyeonseo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node outputs/physics-lab/scripts.mjs test
/Users/kanghyeonseo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node outputs/physics-lab/scripts.mjs build
python3 -m http.server 8080 --directory outputs/physics-lab/dist
```

일반 환경은 Node 22 이상에서 `cd outputs/physics-lab`, `npm install`, `npx playwright install chromium`, `npm test`, `npm run build`를 사용합니다. 테스트는 로컬 Playwright를 우선 사용하고 이 환경의 번들 Playwright로 대체합니다. 런타임 의존성이나 외부 스크립트는 없습니다. 로컬 HTTP 서버는 개발 확인용이며 운영 서버는 필요하지 않습니다. ES module 때문에 file:// 열기는 지원하지 않습니다.

## 학습 흐름

1. 이름·학번을 가린 문제 텍스트/이미지와 별도의 풀이 이미지/텍스트를 넣습니다. 교사 참고 기준은 선택입니다.
2. PNG/JPEG/WebP 최대 8장, 장당 10 MiB, 원본 총 24 MiB를 허용합니다. 긴 변 2400px PNG로 변환하며 확대 미리보기로 작은 글씨를 확인할 수 있습니다. PDF는 이미지 변환 후 사용하세요. 읽기 어려운 경우 선명한 부분 이미지를 다시 올리세요.
3. 개인 API 키와 접근 가능한 모델을 입력하고 분석합니다. 모델 기본값은 이미지 입력과 Structured Outputs를 지원하는 `gpt-6.1-terra`이며 계정별 접근 가능 여부는 다릅니다.
4. 전사·옳은 부분·인용 및 위치 근거·오류 종류·힘의 주체/대상·확신도를 확인합니다. 확신도는 정답 확률이 아닙니다. 불충분한 입력은 판단 보류로 표시합니다.
5. 세 힌트, 전체 참고 풀이, 새 재도전 문제를 이용하세요. 재도전 답안은 새 API 호출로 검토합니다. 401/403/429/서버/네트워크/미완료/거절/잘못된 구조를 구별하며 자동 재시도는 없습니다. 취소는 브라우저 요청을 중단하며 이미 처리된 요청의 요금 취소를 보장하지 않습니다.
6. 교사가 진단 수락/수정 후 보고서를 미리 확인합니다. 수정 내용이 원 AI 진단보다 우선합니다. 보고서는 입력·전사·직접 인용·이미지·키를 제외하고 일부 식별정보를 지웁니다. 자유 서술에 남은 개인정보는 자동으로 완벽히 제거할 수 없으므로 편집 가능한 JSON 미리보기와 확인란을 거쳐 개인 파일로 저장/인쇄합니다. 재도전 결과는 화면에서 별도 확인하며 기본 보고서는 최초 진단에 대한 검토입니다.

## 개인정보와 한계

키는 비밀번호 입력 필드의 메모리에만 존재하며 저장소·URL·로그·보고서에 쓰지 않습니다. 키 지우기와 페이지 이탈은 키를 지우고 요청을 취소합니다. 입력·이미지는 분석 요청 때 OpenAI로 전송되며 제공자의 데이터 정책이 적용됩니다. `store:false`를 사용하며 앱 자체는 서버 저장·분석 추적·자동 저장을 하지 않습니다. 새로고침하면 작업을 잃습니다. AI 지시문과 첨부를 분리하고 첨부를 신뢰하지 않도록 지시하지만 모델의 지시 준수나 진단 정확성을 보장하지 않습니다. 오류를 항상 원문과 대조하세요. 출력은 HTML로 해석하지 않습니다.

## 합성 자료

API 없이 동작하는 **합성 데모**는 실제 업로드 진단이 아닙니다. 별도 라이브러리에는 48문항 × 20사례 = 960사례가 있으며 그중 작용·반작용/평형 집중 사례는 204개입니다. HW2–5는 문항당 10개 오류 계열 × 2개 표현 형식입니다. 기존 `outputs/과제1-5_통합_오답사례_960개.jsonl`의 교육용 내용과 `work/all_payload.json`의 문항 목록을 화이트리스트로 추출했습니다. 성적 통계, 원본 PDF, 이름, 학번, 개별 학생 점수는 번들에 포함하지 않습니다. 선택한 문항의 재계산 정답 기준과 제공 채점기준은 참고 입력에 연결합니다. 오류 발생 비율로 해석하면 안 됩니다.

## API 계약 근거

2026-11-23 확인: [이미지 입력](https://developers.openai.com/api/docs/guides/images-vision), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [GPT-6.1 Terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra). 직접 POST `/v1/responses`, `input_text`/`input_image`와 data URL, `detail:high`, `text.format`의 strict JSON Schema를 사용합니다. 완료·거절·미완료를 구별하고 추가 키/누락/잘못된 타입 및 근거 없는 진단을 검증합니다. 실제 응답의 토큰만 표시하며 가격은 추정하지 않습니다.

## GitHub Pages 인계

모든 자산은 상대 경로이며 `/physics-misconception-lab/` 경로에서 테스트합니다. `build`는 `dist`에 index와 assets만 복사합니다. 테스트·Seed·원본 자료는 배포되지 않습니다. 저장소 루트 `.github/workflows/pages.yml`은 수동 실행 전용입니다. 앱 폴더에도 인계용 사본이 있으며 저장소 구조를 유지하여 루트에 배치하세요. Pages source를 GitHub Actions로 설정한 뒤 부모 작업자가 게시합니다. 이 작업은 push/deploy/workflow 실행을 하지 않습니다.

`corrected.seed.yaml`은 원래 열 개 AC의 전체 기능 범위를 유지하고 각 실행 테스트 파일을 해당 `expected_artifacts`에 정확히 선언했습니다. `tests/helpers.mjs`, `scripts.mjs`도 선언했습니다. 미해결 교육 수준/잘린 테스트/유료 키 검증 가정은 제거했습니다. 브라우저 스크린샷과 검증 기록은 `verification/`에 있으며 앱 번들에는 포함되지 않습니다.

## 사진에서 확인한 교정 사례 기억하기

진단 뒤 ‘현재 진단으로 기억할 내용 준비’를 누르면 문제 요약과 참고 풀이가 채워집니다. 교사 수정 상태라면 수정한 풀이를 사용합니다. 내용을 직접 고치고 개인정보를 지운 뒤 확인란을 선택해야 저장됩니다. 자동 저장은 없습니다. 원본 사진·전사 전체·API 키는 저장 대상이 아니며 입력한 두 텍스트 필드만 이 브라우저의 저장 공간에 남습니다. 다른 기기로 자동 동기화하지 않습니다.

다음 진단에는 관련 텍스트 사례 최대3개를 참고 기준에 넣습니다. 문제를 사진만 올린 경우 최근3개를 넣습니다. 참고 여부를 끄거나 개별 기억을 삭제할 수 있고, 승인 사례를 JSON으로 내려받을 수 있습니다. 이는 검토된 사례를 참고하는 방식이며 모델 가중치의 재학습이나 fine-tuning 완료를 뜻하지 않습니다. 저장 공간 삭제/시크릿 모드 종료 시 기억이 사라질 수 있습니다. 기존 API 키·사진 자동 저장 금지는 유지됩니다.
