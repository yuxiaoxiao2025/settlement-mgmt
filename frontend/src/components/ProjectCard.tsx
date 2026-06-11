/**
 * 项目卡片。
 *
 * 在 ProjectList 中作为单个项目的展示单元：
 *  - 左侧：项目名 + 移交/接收方信息
 *  - 中部：进度环 (X/25 已确认)
 *  - 右侧：截止倒计时 + 「查看」按钮 + 删除按钮
 *
 * 高亮规则（SPEC §7.2 + §剧本4）：
 *  - 截止日期 ≤ 3 天 → 红框 + 浅红底
 *  - 已逾期（days_to_deadline < 0） → 灰框 + 浅灰底（不再红色，避免误以为「重要」）
 *  - 正常 → 绿框（柔和）+ 白底
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Trash2 } from 'lucide-react';
import type { Project } from '../types';
import { ProgressRing } from './ProgressRing';
import { DeadlineCountdown } from './DeadlineCountdown';
import { ConfirmModal } from './ConfirmModal';

export interface ProjectCardProps {
  project: Project;
  onClick?: (project: Project) => void;
  onDelete?: (project: Project) => void | Promise<void>;
}

export function ProjectCard({ project, onClick, onDelete }: ProjectCardProps) {
  const days = project.days_to_deadline;

  // 边框/背景档位
  let borderClass: string;
  let bgClass: string;
  if (days < 0) {
    borderClass = 'border-gray-300';
    bgClass = 'bg-gray-50';
  } else if (days <= 3) {
    borderClass = 'border-red-400 ring-1 ring-red-200';
    bgClass = 'bg-red-50/40';
  } else {
    borderClass = 'border-green-200';
    bgClass = 'bg-white';
  }

  const isArchived = project.status === 'archived';
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirming(true);
  };

  const handleConfirm = async () => {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete(project);
      setConfirming(false);
    } catch (err) {
      setDeleting(false);
      throw err;
    }
  };

  return (
    <>
      <div
        className={clsx(
          'group relative rounded-lg border p-4 transition-shadow',
          'hover:shadow-md',
          borderClass,
          bgClass,
          isArchived && 'opacity-60',
        )}
      >
        <Link
          to={`/projects/${project.id}`}
          onClick={() => onClick?.(project)}
          className="block focus:outline-none focus:ring-2 focus:ring-blue-400"
          aria-label={`打开项目 ${project.name}`}
        >
          <div className="flex items-start gap-4">
            {/* 进度环 */}
            <ProgressRing
              progress={project.progress.confirmed}
              total={project.progress.total}
              size={56}
            />

            {/* 主信息 */}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <h3 className="truncate text-base font-semibold text-gray-900 group-hover:text-blue-600">
                  {project.name}
                </h3>
                {isArchived && (
                  <span className="shrink-0 rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                    已归档
                  </span>
                )}
              </div>

              {/* 元信息 */}
              <dl className="mt-1 grid grid-cols-1 gap-x-3 gap-y-0.5 text-xs text-gray-500 sm:grid-cols-2">
                {project.construction_unit && (
                  <div className="truncate">
                    <dt className="sr-only">建设单位</dt>
                    <dd>建设：{project.construction_unit}</dd>
                  </div>
                )}
                {project.receiving_unit && (
                  <div className="truncate">
                    <dt className="sr-only">接收单位</dt>
                    <dd>接收：{project.receiving_unit}</dd>
                  </div>
                )}
              </dl>

              {/* 状态计数 */}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
                <span>
                  已确认{' '}
                  <span className="font-semibold text-green-600">
                    {project.progress.confirmed}
                  </span>
                  /{project.progress.total}
                </span>
                {project.progress.uploaded > 0 && (
                  <span>
                    待复核{' '}
                    <span className="font-medium text-blue-600">
                      {project.progress.uploaded}
                    </span>
                  </span>
                )}
                {project.progress.rejected > 0 && (
                  <span>
                    已驳回{' '}
                    <span className="font-medium text-red-600">
                      {project.progress.rejected}
                    </span>
                  </span>
                )}
                {project.progress.pending > 0 && (
                  <span>
                    未开始{' '}
                    <span className="text-gray-500">{project.progress.pending}</span>
                  </span>
                )}
              </div>
            </div>

            {/* 右侧倒计时 */}
            <div className="shrink-0">
              <DeadlineCountdown daysToDeadline={days} />
            </div>
          </div>
        </Link>

        {/* 删除按钮（卡片右上角，hover 才显示） */}
        {onDelete && (
          <button
            type="button"
            onClick={handleDeleteClick}
            disabled={deleting}
            className="absolute right-2 top-2 rounded p-1.5 text-gray-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 focus:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`删除项目 ${project.name}`}
            title="删除项目"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {confirming && (
        <ConfirmModal
          title={`删除项目「${project.name}」？`}
          description={
            '此操作不可撤销：项目记录、所有资料项、所有上传的文件、以及已生成的结算书 PDF 将被永久删除。'
          }
          confirmLabel="永久删除"
          matchKeyword={project.name}
          tone="danger"
          loading={deleting}
          onClose={() => !deleting && setConfirming(false)}
          onConfirm={handleConfirm}
        />
      )}
    </>
  );
}

