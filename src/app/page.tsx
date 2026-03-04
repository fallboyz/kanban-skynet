'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Comment, DependencyInfo, Project, Task, Workspace, WsEvent } from '@/types';
import * as api from '@/lib/api';
import { DONE_PAGE_SIZE, DONE_SEARCH_DEBOUNCE_MS } from '@/lib/constants';
import { useWebSocket } from '@/hooks/useWebSocket';
import { StatsBar } from '@/components/StatsBar';
import { FilterBar } from '@/components/FilterBar';
import { KanbanBoard } from '@/components/KanbanBoard';
import { TaskDetailModal } from '@/components/TaskDetailModal';

// Relative time refresh interval (60s)
const RELATIVE_TIME_REFRESH_MS = 60_000;

export default function HomePage() {
  // 데이터 상태 (ready + in_progress + review — done 제외)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  // Done 상태 (서버 페이지네이션)
  const [doneTasks, setDoneTasks] = useState<Task[]>([]);
  const [doneTotal, setDoneTotal] = useState(0);         // 검색 결과 수 (페이지네이션용)
  const [doneTotalAll, setDoneTotalAll] = useState(0);   // 전체 done 수 (StatsBar용)
  const [donePage, setDonePage] = useState(1);
  const [doneSearch, setDoneSearch] = useState('');

  // 필터 상태
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>('');
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<string>('');

  // 설정 상태
  const [autoApprove, setAutoApprove] = useState<boolean>(true);

  // 모달 상태
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskComments, setTaskComments] = useState<Comment[]>([]);
  const [taskDependencies, setTaskDependencies] = useState<DependencyInfo[]>([]);
  const [taskDependents, setTaskDependents] = useState<DependencyInfo[]>([]);

  // 상대시간 갱신용 tick
  const [, setTick] = useState(0);

  // 현재 필터 상태를 ref로 유지 (WebSocket 콜백에서 재연결 없이 참조)
  const selectedProjectRef = useRef(selectedProject);
  selectedProjectRef.current = selectedProject;
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const donePageRef = useRef(donePage);
  donePageRef.current = donePage;
  const doneSearchRef = useRef(doneSearch);
  doneSearchRef.current = doneSearch;
  const selectedRoleRef = useRef(selectedRole);
  selectedRoleRef.current = selectedRole;

  // AbortController for API requests
  const taskAbortRef = useRef<AbortController | null>(null);
  const doneAbortRef = useRef<AbortController | null>(null);

  // Debounce timer for done search
  const doneSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Done 태스크 재로드
  const reloadDoneTasks = useCallback((page?: number, search?: string) => {
    doneAbortRef.current?.abort();
    const controller = new AbortController();
    doneAbortRef.current = controller;

    const currentProject = selectedProjectRef.current;
    const currentProjects = projectsRef.current;
    const p = page ?? donePageRef.current;
    const s = search ?? doneSearchRef.current;
    const r = selectedRoleRef.current || undefined;

    const opts = { page: p, page_size: DONE_PAGE_SIZE, search: s || undefined, role: r };
    let fetchDone: Promise<api.DoneTasksResponse>;
    if (currentProject) {
      fetchDone = api.getDoneTasks(currentProject, opts);
    } else if (currentProjects.length > 0) {
      fetchDone = api.getAllDoneTasks(currentProjects.map((pr) => pr.id), opts);
    } else {
      fetchDone = Promise.resolve({ tasks: [], total: 0, total_all: 0, page: 1, page_size: DONE_PAGE_SIZE });
    }

    fetchDone
      .then((res) => {
        if (controller.signal.aborted) return;
        setDoneTasks(res.tasks);
        setDoneTotal(res.total);
        setDoneTotalAll(res.total_all);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error(err);
      });
  }, []);

  // 태스크 데이터 재로드 (AbortController 적용) — done 제외, role 필터 없음 (프론트에서 필터링)
  const reloadTasks = useCallback(() => {
    // Cancel any in-flight request
    taskAbortRef.current?.abort();
    const controller = new AbortController();
    taskAbortRef.current = controller;

    const currentProject = selectedProjectRef.current;
    const currentProjects = projectsRef.current;

    if (!currentProject) {
      if (currentProjects.length === 0) return;
      Promise.all(
        currentProjects.map((p) => api.getTasks(p.id)),
      )
        .then((results) => {
          if (controller.signal.aborted) return;
          setTasks(results.flat().filter((t) => t.status !== 'done'));
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          console.error(err);
        });
    } else {
      api
        .getTasks(currentProject)
        .then((data) => {
          if (controller.signal.aborted) return;
          setTasks(data.filter((t) => t.status !== 'done'));
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          console.error(err);
        });
    }
  }, []);

  // 전체 데이터 재로드 (non-done + done)
  const reloadAll = useCallback(() => {
    reloadTasks();
    reloadDoneTasks();
  }, [reloadTasks, reloadDoneTasks]);

  // WebSocket 이벤트 핸들러
  const handleWsEvent = useCallback((event: WsEvent) => {
    if (event.type === 'task:created') {
      const currentProject = selectedProjectRef.current;
      const currentProjects = projectsRef.current;
      const projectIds = currentProject
        ? new Set([currentProject])
        : new Set(currentProjects.map((p) => p.id));
      if (!projectIds.has(event.payload.project_id)) return;

      if (event.payload.status === 'done') {
        // New task created as done (uncommon) — reload done page
        reloadDoneTasks();
      } else {
        setTasks((prev) => {
          if (prev.some((t) => t.id === event.payload.id)) return prev;
          return [...prev, event.payload];
        });
      }
    } else if (event.type === 'task:updated') {
      const payload = event.payload;

      if (payload.status === 'done') {
        // Task transitioned to done — remove from non-done tasks, reload done page
        setTasks((prev) => prev.filter((t) => t.id !== payload.id));
        reloadDoneTasks();
      } else {
        // Non-done update — update in tasks list
        setTasks((prev) => {
          const exists = prev.some((t) => t.id === payload.id);
          if (exists) {
            return prev.map((t) => (t.id === payload.id ? payload : t));
          }
          // Defensive: task not in non-done list yet (e.g. was done, now undone)
          return [...prev, payload];
        });
      }

      setSelectedTask((prev) =>
        prev?.id === payload.id ? payload : prev,
      );
    } else if (event.type === 'comment:added') {
      setTaskComments((prev) => {
        if (!prev.some((c) => c.id === event.payload.id)) {
          return [...prev, event.payload];
        }
        return prev;
      });
    }
    // dependency:added / dependency:removed are handled by task detail reload
  }, [reloadDoneTasks]);

  useWebSocket(handleWsEvent, reloadAll);

  // 상대시간 갱신 타이머
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), RELATIVE_TIME_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  // Page Visibility API: 탭 복귀 시 데이터 재로드
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        reloadAll();
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [reloadAll]);

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
          setTasks([]);
          setDoneTasks([]);
          setDoneTotal(0);
          setDoneTotalAll(0);
          setDonePage(1);
          setDoneSearch('');
        })
        .catch(console.error);
    } else {
      if (workspaces.length === 0) {
        setProjects([]);
        setTasks([]);
        setDoneTasks([]);
        setDoneTotal(0);
        setDoneTotalAll(0);
        return;
      }
      Promise.all(workspaces.map((ws) => api.getProjects(ws.id)))
        .then((results) => {
          setProjects(results.flat());
          setSelectedProject('');
          setTasks([]);
          setDoneTasks([]);
          setDoneTotal(0);
          setDoneTotalAll(0);
          setDonePage(1);
          setDoneSearch('');
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

  // 프로젝트 변경 시 태스크 로드 (non-done) — role 필터는 프론트에서 처리
  useEffect(() => {
    if (!selectedProject && projects.length === 0) {
      setTasks([]);
      return;
    }
    reloadTasks();
  }, [selectedProject, projects, reloadTasks]);

  // 프로젝트 변경 시 Done 초기화 + 로드
  useEffect(() => {
    setDonePage(1);
    setDoneSearch('');
    if (!selectedProject && projects.length === 0) {
      setDoneTasks([]);
      setDoneTotal(0);
      setDoneTotalAll(0);
      return;
    }
    reloadDoneTasks(1, '');
  }, [selectedProject, projects, reloadDoneTasks]);

  // Done 페이지 변경 시 재로드
  function handleDonePageChange(page: number) {
    setDonePage(page);
    reloadDoneTasks(page);
  }

  // Done 검색 변경 (debounce 적용)
  function handleDoneSearchChange(search: string) {
    setDoneSearch(search);
    if (doneSearchTimerRef.current) clearTimeout(doneSearchTimerRef.current);
    doneSearchTimerRef.current = setTimeout(() => {
      setDonePage(1);
      reloadDoneTasks(1, search);
    }, DONE_SEARCH_DEBOUNCE_MS);
  }

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
    // Role 변경 시 Done 페이지 초기화 + 재로드 (서버에서 role 필터 적용)
    setDonePage(1);
    // ref는 다음 렌더 전에 갱신되지 않으므로 직접 ref 업데이트 후 재로드
    selectedRoleRef.current = role;
    reloadDoneTasks(1);
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

  // Role 필터는 프론트에서 적용 (StatsBar는 전체, 칸반 보드는 필터된 결과)
  const filteredTasks = selectedRole
    ? tasks.filter((t) => t.role === selectedRole)
    : tasks;

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

        <StatsBar tasks={tasks} doneTotal={doneTotalAll} />
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
        <KanbanBoard
          tasks={filteredTasks}
          doneTasks={doneTasks}
          doneTotal={doneTotal}
          donePage={donePage}
          donePageSize={DONE_PAGE_SIZE}
          doneSearch={doneSearch}
          onDonePageChange={handleDonePageChange}
          onDoneSearchChange={handleDoneSearchChange}
          onTaskClick={handleTaskClick}
        />
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
          onClose={handleCloseModal}
        />
      )}

    </div>
  );
}
