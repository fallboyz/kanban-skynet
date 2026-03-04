'use client';

import { useState } from 'react';
import type { Project, TaskRole, Workspace } from '@/types';

type RoleFilter = TaskRole | 'all';

const ROLES: { value: RoleFilter; label: string; activeClass: string; inactiveClass: string }[] = [
  { value: 'all', label: 'All', activeClass: 'bg-stone-700 text-white shadow-sm', inactiveClass: 'bg-stone-50 text-stone-500 border border-stone-200 hover:bg-stone-100' },
  { value: 'ARCHITECT', label: 'Architect', activeClass: 'bg-teal-500 text-white shadow-sm', inactiveClass: 'bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100' },
  { value: 'DATABASE', label: 'Database', activeClass: 'bg-emerald-500 text-white shadow-sm', inactiveClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100' },
  { value: 'BACKEND', label: 'Backend', activeClass: 'bg-blue-500 text-white shadow-sm', inactiveClass: 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100' },
  { value: 'FRONTEND', label: 'Frontend', activeClass: 'bg-violet-500 text-white shadow-sm', inactiveClass: 'bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100' },
  { value: 'SECURITY', label: 'Security', activeClass: 'bg-rose-500 text-white shadow-sm', inactiveClass: 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100' },
  { value: 'QA', label: 'QA', activeClass: 'bg-pink-500 text-white shadow-sm', inactiveClass: 'bg-pink-50 text-pink-700 border border-pink-200 hover:bg-pink-100' },
];

interface FilterBarProps {
  workspaces: Workspace[];
  projects: Project[];
  selectedWorkspace: string;
  selectedProject: string;
  selectedRole: string;
  autoApprove: boolean;
  onWorkspaceChange: (id: string) => void;
  onProjectChange: (id: string) => void;
  onRoleChange: (role: string) => void;
  onAutoApproveChange: (value: boolean) => void;
  onCreateWorkspace: (name: string) => Promise<void>;
  onCreateProject: (name: string) => Promise<void>;
}

const selectClasses =
  'cursor-pointer rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-sm text-stone-700 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-200';
const inputClasses =
  'rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-sm text-stone-700 placeholder:text-stone-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-200';
const addBtnClasses =
  'cursor-pointer flex h-7 w-7 items-center justify-center rounded-lg border border-stone-200 text-sm text-stone-400 transition-colors hover:border-stone-300 hover:text-stone-600 hover:bg-white';

export function FilterBar({
  workspaces,
  projects,
  selectedWorkspace,
  selectedProject,
  selectedRole,
  onWorkspaceChange,
  onProjectChange,
  onRoleChange,
  autoApprove,
  onAutoApproveChange,
  onCreateWorkspace,
  onCreateProject,
}: Readonly<FilterBarProps>) {
  const [showWsForm, setShowWsForm] = useState(false);
  const [showProjForm, setShowProjForm] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [newProjName, setNewProjName] = useState('');
  const [creating, setCreating] = useState(false);

  async function handleWsCreate() {
    if (!newWsName.trim() || creating) return;
    setCreating(true);
    try {
      await onCreateWorkspace(newWsName.trim());
      setNewWsName('');
      setShowWsForm(false);
    } finally {
      setCreating(false);
    }
  }

  async function handleProjCreate() {
    if (!newProjName.trim() || creating) return;
    setCreating(true);
    try {
      await onCreateProject(newProjName.trim());
      setNewProjName('');
      setShowProjForm(false);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-stone-200 bg-white/70 backdrop-blur-sm px-4 py-2.5">
      {/* Workspace */}
      <div className="flex items-center gap-2">
        <select
          value={selectedWorkspace}
          onChange={(e) => onWorkspaceChange(e.target.value)}
          className={selectClasses}
          aria-label="Workspace"
        >
          <option value="">All Workspaces</option>
          {workspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>
              {ws.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => { setShowWsForm(!showWsForm); setShowProjForm(false); }}
          className={addBtnClasses}
          title="Create Workspace"
        >
          +
        </button>
      </div>

      {/* Workspace 인라인 폼 */}
      {showWsForm && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newWsName}
            onChange={(e) => setNewWsName(e.target.value)}
            placeholder="Workspace name"
            className={inputClasses}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newWsName.trim()) handleWsCreate();
              if (e.key === 'Escape') { setShowWsForm(false); setNewWsName(''); }
            }}
            autoFocus
          />
          <button
            onClick={handleWsCreate}
            disabled={!newWsName.trim() || creating}
            className="cursor-pointer rounded-lg bg-orange-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50"
          >
            Create
          </button>
        </div>
      )}

      {/* Project */}
      <div className="flex items-center gap-2">
        <select
          value={selectedProject}
          onChange={(e) => onProjectChange(e.target.value)}
          className={selectClasses}
          aria-label="Project"
        >
          <option value="">All Projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => { setShowProjForm(!showProjForm); setShowWsForm(false); }}
          disabled={!selectedWorkspace}
          className={`${addBtnClasses} ${!selectedWorkspace ? 'opacity-30 cursor-not-allowed' : ''}`}
          title={selectedWorkspace ? 'Create Project' : 'Select a workspace first'}
        >
          +
        </button>
      </div>

      {/* Project 인라인 폼 */}
      {showProjForm && selectedWorkspace && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newProjName}
            onChange={(e) => setNewProjName(e.target.value)}
            placeholder="Project name"
            className={inputClasses}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newProjName.trim()) handleProjCreate();
              if (e.key === 'Escape') { setShowProjForm(false); setNewProjName(''); }
            }}
            autoFocus
          />
          <button
            onClick={handleProjCreate}
            disabled={!newProjName.trim() || creating}
            className="cursor-pointer rounded-lg bg-orange-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50"
          >
            Create
          </button>
        </div>
      )}

      {/* 구분선 */}
      <div className="h-5 w-px bg-stone-200" />

      {/* Role */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          {ROLES.map((role) => {
            const isActive =
              selectedRole === role.value ||
              (role.value === 'all' && !selectedRole);
            return (
              <button
                key={role.value}
                onClick={() =>
                  onRoleChange(role.value === 'all' ? '' : role.value)
                }
                className={`cursor-pointer rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                  isActive
                    ? role.activeClass
                    : role.inactiveClass
                }`}
              >
                {role.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Auto Approve 토글 */}
      {selectedProject && (
        <div className="flex items-center gap-2 ml-auto">
          <span className="group relative text-xs font-medium text-stone-400 whitespace-nowrap uppercase tracking-wider cursor-help">
            {"Auto Approve"}
            <span className="pointer-events-none absolute bottom-full right-0 mb-2 w-80 rounded-lg bg-stone-800 px-3 py-2 text-xs normal-case tracking-normal text-stone-200 opacity-0 transition-opacity group-hover:opacity-100 shadow-lg">
              ON: 오케스트레이터가 플랜 수립 후 서브 태스크를 즉시 생성
              <br />
              OFF: 플랜만 기록하고 사용자 승인 후 생성
              <span className="absolute top-full right-4 border-4 border-transparent border-t-stone-800" />
            </span>
          </span>
          <button
            onClick={() => onAutoApproveChange(!autoApprove)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              autoApprove ? 'bg-orange-500' : 'bg-stone-300'
            }`}
            role="switch"
            aria-checked={autoApprove ? 'true' : 'false'}
            aria-label="Toggle Auto Approve"
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                autoApprove ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
          <span className={`text-xs font-medium ${autoApprove ? 'text-orange-500' : 'text-stone-400'}`}>
            {autoApprove ? 'ON' : 'OFF'}
          </span>
        </div>
      )}
    </div>
  );
}
