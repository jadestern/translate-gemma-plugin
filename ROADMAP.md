# TranslateGemma Browser Extension

로컬 TranslateGemma 모델을 활용한 브라우저 번역 확장 프로그램

## 기술 스택

| 구성요소 | 기술 |
|---------|------|
| 모델 | TranslateGemma 4B GGUF |
| 백엔드 | LM Studio REST API (`localhost:1234`) |
| 프레임워크 | **WXT** (크로스 브라우저 확장 프레임워크) |
| 언어 | TypeScript |
| 매니페스트 | Manifest V3 |
| 타겟 | Chrome, Firefox (동시 빌드) |

## 아키텍처

```
[브라우저 확장] → HTTP → [LM Studio (localhost:1234)] → [TranslateGemma 4B]
```

## 로드맵

### Phase 1: 환경 구축 ✅
- [x] LM Studio 설치 및 TranslateGemma 4B GGUF 로드
- [x] LM Studio 서버 시작 (`localhost:1234`)
- [x] WXT 프로젝트 초기화
- [x] Firefox Developer Edition 연동

### Phase 2: API 연동 & 더미 테스트
- [x] **2-1.** LM Studio API 통신 모듈 작성
- [x] **2-2.** 팝업에서 더미 텍스트 번역 테스트
- [ ] **2-3.** 스트리밍 응답 처리 (선택)

### Phase 3: 선택 텍스트 번역 ✅
- [x] **3-1.** Content Script로 텍스트 선택 감지
- [x] **3-2.** 선택 텍스트 위에 번역 버튼 표시
- [x] **3-3.** 번역 결과 툴팁으로 표시

### Phase 4: 전체 페이지 번역 ← **현재**
- [x] **4-1.** DOM 텍스트 노드 추출 ✅
- [x] **4-2.** 청크 단위 번역 (토큰 제한 대응) ✅
- [x] **4-3.** 원본 ↔ 번역 토글 ✅
- [x] **4-4.** 번역 진행률 표시 (토스트 UI) ✅
- [x] **4-5.** 무한 스크롤 대응 (이미 번역된 노드 스킵) ✅

### Phase 5: UI/UX 개선
- [ ] 사이드패널 UI
- [ ] 언어 선택 설정
- [ ] 다크모드

### Phase 6: 배포
- [ ] Chrome Web Store
- [ ] Firefox Add-ons

## 핵심 기능

1. **선택 텍스트 번역**: 우클릭 컨텍스트 메뉴
2. **전체 페이지 번역**: 툴바 버튼
3. **실시간 번역**: 입력 필드 자동 번역 (선택적)

## 요구사항

- LM Studio 실행 및 서버 시작 (`localhost:1234`)
- TranslateGemma 4B GGUF 모델 로드

## 참고 자료

- [TranslateGemma 공식](https://huggingface.co/collections/google/translategemma)
- [LM Studio REST API](https://lmstudio.ai/docs/developer/rest/endpoints)
- [WXT 프레임워크](https://wxt.dev/) - Chrome/Firefox 동시 빌드
- [WebExtension Polyfill](https://github.com/nicolo-ribaudo/browser.webextension-polyfill)
