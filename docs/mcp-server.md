# MCP 서버 설계

## 개요

- 위치: `src/server/mcp/`
- 런타임: Next.js Custom Server와 동일 프로세스
- SDK: `@modelcontextprotocol/sdk`
- Transport: **Streamable HTTP (Stateless)** — `/mcp` 단일 엔드포인트
- 세션: 없음 (`sessionIdGenerator: undefined`)
- 역할: Claude Code Agent Team의 각 에이전트가 칸반보드를 조작하는 인터페이스
- 통신: DB 함수 직접 호출 (HTTP 경유 없음)
- 포트: 4000 (통합 서버와 동일)

## Stateless 모드

매 POST 요청마다 새 McpServer + Transport 인스턴스를 생성하여 처리한다.

- 세션 ID 없음 — 서버 재시작해도 MCP 연결 문제 없음
- GET /mcp -> 405 (SSE 미지원, 실시간 업데이트는 WebSocket 담당)
- DELETE /mcp -> 405 (세션 종료 개념 없음)

Stateless를 선택한 이유: MCP SDK 클라이언트(`StreamableHTTPClientTransport`)가 세션 만료 시 자동 재초기화를 지원하지 않음. 서버 재시작(Docker 재배포 등)하면 모든 MCP 연결이 영구적으로 끊기는 문제가 있었음.

## MCP 등록 (개발자 PC)

Claude Code CLI로 등록:

```bash
claude mcp add --transport http kanban-skynet http://<서버IP>:4000/mcp -s user
```

`-s user`는 글로벌(사용자 레벨) 설정에 등록한다는 의미.

---

## 툴 목록

### 워크스페이스 관련

#### `list_workspaces`
전체 워크스페이스 목록 조회.

```typescript
// 입력: 없음
// 출력: Workspace[]
```

#### `create_workspace`
새 워크스페이스 생성.

```typescript
// 입력
{
  name: string,         // 워크스페이스명 (예: "쇼핑몰 앱")
  description?: string  // 설명 (선택)
}
// 출력: Workspace
```

---

### 프로젝트 관련

#### `list_projects`
워크스페이스 내 프로젝트 목록 조회.

```typescript
// 입력
{
  workspace_id: string  // 필수
}
// 출력: Project[]
```

#### `create_project`
새 프로젝트 생성.

```typescript
// 입력
{
  workspace_id: string,
  name: string,         // 프로젝트명 (예: "로그인 기능")
  description?: string  // 설명 (선택)
}
// 출력: Project
```

#### `get_project_settings`
프로젝트 설정 조회. Orchestrator가 auto_approve 여부 확인 시 사용.

```typescript
// 입력
{
  project_id: string
}
// 출력: { auto_approve: boolean }
```

---

### 태스크 관련

#### `list_tasks`
태스크 목록 조회. 필터 옵션 제공.

```typescript
// 입력
{
  project_id: string,   // 필수
  status?: string,      // 선택: ready|in_progress|review|done|cancelled
  role?: string         // 선택: ARCHITECT|DATABASE|BACKEND|FRONTEND|SECURITY|QA
}
// 출력: Task[]
```

#### `get_task`
태스크 단건 조회 (댓글 + 의존관계 포함).

```typescript
// 입력
{
  task_id: string
}
// 출력: Task & { comments: Comment[], dependencies: string[], dependents: string[] }
```

#### `create_task`
태스크 생성. 서브 태스크도 이 툴로 생성.

```typescript
// 입력
{
  project_id: string,
  title: string,
  description?: string,
  priority?: string,     // critical|high|medium|low (기본: medium)
  role?: string,         // ARCHITECT|DATABASE|BACKEND|FRONTEND|SECURITY|QA (기본: BACKEND)
  parent_id?: string,    // 서브 태스크일 경우 상위 태스크 ID
  depends_on?: string[]  // 선행 태스크 ID 목록 (선택)
}
// 출력: Task
```

#### `start_task`
에이전트가 태스크를 가져가 작업을 시작. status가 `in_progress`로 변경되고 agent_name이 기록됨.

```typescript
// 입력
{
  task_id: string,
  agent_name: string   // 예: "claude-backend", "claude-frontend"
}
// 출력: Task
```

검증:
- status가 `ready`가 아니면 에러
- `is_blocked=true`면 에러
- 선행 태스크(dependencies)가 모두 `done`이 아니면 에러

#### `update_task_status`
태스크 상태 변경. 전환 규칙 검증 포함.

```typescript
// 입력
{
  task_id: string,
  status: "ready" | "in_progress" | "review" | "done" | "cancelled"
}
// 출력: Task
```

허용되는 전환:
| 현재 | 허용 대상 |
|------|----------|
| ready | in_progress, cancelled |
| in_progress | review, ready, cancelled |
| review | done, in_progress, cancelled |
| done | (없음) |
| cancelled | (없음) |

#### `block_task`
태스크를 blocked 처리.

```typescript
// 입력
{
  task_id: string,
  reason: string   // blocked 사유
}
// 출력: Task
```

#### `unblock_task`
blocked 해제.

```typescript
// 입력
{
  task_id: string
}
// 출력: Task
```

---

### 의존관계 관련

#### `add_dependency`
태스크 간 의존관계 설정. task_id가 depends_on 완료 후에만 시작 가능.

```typescript
// 입력
{
  task_id: string,     // 후행 태스크 ID (이 태스크가 대기함)
  depends_on: string   // 선행 태스크 ID (이 태스크가 먼저 완료되어야 함)
}
// 출력: { task_id: string, depends_on: string }
```

순환 의존 검증 포함 (A->B->C->A 방지).

#### `remove_dependency`
태스크 간 의존관계 제거.

```typescript
// 입력
{
  task_id: string,
  depends_on: string
}
// 출력: { success: true }
```

---

### 댓글 관련

#### `add_comment`
태스크에 댓글/로그 추가.

```typescript
// 입력
{
  task_id: string,
  content: string,   // 댓글 내용 또는 상태 변경 메시지
  author: string     // 에이전트명 또는 "user"
}
// 출력: Comment
```

---

## API 매핑

| MCP 툴 | HTTP 요청 |
|--------|-----------|
| list_workspaces | GET /api/workspaces |
| create_workspace | POST /api/workspaces |
| list_projects | GET /api/workspaces/:id/projects |
| create_project | POST /api/projects |
| get_project_settings | GET /api/projects/:id/settings |
| list_tasks | GET /api/projects/:id/tasks?status=&role= |
| get_task | GET /api/tasks/:id |
| create_task | POST /api/tasks |
| start_task | PATCH /api/tasks/:id (status=in_progress + agent_name) |
| update_task_status | PATCH /api/tasks/:id (status) |
| block_task | PATCH /api/tasks/:id (is_blocked + reason) |
| unblock_task | PATCH /api/tasks/:id (is_blocked=0) |
| add_dependency | POST /api/tasks/:id/dependencies |
| remove_dependency | DELETE /api/tasks/:id/dependencies/:depId |
| add_comment | POST /api/tasks/:id/comments |

---

## 파일 구조

```
src/server/mcp/
├── index.ts          # MCP Stateless HTTP 핸들러
├── helpers.ts        # 공통 응답 헬퍼 (successResponse, errorResponse)
├── workspaces.ts     # list_workspaces, create_workspace
├── projects.ts       # list_projects, create_project, get_project_settings
└── tasks.ts          # 태스크/의존관계/댓글 관련 모든 툴
```

## 보안

- 입력 길이 제한: 모든 문자열 필드에 Zod `.max()` 적용 (`src/server/constants.ts`)
- 요청 바디 크기 제한: 1MB (Hono 미들웨어)
- 인증 없음 (내부망 전용)

## 에러 처리

- 존재하지 않는 리소스 조작 시: 에러 반환 (isError: true)
- 잘못된 상태 전환 시: 에러 메시지에 현재 상태와 허용 전환 목록 포함
- 의존관계 미충족 시: 미완료 선행 태스크 ID 목록 포함
- FK 위반 시: "Referenced resource not found" 에러
