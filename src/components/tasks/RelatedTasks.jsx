import { useState } from 'react';
import TaskRow from './TaskRow';
import TaskModal from './TaskModal';

// Compact "open tasks for this entity" block + Add Task button. Used inside
// ClientCard and Database's ContactDetailModal — deliberately small (per
// Sprint 2's "don't make the UI huge" constraint), not a full task manager.
export default function RelatedTasks({ taskApi, relatedType, relatedId, relatedName, source, maxVisible = 3, excludeTaskIds = [], allowAdd = true }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  if (!taskApi) return null;

  const excluded = new Set(excludeTaskIds);
  const openTasks = taskApi.getRelatedTasks(relatedType, relatedId).filter(t => !excluded.has(t.id));
  const visible = openTasks.slice(0, maxVisible);
  const hiddenCount = openTasks.length - visible.length;

  return (
    <div className="mt-2 pt-2 border-t border-slate-700/60">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Tasks{openTasks.length > 0 ? ` (${openTasks.length})` : ''}
        </p>
        {allowAdd && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowAdd(true); }}
            className="text-xs font-semibold text-slate-400 hover:text-amber-400 border border-slate-700 hover:border-amber-500/40 rounded-lg px-2 py-0.5 transition-all"
          >
            + Task
          </button>
        )}
      </div>

      {visible.length > 0 && (
        <div className="space-y-1">
          {visible.map(t => (
            <TaskRow key={t.id} task={t} onComplete={taskApi.completeTask} onEdit={setEditingTask} compact />
          ))}
          {hiddenCount > 0 && (
            <p className="text-xs text-slate-600 text-center pt-0.5">+{hiddenCount} more</p>
          )}
        </div>
      )}

      {taskApi.migrationNeeded && (
        <p className="text-xs text-red-400/80 mt-1">
          Task table needs a one-time SQL migration — see sql/tasks_table_migration.sql.
        </p>
      )}

      {showAdd && (
        <TaskModal
          context={{ relatedType, relatedId, relatedName, source }}
          onSave={taskApi.createTask}
          onClose={() => setShowAdd(false)}
        />
      )}

      {editingTask && (
        <TaskModal
          context={{ relatedType, relatedId, relatedName, source }}
          defaults={{
            title: editingTask.title,
            taskType: editingTask.taskType,
            priority: editingTask.priority,
            dueDate: editingTask.dueDate ?? undefined,
            description: editingTask.description,
          }}
          heading="Edit Task"
          saveLabel="Save Changes"
          onSave={(fields) => taskApi.updateTask(editingTask.id, fields)}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}
