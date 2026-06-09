import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export const VAULT_CATEGORIES = [
  { key: 'package',   label: 'Package',         icon: '📦' },
  { key: 'financial', label: 'Financial Model', icon: '📊' },
  { key: 'photos',    label: 'Photos',          icon: '📸' },
  { key: 'reports',   label: 'Reports',         icon: '📄' },
  { key: 'other',     label: 'Other',           icon: '📁' },
];

const BUCKET = 'vault';

export function useVault() {
  const [projects, setProjects] = useState([]);
  const [files, setFiles] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [p, f] = await Promise.all([
      supabase.from('vault_projects').select('*').order('created_at', { ascending: false }),
      supabase.from('vault_files').select('*').order('created_at', { ascending: true }),
    ]);
    if (!p.error && p.data) setProjects(p.data);
    if (!f.error && f.data) setFiles(f.data);
    setLoaded(true);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addProject = useCallback(async ({ type, name, linked }) => {
    const row = {
      type, name,
      linked_table: linked?.table ?? null,
      linked_id: linked?.id ?? null,
      linked_name: linked?.name ?? null,
    };
    const { data, error } = await supabase.from('vault_projects').insert([row]).select().single();
    if (!error && data) { setProjects(prev => [data, ...prev]); return data; }
    return null;
  }, []);

  const deleteProject = useCallback(async (id) => {
    const projFiles = files.filter(f => f.project_id === id);
    if (projFiles.length) await supabase.storage.from(BUCKET).remove(projFiles.map(f => f.path));
    await supabase.from('vault_files').delete().eq('project_id', id);
    await supabase.from('vault_projects').delete().eq('id', id);
    setProjects(prev => prev.filter(p => p.id !== id));
    setFiles(prev => prev.filter(f => f.project_id !== id));
  }, [files]);

  const linkProject = useCallback(async (id, linked) => {
    const patch = {
      linked_table: linked?.table ?? null,
      linked_id: linked?.id ?? null,
      linked_name: linked?.name ?? null,
    };
    await supabase.from('vault_projects').update(patch).eq('id', id);
    setProjects(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
  }, []);

  const uploadFile = useCallback(async (projectId, category, file) => {
    const safe = file.name.replace(/[^\w.\-]+/g, '_');
    const path = `${projectId}/${category}/${Date.now()}_${safe}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream' });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const row = { project_id: projectId, category, name: file.name, path, url: pub.publicUrl, size_bytes: file.size, mime: file.type };
    const { data, error } = await supabase.from('vault_files').insert([row]).select().single();
    if (error) throw error;
    setFiles(prev => [...prev, data]);
    return data;
  }, []);

  const deleteFile = useCallback(async (fileRow) => {
    await supabase.storage.from(BUCKET).remove([fileRow.path]);
    await supabase.from('vault_files').delete().eq('id', fileRow.id);
    setFiles(prev => prev.filter(f => f.id !== fileRow.id));
  }, []);

  return { projects, files, loaded, addProject, deleteProject, linkProject, uploadFile, deleteFile };
}
