import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';

// Universal Task / Next-Action engine (Sprint 2). Single `tasks` table,
// shared by the Dashboard, Clients, Database, and Pipeline. See
// sql/tasks_table_migration.sql for the schema this hook expects — if that
// migration hasn't been run yet, writes fail gracefully (see `migrationNeeded`)
// instead of crashing the app.

const todayStr = () => new Date().toISOString().slice(0, 10);

// Postgres/PostgREST error signature for "column doesn't exist" — the exact
// symptom of the SQL migration not having been run yet. PostgREST returns its
// own PGRST204 ("schema cache") code for this rather than the raw Postgres
// 42703, so both are checked (verified against the actual error shape live).
function isMissingColumnError(error) {
  if (!error) return false;
  if (error.code === '42703' || error.code === 'PGRST204') return true;
  return /column .* does not exist|could not find .* column/i.test(error.message ?? '');
}

// DB row (snake_case, may be pre- or post-migration shape) → app camelCase
function dbToTask(row) {
  return {
    id: row.id,
    title: row.title ?? row.text ?? 'Untitled task',
    description: row.description ?? '',
    status: row.status ?? (row.done ? 'completed' : 'open'),
    priority: row.priority ?? 'normal',
    dueDate: row.due_date ?? null,
    completedAt: row.completed_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
    relatedType: row.related_type ?? 'general',
    relatedId: row.related_id ?? null,
    relatedName: row.related_name ?? '',
    source: row.source ?? 'dashboard',
    taskType: row.task_type ?? 'general',
  };
}

export function useTasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [migrationNeeded, setMigrationNeeded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.from('tasks').select('*').order('created_at', { ascending: false }).then(({ data, error }) => {
      if (cancelled) return;
      if (!error && data) setTasks(data.map(dbToTask));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const createTask = useCallback(async (fields) => {
    const row = {
      title: (fields.title ?? '').trim() || 'Untitled task',
      description: fields.description ?? '',
      status: 'open',
      priority: fields.priority ?? 'normal',
      due_date: fields.dueDate || null,
      related_type: fields.relatedType ?? 'general',
      related_id: fields.relatedId ?? null,
      related_name: fields.relatedName ?? '',
      source: fields.source ?? 'dashboard',
      task_type: fields.taskType ?? 'general',
    };
    const { data, error } = await supabase.from('tasks').insert([row]).select().single();
    if (error) {
      if (isMissingColumnError(error)) { setMigrationNeeded(true); return { error: 'migration_needed' }; }
      return { error: error.message };
    }
    setTasks(prev => [dbToTask(data), ...prev]);
    return { task: dbToTask(data) };
  }, []);

  const updateTask = useCallback(async (id, fields) => {
    const db = { updated_at: new Date().toISOString() };
    if (fields.title !== undefined) db.title = fields.title;
    if (fields.description !== undefined) db.description = fields.description;
    if (fields.priority !== undefined) db.priority = fields.priority;
    if (fields.dueDate !== undefined) db.due_date = fields.dueDate || null;
    if (fields.status !== undefined) db.status = fields.status;
    if (fields.completedAt !== undefined) db.completed_at = fields.completedAt;
    if (fields.taskType !== undefined) db.task_type = fields.taskType;

    const { data, error } = await supabase.from('tasks').update(db).eq('id', id).select().single();
    if (error) {
      if (isMissingColumnError(error)) { setMigrationNeeded(true); return { error: 'migration_needed' }; }
      return { error: error.message };
    }
    setTasks(prev => prev.map(t => t.id === id ? dbToTask(data) : t));
    return { task: dbToTask(data) };
  }, []);

  const completeTask = useCallback((id) =>
    updateTask(id, { status: 'completed', completedAt: new Date().toISOString() }),
    [updateTask]);

  const reopenTask = useCallback((id) =>
    updateTask(id, { status: 'open', completedAt: null }),
    [updateTask]);

  const dismissTask = useCallback((id) =>
    updateTask(id, { status: 'dismissed', completedAt: new Date().toISOString() }),
    [updateTask]);

  const deleteTask = useCallback(async (id) => {
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (!error) setTasks(prev => prev.filter(t => t.id !== id));
  }, []);

  // Tasks tied to a specific client/contact/etc — used by ClientCard,
  // ContactDetailModal, and the Pipeline next-action indicator.
  const getRelatedTasks = useCallback((relatedType, relatedId, { includeCompleted = false } = {}) => {
    return tasks.filter(t =>
      t.relatedType === relatedType &&
      t.relatedId === relatedId &&
      (includeCompleted || t.status === 'open')
    );
  }, [tasks]);

  // Dashboard grouping — computed once per tasks change, not per render.
  const groups = useMemo(() => {
    const today = todayStr();
    const open = tasks.filter(t => t.status === 'open');
    const overdue = open.filter(t => t.dueDate && t.dueDate < today)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const dueToday = open.filter(t => t.dueDate === today);
    const upcoming = open.filter(t => t.dueDate && t.dueDate > today)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const noDueDate = open.filter(t => !t.dueDate);
    const completedToday = tasks.filter(t =>
      t.status === 'completed' && t.completedAt && t.completedAt.slice(0, 10) === today
    );
    return { overdue, dueToday, upcoming, noDueDate, completedToday };
  }, [tasks]);

  return {
    tasks, loading, migrationNeeded,
    createTask, updateTask, completeTask, reopenTask, dismissTask, deleteTask,
    getRelatedTasks, groups,
  };
}
