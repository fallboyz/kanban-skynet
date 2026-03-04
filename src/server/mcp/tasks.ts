import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskFilters } from '../types.js';
import {
  getTasksByProject,
  getTaskById,
  createTask,
  updateTask,
  startTask,
  transitionTaskStatus,
  validateSameProject,
  getCommentsByTask,
  createComment,
  addDependency,
  removeDependency,
  getDependencies,
  getDependents,
  wouldCreateCycle,
} from '../db/index.js';
import { broadcast } from '../ws.js';
import {
  TaskStatusSchema, TaskPrioritySchema, TaskRoleSchema,
  MAX_TITLE_LENGTH, MAX_DESCRIPTION_LENGTH, MAX_COMMENT_LENGTH, MAX_AUTHOR_LENGTH, MAX_REASON_LENGTH,
} from '../constants.js';
import { successResponse, errorResponse } from './helpers.js';

export function registerTaskTools(server: McpServer): void {
  server.registerTool(
    'list_tasks',
    {
      description: '프로젝트 내 태스크 목록을 조회합니다. status, role로 필터링할 수 있습니다.',
      inputSchema: {
        project_id: z.string().describe('조회할 프로젝트 ID'),
        status: TaskStatusSchema.optional().describe('필터: 태스크 상태 (ready|in_progress|review|done|cancelled)'),
        role: TaskRoleSchema.optional().describe('필터: 담당 역할 (ARCHITECT|DATABASE|BACKEND|FRONTEND|SECURITY|QA)'),
      },
    },
    async ({ project_id, status, role }) => {
      try {
        const filters: TaskFilters = {};
        if (status) filters.status = status;
        if (role) filters.role = role;
        const result = getTasksByProject(project_id, filters);
        return successResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  server.registerTool(
    'get_task',
    {
      description: '태스크 단건을 조회합니다. 댓글, 의존관계도 함께 반환됩니다.',
      inputSchema: {
        task_id: z.string().describe('조회할 태스크 ID'),
      },
    },
    async ({ task_id }) => {
      try {
        const task = getTaskById(task_id);
        if (!task) {
          return errorResponse('Task not found');
        }
        const comments = getCommentsByTask(task_id);
        const dependencies = getDependencies(task_id);
        const dependents = getDependents(task_id);
        return successResponse({ ...task, comments, dependencies, dependents });
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  server.registerTool(
    'create_task',
    {
      description: '새 태스크를 생성합니다. parent_id를 지정하면 서브 태스크로 생성됩니다. depends_on으로 의존관계를 함께 설정할 수 있습니다.',
      inputSchema: {
        project_id: z.string().describe('태스크가 속할 프로젝트 ID'),
        title: z.string().trim().min(1).max(MAX_TITLE_LENGTH).describe('태스크 제목'),
        description: z.string().trim().max(MAX_DESCRIPTION_LENGTH).optional().describe('태스크 상세 설명 (선택)'),
        priority: TaskPrioritySchema.optional().describe('우선순위: critical|high|medium|low (기본: medium)'),
        role: TaskRoleSchema.optional().describe('담당 역할: ARCHITECT|DATABASE|BACKEND|FRONTEND|SECURITY|QA (기본: BACKEND)'),
        parent_id: z.string().optional().describe('상위 태스크 ID (서브 태스크일 경우, 같은 프로젝트여야 함)'),
        depends_on: z.array(z.string()).max(50).optional().describe('의존하는 태스크 ID 목록 (같은 프로젝트여야 함, 최대 50개)'),
      },
    },
    async ({ project_id, title, description, priority, role, parent_id, depends_on }) => {
      try {
        // Validate parent_id belongs to same project
        if (parent_id) {
          const parentTask = getTaskById(parent_id);
          if (!parentTask) return errorResponse('parent_id: task not found');
          if (parentTask.project_id !== project_id) {
            return errorResponse('parent_id must belong to the same project');
          }
        }

        // Validate depends_on tasks belong to same project
        if (depends_on && depends_on.length > 0) {
          for (const depId of depends_on) {
            const depTask = getTaskById(depId);
            if (!depTask) return errorResponse(`depends_on: task '${depId}' not found`);
            if (depTask.project_id !== project_id) {
              return errorResponse(`depends_on: task '${depId}' belongs to a different project`);
            }
          }
        }

        const task = createTask({
          project_id,
          title,
          description,
          priority,
          role,
          parent_id,
          depends_on,
        });
        broadcast({ type: 'task:created', payload: task });
        return successResponse(task);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  server.registerTool(
    'start_task',
    {
      description: '에이전트가 태스크를 가져가 작업을 시작합니다. status가 ready인 태스크만 시작 가능하며, blocked 상태이거나 의존관계가 미충족이면 에러를 반환합니다. 원자적으로 처리되어 동시에 두 에이전트가 같은 태스크를 가져가는 것을 방지합니다.',
      inputSchema: {
        task_id: z.string().describe('시작할 태스크 ID'),
        agent_name: z.string().trim().min(1).max(MAX_AUTHOR_LENGTH).describe('에이전트명 (예: "claude-backend", "claude-frontend")'),
      },
    },
    async ({ task_id, agent_name }) => {
      try {
        const result = startTask(task_id, agent_name);
        if (!result.ok) return errorResponse(result.error);
        broadcast({ type: 'task:updated', payload: result.task });
        return successResponse(result.task);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  server.registerTool(
    'update_task_status',
    {
      description: '태스크의 상태를 변경합니다. ready->in_progress 전환은 start_task를 사용해야 합니다. blocked 상태인 태스크는 cancelled로만 전환 가능합니다.',
      inputSchema: {
        task_id: z.string().describe('상태를 변경할 태스크 ID'),
        status: TaskStatusSchema.describe('변경할 상태: ready|in_progress|review|done|cancelled'),
      },
    },
    async ({ task_id, status }) => {
      try {
        const result = transitionTaskStatus(task_id, status);
        if (!result.ok) return errorResponse(result.error);
        broadcast({ type: 'task:updated', payload: result.task });
        return successResponse(result.task);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  server.registerTool(
    'block_task',
    {
      description: '태스크를 blocked 상태로 전환합니다. 차단 사유를 기록합니다. 완료(done) 또는 취소(cancelled) 상태의 태스크는 차단할 수 없습니다.',
      inputSchema: {
        task_id: z.string().describe('차단할 태스크 ID'),
        reason: z.string().trim().min(1).max(MAX_REASON_LENGTH).describe('차단 사유 (예: "DB 스키마 변경 대기 중")'),
      },
    },
    async ({ task_id, reason }) => {
      try {
        const task = getTaskById(task_id);
        if (!task) return errorResponse('Task not found');
        if (task.status === 'done' || task.status === 'cancelled') {
          return errorResponse(`Cannot block task: status is '${task.status}' (terminal state)`);
        }

        const result = updateTask(task_id, { is_blocked: true, blocked_reason: reason });
        if (!result) return errorResponse('Task not found');
        broadcast({ type: 'task:updated', payload: result });
        return successResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  server.registerTool(
    'unblock_task',
    {
      description: '태스크의 blocked 상태를 해제합니다.',
      inputSchema: {
        task_id: z.string().describe('차단 해제할 태스크 ID'),
      },
    },
    async ({ task_id }) => {
      try {
        const result = updateTask(task_id, { is_blocked: false, blocked_reason: null });
        if (!result) return errorResponse('Task not found');
        broadcast({ type: 'task:updated', payload: result });
        return successResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  server.registerTool(
    'add_dependency',
    {
      description: '태스크 간 의존관계를 추가합니다. task_id가 depends_on 태스크에 의존하게 됩니다. 두 태스크는 같은 프로젝트에 속해야 합니다.',
      inputSchema: {
        task_id: z.string().describe('의존하는 태스크 ID (이 태스크가 기다림)'),
        depends_on: z.string().describe('선행 태스크 ID (이 태스크가 먼저 완료되어야 함)'),
      },
    },
    async ({ task_id, depends_on }) => {
      try {
        const task = getTaskById(task_id);
        if (!task) return errorResponse('Task not found');
        const dep = getTaskById(depends_on);
        if (!dep) return errorResponse('Dependency task not found');
        if (task_id === depends_on) return errorResponse('A task cannot depend on itself');

        const crossProjectError = validateSameProject(task_id, depends_on);
        if (crossProjectError) return errorResponse(crossProjectError);

        if (wouldCreateCycle(task_id, depends_on)) {
          return errorResponse('Cannot add dependency: would create a circular dependency');
        }

        addDependency(task_id, depends_on);
        broadcast({ type: 'dependency:added', payload: { task_id, depends_on } });
        return successResponse({ task_id, depends_on });
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  server.registerTool(
    'remove_dependency',
    {
      description: '태스크 간 의존관계를 제거합니다.',
      inputSchema: {
        task_id: z.string().describe('의존 관계를 제거할 태스크 ID'),
        depends_on: z.string().describe('제거할 선행 태스크 ID'),
      },
    },
    async ({ task_id, depends_on }) => {
      try {
        removeDependency(task_id, depends_on);
        broadcast({ type: 'dependency:removed', payload: { task_id, depends_on } });
        return successResponse({ ok: true });
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  server.registerTool(
    'add_comment',
    {
      description: '태스크에 댓글 또는 상태 변경 로그를 추가합니다.',
      inputSchema: {
        task_id: z.string().describe('댓글을 추가할 태스크 ID'),
        content: z.string().trim().min(1).max(MAX_COMMENT_LENGTH).describe('댓글 내용 또는 상태 변경 메시지'),
        author: z.string().trim().min(1).max(MAX_AUTHOR_LENGTH).describe('작성자 (에이전트명 또는 "user")'),
      },
    },
    async ({ task_id, content, author }) => {
      try {
        const task = getTaskById(task_id);
        if (!task) return errorResponse('Task not found');

        const comment = createComment({ task_id, content, author });
        broadcast({ type: 'comment:added', payload: comment });
        return successResponse(comment);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}
