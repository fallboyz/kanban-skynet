# 웹 UI 설계

## 개요

- 프레임워크: Next.js 16 (App Router)
- 스타일: Tailwind CSS 4 + 커스텀 게임카드 스타일
- 폰트: Pretendard Variable (CDN)
- 실시간: WebSocket (native browser API)
- 포트: 4000

---

## 페이지 구성

### `/` (메인 칸반 보드)

전체 페이지가 칸반 보드 하나. 추가 페이지 없음.

---

## 레이아웃 구성

### 최상단 헤더

```
[로고] Kanban Skynet                Total: 41  Active: 6  Blocked: 2  Done: 35  Rate: 85%
       Agent Command Board
```

- 로고: `public/logo.png` (40x40, rounded-xl)
- 브랜드명: "Kanban" (light) + "Skynet" (bold)
- 서브텍스트: "Agent Command Board"
- 통계 바 — Total / Active / Blocked / Done / Rate(%)
  - Total: cancelled 제외한 전체
  - Active: in_progress + review
  - Blocked: is_blocked=true인 태스크
  - Done: status=done
  - Rate: done / total * 100

### 필터 바

```
Workspace: [All Workspaces v] [+]    Project: [All Projects v] [+]    Role: [All] [ARCHITECT] [DATABASE] [BACKEND] [FRONTEND] [SECURITY] [QA]    Auto Approve: [ON]
```

- 워크스페이스 드롭다운 (All Workspaces + 목록) + 생성 버튼
- 프로젝트 드롭다운 (선택된 워크스페이스 내 프로젝트 목록) + 생성 버튼
- Role 필터 탭 버튼 (토글 방식)
- 워크스페이스 선택 시 프로젝트 드롭다운 자동 갱신
- Auto Approve 토글: 프로젝트 선택 시에만 표시, ON/OFF 전환

### 칸반 보드 컬럼 (4개)

```
[Ready: 6]  [In Progress: 3]  [Review: 1]  [Done: 35]
```

| 컬럼 | 테마 | 설명 |
|------|------|------|
| Ready | stone/회색 | 에이전트 배정 대기 태스크 |
| In Progress | amber/노랑 | 에이전트가 작업 중 |
| Review | violet/보라 | QA 검증 대기 |
| Done | emerald/초록 | 완료 |

- `cancelled` 태스크는 칸반 컬럼에 표시하지 않음
- Done 컬럼: `updated_at DESC` 정렬 (최근 완료 태스크가 맨 위)
- Done 컬럼: 서버 페이지네이션 (나머지 3개 컬럼은 전체 로드)

#### Done 컬럼 검색 + 페이지네이션

Done 컬럼은 완료된 태스크가 무한히 쌓이는 유일한 컬럼이므로, 별도의 검색과 페이지네이션을 제공한다.

```
Victory Done                          [13]
+------------------------------------------+
| [돋보기] Search completed tasks...       |
+------------------------------------------+
| [카드1]                                  |
| [카드2]                                  |
| ...                                      |
| [카드20]                                 |
+------------------------------------------+
|       < 1 ... 4 5 6 ... 20 >            |
+------------------------------------------+
```

- **검색**: 컬럼 헤더 아래 검색 입력. 제목과 설명을 SQLite LIKE로 검색. 300ms debounce 적용.
- **페이지네이션**: 한 페이지 20개 (DONE_PAGE_SIZE). 5개 번호 표시 (DONE_PAGE_WINDOW) + ellipsis + 첫/마지막 페이지.
- **뱃지**: 현재 페이지가 아닌 전체 done 개수 표시.
- **API**: `GET /projects/:id/tasks/done?page=1&page_size=20&search=검색어` (프로젝트별), `GET /tasks/done?project_ids=a,b&page=1` (All Projects 모드).
- **상수**: `src/lib/constants.ts`에서 `DONE_PAGE_SIZE`, `DONE_PAGE_WINDOW`, `DONE_SEARCH_DEBOUNCE_MS` 변경 가능.

### 푸터

```
(c) 2026 Kanban-Skynet. Built by Coulson. All rights reserved.
```

---

## 태스크 카드 (게임카드 스타일)

카드는 수집형 카드 게임 스타일로 디자인됨.

```
      [핀]
+-------------------------------------+
| [BACKEND]                            |   <- 역할 배지 (헤더)
|                                      |
| FastAPI 프로젝트 초기 설정           |   <- 제목
|                                      |
| [SS] [Critical] [Blocked]           |   <- 등급 + 우선순위 + 상태 배지
| claude-backend              just now |   <- 에이전트 + 타임스탬프
+-------------------------------------+
```

### 등급 배지 (Grade)
우선순위에 따른 카드 등급:

| Priority | Grade | 스타일 |
|----------|-------|--------|
| critical | SS | 금색 그라데이션 |
| high | S | 은색 그라데이션 |
| medium | A | 청동 그라데이션 |
| low | B | 회색 |

### 희귀도 테두리 (Rarity Border)
우선순위에 따른 카드 테두리 발광 효과:

| Priority | Rarity | 효과 |
|----------|--------|------|
| critical | Legendary | 금색 발광 + 애니메이션 |
| high | Epic | 보라색 발광 |
| medium | Rare | 파란색 발광 |
| low | Common | 발광 없음 |

### 역할별 색상 (Role Colors)

| Role | 배경색 | Tailwind |
|------|--------|----------|
| ARCHITECT | 시안/민트 | role-architect (#ccfbf1) |
| DATABASE | 에메랄드/초록 | role-database (#d1fae5) |
| BACKEND | 파랑 | role-backend (#dbeafe) |
| FRONTEND | 보라 | role-frontend (#ede9fe) |
| SECURITY | 빨강/분홍 | role-security (#ffe4e6) |
| QA | 핑크 | role-qa (#fce7f3) |

### 추가 시각 요소
- **핀 (Pushpin)**: 카드 상단 중앙에 고정핀 모양
- **Blocked 오버라이**: `is_blocked=true` 시 줄무늬 오버레이 + "BLOCKED" 텍스트
- **에이전트 펄스**: `in_progress` 상태일 때 에이전트명 옆에 펄스 점 애니메이션
- **호버 효과**: 카드 호버 시 살짝 기울기 + 그림자 확대

카드 클릭 시 -> 태스크 상세 모달

---

## 모달 구성

> Task 생성은 웹 UI에서 하지 않음. Orchestrator 에이전트가 MCP를 통해 자동 생성.
> Workspace와 Project는 FilterBar에서 사용자가 직접 생성 가능.

### 태스크 상세 모달

```
[Critical] [BACKEND]  FastAPI 프로젝트 초기 설정

설명:
FastAPI 기반 REST API 서버를 초기 구성합니다.

담당: claude-backend
상태: In Progress

--- 의존관계 ---
선행 태스크:
  [done] 백엔드 API 설계
  [in_progress] DB 스키마 설계

후행 태스크:
  [ready] 프론트엔드 연동

--- 댓글/로그 ---
claude-backend: Status changed to IN PROGRESS  (2h ago)
claude-orchestrator: 서브 태스크 생성 완료    (3h ago)
```

---

## 컴포넌트 목록

```
src/
├── app/
│   ├── layout.tsx              # 전체 레이아웃 (Pretendard 폰트)
│   ├── page.tsx                # 메인 페이지 (칸반 보드)
│   ├── globals.css             # Tailwind v4 + 역할별 테마 + 게임카드 스타일
│   └── icon.png                # 파비콘 (Next.js 자동 감지)
├── components/
│   ├── KanbanBoard.tsx          # 4개 컬럼 렌더링 (Done은 별도 props)
│   ├── KanbanColumn.tsx         # 단일 컬럼 (Done: 검색 + 페이지네이션 포함)
│   ├── Pagination.tsx           # 페이지 번호 네비게이션 (< 1 ... 4 5 6 ... 20 >)
│   ├── TaskCard.tsx             # 게임카드 스타일 태스크 카드
│   ├── TaskDetailModal.tsx      # 태스크 상세 + 댓글 + 의존관계
│   ├── FilterBar.tsx            # Workspace/Project/Role 필터 + 생성 기능
│   └── StatsBar.tsx             # Total/Active/Blocked/Done/Rate
├── hooks/
│   └── useWebSocket.ts          # WebSocket 연결 훅 (이벤트 배치 + 자동 재연결)
└── lib/
    ├── api.ts                   # REST API 클라이언트
    ├── constants.ts             # 프론트엔드 상수 (DONE_PAGE_SIZE 등)
    └── utils.ts                 # formatRelativeTime, cn() 유틸
```

---

## WebSocket 실시간 업데이트

서버에서 전송하는 이벤트 형식:

```typescript
// 태스크 생성
{ type: "task:created", payload: Task }

// 태스크 업데이트 (상태변경, 담당자 변경 등)
{ type: "task:updated", payload: Task }

// 댓글 추가
{ type: "comment:added", payload: Comment & { task_id: string } }

// 프로젝트 설정 변경
{ type: "project:updated", payload: Project }

// 의존관계 추가
{ type: "dependency:added", payload: { task_id: string, depends_on: string } }

// 의존관계 제거
{ type: "dependency:removed", payload: { task_id: string, depends_on: string } }
```

클라이언트는 이벤트 수신 시 로컬 상태(useState)를 즉시 업데이트.
이벤트 배치 처리: 짧은 시간 내 여러 이벤트가 오면 모아서 한 번에 반영.
초기 데이터는 페이지 로드 시 REST API로 fetch.
탭 복귀 시 (Page Visibility API) 데이터 자동 재로드.

---

## 테마

- 라이트/웜톤 테마 (bg-stone-50 기반, white/90 헤더)
- 폰트: Pretendard Variable (CDN)
- 커스텀 스크롤바 (webkit)
- 역할별 커스텀 색상 (`@theme` 변수)

## 상태 관리

별도 상태관리 라이브러리 없이 React useState + useEffect + useCallback + useRef만 사용.
WebSocket 연결은 커스텀 훅 `useWebSocket`으로 캡슐화.

```typescript
// hooks/useWebSocket.ts
function useWebSocket(onEvent: (event: WsEvent) => void, onReconnect: () => void) {
  // 연결, 재연결, 이벤트 배치 처리
}
```

필터 상태를 ref로 유지하여 WebSocket 콜백에서 재연결 없이 최신 값 참조.
AbortController로 API 요청 취소 (필터 변경 시 이전 요청 취소).
