# Novel Helper (Obsidian Plugin)

옵시디언 우측 사이드바에서 동작하는 소설 브레인스토밍 플러그인입니다.

## 현재 UI/UX 구조

- 상단 짧은 액션 바
  - `참고 파일 고르기`: 볼트 트리(폴더/파일) 선택 모달 열기
  - `설정`: API 프리셋 설정 모달 열기
- 메인 채팅 영역 (가장 큰 영역)
  - `Instruction`
  - AI 대화 메시지
  - 사용자 입력창
  - 빠른 액션 버튼 4종
  - `프롬프트...` 편집 버튼
- 하단 대화 히스토리 (짧은 영역)
  - 최근 일부만 표시
  - `확장` 버튼으로 히스토리 확장 모달

## 참고 파일 선택

- 볼트 트리를 모달로 표시
- 다중 선택 가능
- 폴더 선택 시 하위의 `.md` 파일 전체 선택
- `적용 / 저장` 버튼으로 선택 상태를 플러그인 데이터에 저장

## API 설정

- API 전용 모달
- 프리셋 드롭다운 선택
- 현재 프리셋 수정
- 프리셋 추가 / 삭제 / 저장

## 스타일 정책

- 기본 글꼴: `Pretendard` 우선 (가시성 중심)
- 색감: 아이보리/연보라 톤을 옵시디언 테마 변수와 `color-mix`로 혼합
- 테마 변경 시 Obsidian 변수(`--background-*`, `--interactive-accent`)에 반응


## BRAT 설치 체크리스트

- `manifest.json`
- `main.js`
- `styles.css`
- `versions.json` (호환 버전 매핑)

위 파일을 저장소 루트에 포함했습니다.


## BRAT 기준 릴리즈 포함 파일

BRAT로 설치 가능한 Obsidian 플러그인 릴리즈는 아래 파일을 최소 포함해야 합니다.

- `manifest.json` (플러그인 메타데이터)
- `main.js` (빌드 결과물)
- `styles.css` (스타일 파일, 없는 경우 생략 가능하지만 이 저장소는 사용)

이 저장소는 배포/호환성 관리를 위해 아래 파일도 함께 릴리즈에 포함합니다.

- `versions.json` (플러그인 버전 ↔ 최소 Obsidian 버전 매핑)
- `novel-helper-<version>.zip` (위 파일 4개를 묶은 배포 묶음)

## GitHub Action으로 BRAT 릴리즈 만들기

워크플로 파일: `.github/workflows/main.yml`

동작 요약:

1. 태그 푸시(`0.1.0` 또는 `v0.1.0`) 또는 수동 실행 시 동작
2. `npm ci` → `npm run build`
3. `manifest.json`, `main.js`, `styles.css`, `versions.json` 존재 여부 검증
4. 태그 버전과 `manifest.json`의 `version` 일치 여부 검증
5. 릴리즈 생성 후 필수 파일 + zip 에셋 업로드

## 액션 사용 방법

1. 코드 변경 후 버전을 올립니다.
   - `manifest.json`의 `version`
   - `package.json`의 `version`
   - `versions.json`에 매핑 추가
2. 빌드 확인
   - `npm run check`
   - `npm run build`
3. 커밋/푸시 후 태그 생성
   - 예: `git tag v0.1.1 && git push origin main --tags`
4. GitHub Actions 탭에서 `Build & Release Obsidian BRAT Plugin` 실행 확인
5. GitHub Releases에서 에셋 5개 업로드 확인
   - `manifest.json`, `main.js`, `styles.css`, `versions.json`, `novel-helper-<version>.zip`
6. Obsidian BRAT에서 저장소 `mimi2278/NHelper` 추가해 설치/업데이트
