# LocalClip 공통 작업 지침

## 제품과 현재 범위
- 한국어 Windows 개인용 게시판 리더. React + TypeScript + Electron.
- AAGAG 공개 목록·본문·미디어 저장은 실제로 동작한다. 인벤과 로그인 기능은 아직 데모이며 성공한 것처럼 표현하지 않는다.
- 요청에 없는 GPT API, 서버, 계정 동기화를 추가하지 않는다.
- 실제 수집 구현 시 인벤 인증 및 사이트 접근 정책부터 검증한다.

## Codex / Claude Code 작업 인수인계
1. 작업 시작 전에 `git status`, 현재 브랜치, `docs/HANDOFF.md`를 확인한다.
2. 한 번에 한 에이전트가 작업한다. 진행 중인 변경을 덮어쓰거나 임의로 되돌리지 않는다.
3. UI 데이터 접근은 `ClipRepository`와 공통 타입을 통해 교체 가능한 형태로 유지한다.
4. 작업 후 관련 검증을 수행하고 `docs/HANDOFF.md`에 변경, 결과, 제한, 다음 작업을 기록한다.
5. 사용자 요청에 따라 커밋·푸시하되 강제 푸시나 원격 이력 재작성은 하지 않는다.

## 품질과 개인정보
- `pnpm build`, `pnpm test`; 동작 변경 시 `pnpm test:e2e`를 실행한다.
- Electron 변경 시 빌드 후 `pnpm test:desktop`을 실행한다.
- 모달 초점, 키보드 동작, 좁은 창의 목록/상세 전환을 유지한다.
- 원격 HTML을 앱 권한으로 실행하지 않는다. Node integration은 끄고 sandbox/contextIsolation을 유지한다.
- 외부 링크 IPC 입력과 송신자를 검증한다. 출처 창에 앱 preload를 넣지 않는다.
- 쿠키·세션·계정 정보·저장 글·개인 DB·테스트 프로필은 Git에 넣지 않는다.
- 실제 파일 저장 구현 시 실패/부분 저장/인증 만료를 성공으로 처리하지 않는다.

## 검증 환경
- Node 24 / pnpm 11.19, Windows의 Microsoft Edge로 E2E를 실행한다.
- pnpm build-script 허용은 `pnpm-workspace.yaml`에서 관리한다.
- 미리보기 데모 상태와 Electron 상태는 분리된다. 테스트는 독립 프로필을 사용한다.
