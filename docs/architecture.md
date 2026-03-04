# 전체 아키텍처

## 시스템 구성도

```
[팀원 브라우저]
    |  HTTP/WebSocket
    v
[공용 서버 — 단일 프로세스 (포트 4000)]
    ├── Next.js             # 웹 UI (페이지, 정적 파일)
    ├── Hono API            # REST API (/api/*, /health)
    ├── MCP (Stateless)     # MCP 연동 (/mcp — Streamable HTTP)
    ├── WebSocket           # 실시간 업데이트 (/ws)
    └── SQLite DB           # data/kanban-skynet.db

[개발자 PC - 각자]
    └── Claude Code
         └── MCP 설정에 공용 서버 MCP URL 등록
              claude mcp add --transport http kanban-skynet http://공용서버IP:4000/mcp -s user
```

## 계층 구조

```
Workspace (큰 서비스/팀 단위 — 예: 쇼핑몰 앱)
  └── Project (기능 단위 — 예: 로그인 기능)
        └── Task (에이전트 작업 단위 — 칸반 카드)
              └── task_dependencies (태스크 간 의존관계)
```

## 컴포넌트별 역할

### Custom Server (server.ts)
- HTTP 요청을 경로별로 적절한 핸들러에 분배
  - `/api/*`, `/health` -> Hono API
  - `/mcp` -> MCP Stateless HTTP 핸들러
  - `/ws` -> WebSocket (ws 라이브러리)
  - 나머지 -> Next.js
- 서버 시작 시 orphaned task 복구 (in_progress 상태로 남은 태스크 -> ready 복원)
- Graceful shutdown (SIGINT, SIGTERM)

### Next.js 웹 (src/app/, src/components/)
- 칸반보드 UI 렌더링 (4컬럼: Ready, In Progress, Review, Done)
- WebSocket으로 실시간 업데이트 수신 (이벤트 배치 처리)
- Workspace / Project / Role 필터링
- 프로젝트별 auto_approve 토글
- 게임카드 스타일 태스크 카드 (등급 배지, 역할별 색상, 호버 효과)
- Done 컬럼: 서버 페이지네이션 + 검색 (나머지 3개 컬럼은 전체 로드)

### Hono API (src/server/api/)
- REST API 엔드포인트 제공 (웹 UI에서 fetch로 호출)
- 요청 바디 크기 제한 (1MB)
- 입력 길이 제한 (Zod 스키마)
- CORS 허용 (내부망 전용이므로 전체 허용)

### MCP (src/server/mcp/)
- Stateless Streamable HTTP transport
- 매 POST 요청마다 새 McpServer + Transport 생성 후 처리
- 세션 없음 (`sessionIdGenerator: undefined`) — 서버 재시작해도 연결 문제 없음
- MCP 도구가 DB 함수를 직접 호출 (HTTP 경유 없음)
- 태스크 생성/수정 시 WebSocket broadcast 직접 호출

### WebSocket (src/server/ws.ts)
- 태스크 상태 변경 시 연결된 모든 클라이언트에 브로드캐스트
- Hono 라우트와 MCP 도구 모두에서 broadcast() 호출
- 이벤트: task:created, task:updated, comment:added, project:updated, dependency:added, dependency:removed

### SQLite DB (src/server/db/)
- 파일 위치: `data/kanban-skynet.db`
- WAL 모드 + busy_timeout=5000ms (동시 쓰기 충돌 방지)
- 테이블: workspaces, projects, tasks, comments, task_dependencies
- 서버 시작 시 자동 생성 (CREATE TABLE IF NOT EXISTS)

## 데이터 흐름

### 태스크 생성 흐름 (에이전트)
```
사용자 -> IDE에서 프롬프트로 기능 요청
       -> Orchestrator 에이전트가 요구사항 분석
       -> get_project_settings로 auto_approve 확인
       -> auto_approve ON  -> 서브 태스크 자동 생성 (create_task + add_dependency)
       -> auto_approve OFF -> 플랜만 수립 후 사용자 승인 대기
       -> MCP 도구 -> DB 직접 INSERT + WebSocket 브로드캐스트
       -> 웹 UI 실시간 반영
```

### 태스크 작업 흐름 (에이전트)
```
에이전트 -> start_task (status: ready -> in_progress, agent_name 기록)
         -> 코드 구현
         -> update_task_status (in_progress -> review)
         -> QA 에이전트 검증
         -> update_task_status (review -> done)
         -> 웹 UI 실시간 반영
```

## 배포

### Docker (권장)
```bash
docker compose up -d
```

- Dockerfile: multi-stage 빌드 (node:22-alpine)
- 볼륨: `./data:/app/data` (DB 영속성)
- 포트: `${PORT:-4000}:4000`
- 환경변수: `.env` 파일

### 직접 실행
```bash
npm install
npm run build
npm start
```

## 포트 정보

| 서비스 | 포트 | 용도 |
|--------|------|------|
| 통합 서버 | 4000 | 웹 UI + REST API + MCP + WebSocket |

## 환경변수

### .env
```
PORT=4000
DB_PATH=./data/kanban-skynet.db
```
