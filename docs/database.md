# 데이터베이스 설계

## 기본 설정

- 엔진: SQLite
- 파일 위치: `data/kanban-skynet.db`
- 드라이버: `better-sqlite3` (Node.js 동기식)
- WAL 모드 + busy_timeout 필수 (에이전트 동시 접근 대비)

```sql
PRAGMA journal_mode=WAL;
PRAGMA busy_timeout=5000;
PRAGMA foreign_keys=ON;
```

## ID 생성 전략

모든 테이블의 PK는 ULID 사용.
- 시간 순 정렬 가능
- 전역 유일성 보장
- 라이브러리: `ulidx` (npm)

---

## 계층 구조

```
workspaces (큰 서비스/팀 단위)
  └── projects (기능 단위)
        └── tasks (에이전트 작업 단위 — 칸반 카드)
              ├── comments (댓글/활동 로그)
              └── task_dependencies (태스크 간 의존관계)
```

---

## 테이블 정의

### workspaces

팀 또는 서비스 단위의 최상위 그룹.

```sql
CREATE TABLE IF NOT EXISTS workspaces (
  id          TEXT PRIMARY KEY,           -- ULID
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL            -- Unix timestamp (ms)
);
```

### projects

기능 단위. 사용자가 "이거 만들어줘" 하는 단위. 태스크들의 컨테이너.

```sql
CREATE TABLE IF NOT EXISTS projects (
  id           TEXT PRIMARY KEY,          -- ULID
  workspace_id TEXT NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  auto_approve INTEGER NOT NULL DEFAULT 1, -- 1=ON(에이전트 자동 태스크 생성), 0=OFF(승인 대기)
  created_at   INTEGER NOT NULL,          -- Unix timestamp (ms)

  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
```

### tasks

칸반 보드의 핵심 엔티티. 에이전트가 실제로 수행하는 세부 작업.

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id             TEXT PRIMARY KEY,        -- ULID
  project_id     TEXT NOT NULL,
  parent_id      TEXT,                    -- NULL이면 최상위 태스크, 값이 있으면 서브 태스크
  title          TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'ready',
  priority       TEXT NOT NULL DEFAULT 'medium',
  role           TEXT NOT NULL DEFAULT 'BACKEND',
  agent_name     TEXT,                    -- 담당 에이전트명 (예: claude-backend)
  is_blocked     INTEGER NOT NULL DEFAULT 0,
  blocked_reason TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,

  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id)  REFERENCES tasks(id)    ON DELETE CASCADE
);
```

**status 허용값:** `ready` | `in_progress` | `review` | `done` | `cancelled`

| Status | 의미 |
|--------|------|
| ready | 태스크 생성됨, 에이전트 배정 대기 |
| in_progress | 에이전트가 작업 중 |
| review | QA 검증 대기 |
| done | 완료 |
| cancelled | 취소됨 (칸반 컬럼에 표시하지 않음) |

**status 전환 규칙:**

```
ready ---------> in_progress    (에이전트가 start_task로 작업 시작)
in_progress ---> review         (구현 완료, 리뷰 요청)
in_progress ---> ready          (작업 포기/재할당)
in_progress ---> cancelled      (진행 중 취소)
review --------> done           (QA 통과)
review --------> in_progress    (QA 실패, 재작업)
review --------> cancelled      (리뷰 중 취소)
ready ---------> cancelled      (불필요한 태스크 취소)
done ----------> (전환 불가)
cancelled -----> (전환 불가)
```

**priority 허용값:** `critical` | `high` | `medium` | `low`

**role 허용값:** `ARCHITECT` | `DATABASE` | `BACKEND` | `FRONTEND` | `SECURITY` | `QA`

| Role | 의미 |
|------|------|
| ARCHITECT | 시스템 설계, 아키텍처, 기술 의사결정 |
| DATABASE | DB 스키마, 쿼리, 데이터 모델링 |
| BACKEND | 서버, API, 비즈니스 로직 |
| FRONTEND | UI, 컴포넌트, 스타일, 클라이언트 로직 |
| SECURITY | 보안 검증, 취약점 분석, 인증/인가 |
| QA | 테스트 작성, 품질 검증, 검수 |

### task_dependencies

태스크 간 선행/후행 의존관계. 같은 레벨의 태스크끼리 순서를 지정할 때 사용.

```sql
CREATE TABLE IF NOT EXISTS task_dependencies (
  task_id      TEXT NOT NULL,    -- 후행 태스크 (이 태스크가 대기함)
  depends_on   TEXT NOT NULL,    -- 선행 태스크 (이 태스크가 먼저 완료되어야 함)
  PRIMARY KEY (task_id, depends_on),
  FOREIGN KEY (task_id)    REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (depends_on) REFERENCES tasks(id) ON DELETE CASCADE
);
```

- `parent_id`는 부모-자식 계층 관계 (구조적)
- `task_dependencies`는 같은 레벨 태스크 간 선후관계 (실행 순서)
- 예: "백엔드 API 구현" 완료 후 "프론트엔드 연동" 시작 가능

### comments

태스크에 달리는 댓글 및 상태 변경 로그.

```sql
CREATE TABLE IF NOT EXISTS comments (
  id         TEXT PRIMARY KEY,            -- ULID
  task_id    TEXT NOT NULL,
  content    TEXT NOT NULL,
  author     TEXT NOT NULL,               -- 에이전트명 또는 'user'
  created_at INTEGER NOT NULL,

  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
```

---

## 인덱스

```sql
-- 워크스페이스별 프로젝트 조회
CREATE INDEX IF NOT EXISTS idx_projects_workspace_id ON projects(workspace_id);

-- 프로젝트별 태스크 조회 (가장 빈번한 쿼리)
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);

-- 상태별 필터링
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- role별 필터링
CREATE INDEX IF NOT EXISTS idx_tasks_role ON tasks(role);

-- 서브 태스크 조회
CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);

-- 태스크별 댓글 조회
CREATE INDEX IF NOT EXISTS idx_comments_task_id ON comments(task_id);

-- 의존관계 조회 (양방향)
CREATE INDEX IF NOT EXISTS idx_deps_task_id    ON task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_deps_depends_on ON task_dependencies(depends_on);
```

---

## 초기화 코드 위치

`src/server/db/connection.ts`에서 DB 초기화 및 테이블 생성 담당.
도메인별 CRUD 함수는 `src/server/db/` 하위 파일에 분할:

```
src/server/db/
├── connection.ts     # DB 연결 + 스키마 + 마이그레이션
├── index.ts          # re-export (connection + 도메인 모듈)
├── workspaces.ts     # 워크스페이스 CRUD
├── projects.ts       # 프로젝트 CRUD
├── tasks.ts          # 태스크 CRUD
├── comments.ts       # 댓글 CRUD
└── dependencies.ts   # 의존관계 CRUD + 순환 검증
```

서버 시작 시 자동 실행 (IF NOT EXISTS 사용하므로 멱등성 보장).

---

## 마이그레이션

기존 DB에서 업그레이드 시 자동 실행:

```sql
-- status 마이그레이션
UPDATE tasks SET status = 'ready' WHERE status = 'todo';
UPDATE tasks SET status = 'in_progress' WHERE status = 'claimed';

-- role 마이그레이션 (소문자 -> 대문자, 제거된 role 변환)
UPDATE tasks SET role = 'BACKEND' WHERE role IN ('backend', 'fullstack', 'infra');
UPDATE tasks SET role = 'FRONTEND' WHERE role = 'frontend';
UPDATE tasks SET role = 'QA' WHERE role IN ('qa', 'test');
UPDATE tasks SET role = 'ARCHITECT' WHERE role = 'architect';
UPDATE tasks SET role = 'DATABASE' WHERE role = 'database';
UPDATE tasks SET role = 'SECURITY' WHERE role = 'security';
```

---

## 주요 쿼리 패턴

### 프로젝트별 전체 태스크 조회
```sql
SELECT * FROM tasks
WHERE project_id = ?
ORDER BY created_at ASC;
```

### 역할별 필터 + 상태별 필터
```sql
SELECT * FROM tasks
WHERE project_id = ?
  AND role = ?        -- 선택적
  AND status = ?      -- 선택적
ORDER BY created_at ASC;
```

### 태스크 시작 (start_task)
```sql
UPDATE tasks
SET status = 'in_progress', agent_name = ?, updated_at = ?
WHERE id = ? AND status = 'ready';
```

### 의존관계 조회 (선행 태스크)
```sql
SELECT t.* FROM tasks t
JOIN task_dependencies d ON d.depends_on = t.id
WHERE d.task_id = ?;
```

### 의존관계 충족 확인
```sql
SELECT COUNT(*) as unmet FROM task_dependencies d
JOIN tasks t ON t.id = d.depends_on
WHERE d.task_id = ? AND t.status != 'done';
```

### 프로젝트 설정 조회/변경
```sql
SELECT auto_approve FROM projects WHERE id = ?;
UPDATE projects SET auto_approve = ? WHERE id = ?;
```

**auto_approve 허용값:** `1` (ON, 기본값) | `0` (OFF)
- ON: Orchestrator 에이전트가 서브 태스크를 자동으로 생성
- OFF: Orchestrator가 플랜만 수립하고 사용자 승인을 기다림

### 통계 (상단 바)
```sql
SELECT
  COUNT(*) as total,
  SUM(CASE WHEN status IN ('in_progress', 'review') THEN 1 ELSE 0 END) as active,
  SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
  SUM(CASE WHEN is_blocked = 1 THEN 1 ELSE 0 END) as blocked
FROM tasks
WHERE project_id = ? AND status != 'cancelled';
```
