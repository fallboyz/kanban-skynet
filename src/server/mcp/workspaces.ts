import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getAllWorkspaces, createWorkspace } from '../db/index.js';
import { MAX_NAME_LENGTH, MAX_DESCRIPTION_LENGTH } from '../constants.js';
import { successResponse, errorResponse } from './helpers.js';

export function registerWorkspaceTools(server: McpServer): void {
  server.registerTool(
    'list_workspaces',
    {
      description: '전체 워크스페이스 목록을 조회합니다.',
    },
    async () => {
      try {
        const result = getAllWorkspaces();
        return successResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  server.registerTool(
    'create_workspace',
    {
      description: '새 워크스페이스를 생성합니다.',
      inputSchema: {
        name: z.string().trim().min(1).max(MAX_NAME_LENGTH).describe('워크스페이스명 (예: "쇼핑몰 앱")'),
        description: z.string().trim().max(MAX_DESCRIPTION_LENGTH).optional().describe('워크스페이스 설명 (선택)'),
      },
    },
    async ({ name, description }) => {
      try {
        const result = createWorkspace({ name, description });
        return successResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}
