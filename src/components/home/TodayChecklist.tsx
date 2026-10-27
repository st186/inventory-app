// "Today's checklist" (design review d3): the day's jobs in due-time order, each with Due / Late /
// Done / Later, and the finished ones folded into "Done today (n)".
import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Check } from 'lucide-react';
import { ListGroup, ListRow } from '../ui/list-row';
import { StatusChip } from '../ui/status-chip';
import { SkeletonListRows } from '../ui/skeleton';
import { useT } from '../../utils/i18n';

export type TaskStatus = 'due' | 'late' | 'done' | 'later' | 'none';

export type ChecklistTask = {
  key: string;
  icon: LucideIcon;
  title: string;
  meta?: string;
  status: TaskStatus;
  /** A count to show instead of a status word (e.g. timesheets waiting). */
  count?: number;
  /** IST minutes since midnight the job is due by - decides the order. */
  due: number;
  onOpen?: () => void;
};

const ORDER: Record<TaskStatus, number> = { late: 0, due: 1, none: 2, later: 3, done: 4 };

function TaskRow({ task }: { task: ChecklistTask }) {
  const trailing = task.status === 'done'
    ? <StatusChip status="task.done" />
    : task.count && task.count > 0
      ? <StatusChip tone={task.status === 'late' ? 'danger' : 'neutral'}><span className="num">{task.count}</span></StatusChip>
      : task.status === 'due' ? <StatusChip status="task.due" />
        : task.status === 'late' ? <StatusChip status="task.late" />
          : task.status === 'later' ? <StatusChip status="task.later" /> : undefined;
  return (
    <ListRow
      icon={task.status === 'done' ? Check : task.icon}
      iconTone={task.status === 'done' ? 'success' : task.status === 'late' ? 'danger' : 'neutral'}
      title={task.title}
      subtitle={task.meta}
      trailing={trailing}
      chevron={task.onOpen ? true : false}
      onClick={task.onOpen}
      muted={task.status === 'done'}
    />
  );
}

export function TodayChecklist({ title, tasks, loading }: { title?: string; tasks: ChecklistTask[]; loading?: boolean }) {
  const { t } = useT();
  const [showDone, setShowDone] = useState(false);
  const open = tasks.filter((x) => x.status !== 'done').sort((a, b) => a.due - b.due || ORDER[a.status] - ORDER[b.status]);
  const done = tasks.filter((x) => x.status === 'done').sort((a, b) => a.due - b.due);
  if (!loading && tasks.length === 0) return null;
  return (
    <ListGroup
      title={title ?? t('home.checklist')}
      meta={!loading && tasks.length > 0 ? t('home.progress', { done: done.length, total: tasks.length }) : undefined}
    >
      {loading && tasks.length === 0 ? <SkeletonListRows count={3} /> : null}
      {open.map((task) => <TaskRow key={task.key} task={task} />)}
      {done.length > 0 && (
        <ListRow
          icon={Check}
          iconTone="success"
          muted
          title={t('home.doneToday', { n: done.length })}
          subtitle={showDone ? undefined : done.map((d) => d.title).join(' · ')}
          chevron="down"
          aria-expanded={showDone}
          onClick={() => setShowDone((v) => !v)}
          className={showDone ? '[&>svg:last-child]:rotate-180' : undefined}
        />
      )}
      {showDone && done.map((task) => <TaskRow key={task.key} task={task} />)}
    </ListGroup>
  );
}
