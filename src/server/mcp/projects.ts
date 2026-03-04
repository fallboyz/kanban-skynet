import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getProjectsByWorkspace, createProject, getProjectById, updateProjectSettings } from '../db/index.js';
import { MAX_NAME_LENGTH, MAX_DESCRIPTION_LENGTH } from '../constants.js';
import { broadcast } from '../ws.js';
import { successResponse, errorResponse } from './helpers.js';

export function registerProjectTools(server: McpServer): void {
  server.registerTool(
    'list_projects',
    {
      description: '워크스페이스 내 프로젝트 목록을 조회합니다.',
      inputSchema: {
        workspace_id: z.string().describe('조회할 워크스페이스 ID'),
      },
    },
    async ({ workspace_id }) => {
      try {
        const result = getProjectsByWorkspace(workspace_id);
        return successResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  server.registerTool(
    'create_project',
    {
      description: '새 프로젝트를 생성합니다.',
      inputSchema: {
        workspace_id: z.string().describe('프로젝트가 속할 워크스페이스 ID'),
        name: z.string().trim().min(1).max(MAX_NAME_LENGTH).describe('프로젝트명 (예: "로그인 기능")'),
        description: z.string().trim().max(MAX_DESCRIPTION_LENGTH).optional().describe('프로젝트 설명 (선택)'),
      },
    },
    async ({ workspace_id, name, description }) => {
      try {
        const result = createProject({ workspace_id, name, description });
        return successResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  server.registerTool(
    'get_project_settings',
    {
      description: '프로젝트 설정을 조회합니다. auto_approve 여부 등을 확인할 수 있습니다.',
      inputSchema: {
        project_id: z.string().describe('조회할 프로젝트 ID'),
      },
    },
    async ({ project_id }) => {
      try {
        const project = getProjectById(project_id);
        if (!project) {
          return errorResponse('Project not found');
        }
        return successResponse({ auto_approve: project.auto_approve });
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  server.registerTool(
    'update_project_settings',
    {
      description: '프로젝트 설정을 변경합니다. 현재 auto_approve (자동 승인 여부)를 설정할 수 있습니다.',
      inputSchema: {
        project_id: z.string().describe('설정을 변경할 프로젝트 ID'),
        auto_approve: z.boolean().describe('자동 승인 여부 (true|false)'),
      },
    },
    async ({ project_id, auto_approve }) => {
      try {
        const updated = updateProjectSettings(project_id, { auto_approve });
        if (!updated) {
          return errorResponse('Project not found');
        }
        broadcast({ type: 'project:updated', payload: updated });
        return successResponse({ auto_approve: updated.auto_approve });
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}
