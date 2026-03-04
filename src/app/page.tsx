'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Comment, Project, Task, Workspace, WsEvent } from '@/types';
import * as api from '@/lib/api';
import { useWebSocket } from '@/hooks/useWebSocket';
import { StatsBar } from '@/components/StatsBar';
import { FilterBar } from '@/components/FilterBar';
import { KanbanBoard } from '@/components/KanbanBoard';
import { TaskDetailModal } from '@/components/TaskDetailModal';

// Relative time refresh interval (60s)
const RELATIVE_TIME_REFRESH_MS = 60_000;

export default function HomePage() {
  // 데이터 상태
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  // 필터 상태
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>('');
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<string>('');

  // 설정 상태
  const [autoApprove, setAutoApprove] = useState<boolean>(true);

  // 모달 상태
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskComments, setTaskComments] = useState<Comment[]>([]);
  const [taskDependencies, setTaskDependencies] = useState<string[]>([]);
  const [taskDependents, setTaskDependents] = useState<string[]>([]);

  // 상대시간 갱신용 tick
  const [, setTick] = useState(0);

  // 현재 필터 상태를 ref로 유지 (WebSocket 콜백에서 재연결 없이 참조)
  const selectedProjectRef = useRef(selectedProject);
  selectedProjectRef.current = selectedProject;
  const selectedRoleRef = useRef(selectedRole);
  selectedRoleRef.current = selectedRole;
  const projectsRef = useRef(projects);
  projectsRef.current = projects;

  // AbortController for API requests
  const taskAbortRef = useRef<AbortController | null>(null);

  // 태스크 데이터 재로드 (AbortController 적용)
  const reloadTasks = useCallback(() => {
    // Cancel any in-flight request
    taskAbortRef.current?.abort();
    const controller = new AbortController();
    taskAbortRef.current = controller;

    const currentProject = selectedProjectRef.current;
    const currentRole = selectedRoleRef.current;
    const currentProjects = projectsRef.current;

    if (!currentProject) {
      if (currentProjects.length === 0) return;
      Promise.all(
        currentProjects.map((p) =>
          api.getTasks(p.id, currentRole ? { role: currentRole } : undefined),
        ),
      )
        .then((results) => {
          if (controller.signal.aborted) return;
          setTasks(results.flat());
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          console.error(err);
        });
    } else {
      api
        .getTasks(
          currentProject,
          currentRole ? { role: currentRole } : undefined,
        )
        .then((data) => {
          if (controller.signal.aborted) return;
          setTasks(data);
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          console.error(err);
        });
    }
  }, []);

  // WebSocket 이벤트 핸들러
  const handleWsEvent = useCallback((event: WsEvent) => {
    if (event.type === 'task:created') {
      const currentProject = selectedProjectRef.current;
      const currentProjects = projectsRef.current;
      const projectIds = currentProject
        ? new Set([currentProject])
        : new Set(currentProjects.map((p) => p.id));
      if (!projectIds.has(event.payload.project_id)) return;

      setTasks((prev) => {
        if (prev.some((t) => t.id === event.payload.id)) return prev;
        return [...prev, event.payload];
      });
    } else if (event.type === 'task:updated') {
      setTasks((prev) =>
        prev.map((t) => (t.id === event.payload.id ? event.payload : t)),
      );
      setSelectedTask((prev) =>
        prev?.id === event.payload.id ? event.payload : prev,
      );
    } else if (event.type === 'comment:added') {
      setTaskComments((prev) => {
        // Use updater function to avoid stale closure over selectedTask
        // We check task_id against the comment's task_id
        if (!prev.some((c) => c.id === event.payload.id)) {
          return [...prev, event.payload];
        }
        return prev;
      });
    }
    // dependency:added / dependency:removed are handled by task detail reload
  }, []);

  useWebSocket(handleWsEvent, reloadTasks);

  // 상대시간 갱신 타이머
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), RELATIVE_TIME_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  // Page Visibility API: 탭 복귀 시 데이터 재로드
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        reloadTasks();
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [reloadTasks]);

  // 초기 워크스페이스 로드
  useEffect(() => {
    api.getWorkspaces().then(setWorkspaces).catch(console.error);
  }, []);

  // 워크스페이스 변경 시 프로젝트 로드
  useEffect(() => {
    if (selectedWorkspace) {
      api
        .getProjects(selectedWorkspace)
        .then((data) => {
          setProjects(data);
          setSelectedProject('');
          setTasks([]); // 필터 잔류 방지: 프로젝트 목록 변경 시 태스크 초기화
        })
        .catch(console.error);
    } else {
      if (workspaces.length === 0) {
        setProjects([]);
        setTasks([]);
        return;
      }
      Promise.all(workspaces.map((ws) => api.getProjects(ws.id)))
        .then((results) => {
          setProjects(results.flat());
          setSelectedProject('');
          setTasks([]); // 필터 잔류 방지
        })
        .catch(console.error);
    }
  }, [selectedWorkspace, workspaces]);

  // 프로젝트 변경 시 설정 로드
  useEffect(() => {
    if (selectedProject) {
      api.getProjectSettings(selectedProject)
        .then((settings) => setAutoApprove(settings.auto_approve))
        .catch(console.error);
    } else {
      setAutoApprove(true);
    }
  }, [selectedProject]);

  // 프로젝트 변경 시 태스크 로드
  useEffect(() => {
    if (!selectedProject && projects.length === 0) {
      setTasks([]);
      return;
    }
    reloadTasks();
  }, [selectedProject, selectedRole, projects, reloadTasks]);

  // 태스크 클릭: 상세 + 댓글 로드
  async function handleTaskClick(task: Task) {
    setSelectedTask(task);
    setTaskComments([]);
    setTaskDependencies([]);
    setTaskDependents([]);
    try {
      const detail = await api.getTask(task.id);
      setTaskComments(detail.comments);
      setTaskDependencies(detail.dependencies);
      setTaskDependents(detail.dependents);
      setSelectedTask(detail);
    } catch {
      // 상세 로드 실패 시 기존 task 유지
    }
  }

  // 워크스페이스 생성
  async function handleCreateWorkspace(name: string) {
    try {
      const ws = await api.createWorkspace({ name });
      setWorkspaces((prev) => [...prev, ws]);
      setSelectedWorkspace(ws.id);
    } catch (err) {
      console.error('워크스페이스 생성 실패:', err);
    }
  }

  // 프로젝트 생성
  async function handleCreateProject(name: string) {
    if (!selectedWorkspace) return;
    try {
      const project = await api.createProject({
        workspace_id: selectedWorkspace,
        name,
      });
      setProjects((prev) => [...prev, project]);
      setSelectedProject(project.id);
    } catch (err) {
      console.error('프로젝트 생성 실패:', err);
    }
  }

  function handleWorkspaceChange(id: string) {
    setSelectedWorkspace(id);
  }

  function handleProjectChange(id: string) {
    setSelectedProject(id);
  }

  function handleRoleChange(role: string) {
    setSelectedRole(role);
  }

  async function handleAutoApproveChange(value: boolean) {
    if (!selectedProject) return;
    setAutoApprove(value);
    try {
      await api.updateProjectSettings(selectedProject, { auto_approve: value });
    } catch (err) {
      console.error('auto_approve 변경 실패:', err);
      setAutoApprove(!value);
    }
  }

  // 모달 닫기 (안정된 참조)
  const handleCloseModal = useCallback(() => {
    setSelectedTask(null);
    setTaskComments([]);
    setTaskDependencies([]);
    setTaskDependents([]);
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* 헤더 */}
      <header className="flex items-center justify-between border-b border-stone-200 bg-white/90 backdrop-blur px-6 py-3">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Kanban Skynet" className="h-10 w-10 rounded-xl" />
          <div>
            <h1 className="text-xl tracking-tight leading-none">
              <span className="font-light text-stone-400">Kanban</span>
              <span className="font-extrabold text-stone-800"> Skynet</span>
            </h1>
            <p className="text-[10px] text-stone-400 uppercase tracking-[0.15em]">Agent Command Board</p>
          </div>
        </div>

        <StatsBar tasks={tasks} />
      </header>

      {/* 필터 바 */}
      <FilterBar
        workspaces={workspaces}
        projects={projects}
        selectedWorkspace={selectedWorkspace}
        selectedProject={selectedProject}
        selectedRole={selectedRole}
        autoApprove={autoApprove}
        onWorkspaceChange={handleWorkspaceChange}
        onProjectChange={handleProjectChange}
        onRoleChange={handleRoleChange}
        onAutoApproveChange={handleAutoApproveChange}
        onCreateWorkspace={handleCreateWorkspace}
        onCreateProject={handleCreateProject}
      />

      {/* 칸반 보드 */}
      <main className="flex min-h-0 flex-1 overflow-hidden">
        <KanbanBoard tasks={tasks} onTaskClick={handleTaskClick} />
      </main>

      {/* 푸터 */}
      <footer className="border-t border-stone-200 bg-white/50 px-5 py-2">
        <p className="text-center text-xs text-stone-400">
          &copy; 2026 Kanban-Skynet. Built by Coulson. All rights reserved.
        </p>
      </footer>

      {/* 태스크 상세 모달 */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          comments={taskComments}
          dependencies={taskDependencies}
          dependents={taskDependents}
          allTasks={tasks}
          onClose={handleCloseModal}
        />
      )}

    </div>
  );
}
