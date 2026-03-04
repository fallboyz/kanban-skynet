# Kanban Skynet — 프로젝트 컨텍스트

## 프로젝트 개요

Claude Code 에이전트 팀의 작업 과정을 영속적으로 기록하고 시각화하는 칸반보드 시스템.
팀 내부망에 공용 서버로 배포. 웹 UI는 모니터링 도구.

## 핵심 워크플로우

```
사용자 → Claude Code에서 @ks-orchestrator 호출
       → Orchestrator가 워크스페이스/프로젝트 확인 후 플랜 수립
       → MCP를 통해 역할별 서브 태스크 생성 (ARCHITECT/DATABASE/BACKEND/FRONTEND/SECURITY/QA)
       → 각 에이전트 start_task → In Progress → Review
       → QA 에이전트 검수 → Done
       → 사용자는 웹 UI 칸반 보드에서 전체 과정 모니터링
```

## 칸반 컬럼 (4개)

| 컬럼 | Status | 설명 |
|------|--------|------|
| Ready | ready | 에이전트 배정 대기 |
| In Progress | in_progress | 에이전트 작업 중 |
| Review | review | QA 검증 대기 |
| Done | done | 완료 |

- `cancelled`: 칸반 컬럼에 표시하지 않음

## Role (6개)

| Role | 에이전트 | 설명 |
|------|---------|------|
| ARCHITECT | ks-architect.md | 시스템 구조, 기술 선택, API 스펙 설계 |
| DATABASE | ks-database.md | DB 스키마 설계, 쿼리 최적화, 마이그레이션 |
| BACKEND | ks-backend.md | 서버 구현, API, 비즈니스 로직 |
| FRONTEND | ks-frontend.md | UI, 컴포넌트, 클라이언트 로직 |
| SECURITY | ks-security.md | 보안 취약점 검수, 코드 보안 리뷰 (코드 수정 금지) |
| QA | ks-qa.md | 기능 검증, 통합 테스트 (코드 수정 금지) |

## 계층 구조

```
Workspace (큰 서비스/팀 단위)
  └── Project (기능 단위 — 사용자가 티켓 올리는 단위)
        └── Task (에이전트가 실제로 수행하는 세부 작업 — 칸반 카드)
```

## 기술 스택

| 영역 | 기술 | 버전 |
|------|------|------|
| 서버 | Next.js Custom Server + Hono | Next.js 16, Hono 4 |
| 프론트엔드 | React + Next.js (App Router) | React 19, Next.js 16 |
| DB | SQLite + WAL 모드 + busy_timeout=5000 | better-sqlite3 12 |
| MCP | Streamable HTTP (Stateless) | @modelcontextprotocol/sdk 1.27+ |
| 실시간 | WebSocket | ws 8 |
| 검증 | Zod | Zod 4 |
| 런타임 | TypeScript + tsx | TypeScript 5.9, tsx 4 |
| 스타일 | Tailwind CSS | Tailwind CSS 4 |
| ID 생성 | ULID | ulidx 2 |
| 배포 | Docker (multi-stage) | node:22-alpine |

## 디렉토리 구조

```
kanban-skynet/
├── server.ts                 # Custom server 진입점 (HTTP + WebSocket + MCP + Next.js)
├── public/
│   └── logo.png              # 헤더 로고
├── src/
│   ├── types.ts              # 공유 엔티티 타입 (단일 소스)
│   ├── global.d.ts           # CSS 모듈 타입 선언
│   ├── server/
│   │   ├── types.ts          # 서버 전용 DTO + 공유 타입 re-export
│   │   ├── constants.ts      # 검증 상수 + Zod 스키마 + 상태 전환 규칙
│   │   ├── ws.ts             # WebSocket 서버 (broadcast 함수)
│   │   ├── db/               # DB 계층 (도메인별 분할)
│   │   │   ├── connection.ts # SQLite 인스턴스 + 테이블 초기화
│   │   │   ├── index.ts      # re-export
│   │   │   ├── workspaces.ts
│   │   │   ├── projects.ts
│   │   │   ├── tasks.ts
│   │   │   ├── comments.ts
│   │   │   ├── dependencies.ts
│   │   │   └── __tests__/    # DB 계층 단위 테스트 (vitest)
│   │   ├── api/              # REST API 라우트 (Hono)
│   │   │   ├── index.ts      # Hono 앱 초기화 + 바디 크기 제한
│   │   │   ├── workspaces.ts
│   │   │   ├── projects.ts
│   │   │   ├── tasks.ts
│   │   │   └── __tests__/    # API 통합 테스트 (vitest)
│   │   └── mcp/              # MCP 서버 (Stateless HTTP)
│   │       ├── index.ts      # MCP 요청 핸들러
│   │       ├── helpers.ts    # successResponse / errorResponse
│   │       ├── workspaces.ts
│   │       ├── projects.ts
│   │       └── tasks.ts
│   ├── app/                  # Next.js App Router
│   │   ├── layout.tsx        # 루트 레이아웃 (Pretendard 폰트)
│   │   ├── page.tsx          # 홈 (칸반 보드)
│   │   ├── globals.css       # Tailwind v4 + 역할별 테마 + 게임카드 스타일
│   │   └── icon.png          # 파비콘 (Next.js 자동 감지)
│   ├── components/           # React 컴포넌트
│   │   ├── KanbanBoard.tsx
│   │   ├── KanbanColumn.tsx
│   │   ├── TaskCard.tsx      # 게임카드 스타일 태스크 카드
│   │   ├── TaskDetailModal.tsx
│   │   ├── FilterBar.tsx
│   │   └── StatsBar.tsx
│   ├── hooks/
│   │   └── useWebSocket.ts   # WebSocket 훅 (이벤트 배치 + 자동 재연결)
│   └── lib/
│       ├── api.ts            # REST API 클라이언트
│       └── utils.ts          # formatRelativeTime, cn()
├── data/                     # SQLite DB (서버 시작 시 자동 생성)
├── docs/                     # 설계 문서
├── .claude/agents/           # 에이전트 정의 파일
├── Dockerfile                # Multi-stage 빌드
├── docker-compose.yml        # 단일 서비스 배포
└── .dockerignore
```

## 서버 아키텍처

단일 프로세스, 단일 포트 (4000):

| 경로 | 핸들러 | 설명 |
|------|--------|------|
| `/api/*` | Hono | REST API |
| `/health` | Hono | 헬스체크 |
| `/mcp` | MCP SDK (Stateless) | Claude Code 에이전트 도구 |
| `/ws` | ws | 실시간 업데이트 |
| 나머지 | Next.js | 웹 UI |

## MCP 서버 (Stateless)

- `sessionIdGenerator: undefined` — 세션 없음
- 매 POST 요청마다 새 McpServer + Transport 생성 후 처리
- GET/DELETE → 405 (SSE/세션 종료 미지원)
- 서버 재시작해도 MCP 연결 문제 없음

## 배포

### Docker

```bash
docker compose build
docker compose up -d
```

- 볼륨: `./data:/app/data` (DB 영속성)
- 환경변수: `.env` 파일
- 포트: `${PORT:-4000}:4000`

### MCP 등록 (개발자 PC)

```bash
claude mcp add --transport http kanban-skynet http://<서버IP>:4000/mcp -s user
```

## 설계 문서

- [docs/architecture.md](docs/architecture.md) — 전체 아키텍처
- [docs/database.md](docs/database.md) — SQLite 스키마
- [docs/mcp-server.md](docs/mcp-server.md) — MCP 서버 툴 설계
- [docs/web-ui.md](docs/web-ui.md) — 웹 UI 설계

## 에이전트 정의

- [.claude/agents/ks-orchestrator.md](.claude/agents/ks-orchestrator.md) — PM (태스크 분배)
- [.claude/agents/ks-architect.md](.claude/agents/ks-architect.md) — 시스템 설계
- [.claude/agents/ks-database.md](.claude/agents/ks-database.md) — DB 설계/최적화
- [.claude/agents/ks-backend.md](.claude/agents/ks-backend.md) — 서버 구현
- [.claude/agents/ks-frontend.md](.claude/agents/ks-frontend.md) — UI 구현
- [.claude/agents/ks-security.md](.claude/agents/ks-security.md) — 보안 검수 (코드 수정 금지)
- [.claude/agents/ks-qa.md](.claude/agents/ks-qa.md) — 기능 검증 (코드 수정 금지)

## 개발 규칙

- TypeScript strict mode
- 환경변수: `.env` 파일 관리 (`.env.example` 참조)
- DB 파일: `data/kanban-skynet.db` (서버 시작 시 자동 생성)
- 포트: 4000 (단일 포트)
- 인증 없음 (내부망 전용)
- 권한 제어 없음 — 모든 팀원이 모든 워크스페이스/프로젝트 접근 가능
- 테스트: `vitest` (DB/API 단위/통합 테스트)
- QA/SECURITY 에이전트는 코드 수정 금지 — 이슈 발견 시 `create_task`로 새 수정 태스크 생성
