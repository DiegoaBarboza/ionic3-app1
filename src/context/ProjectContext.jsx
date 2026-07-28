import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getProject } from '../data/projects.js';
import { listEntries } from '../data/entries.js';
import { listHours } from '../data/hours.js';

export const ProjectContext = createContext(null);

export function ProjectProvider({ projectId, children }) {
  const [project, setProject] = useState(null);
  const [entries, setEntries] = useState([]);
  const [hours, setHours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setError('');
    try {
      const [p, e, h] = await Promise.all([getProject(projectId), listEntries(projectId), listHours(projectId)]);
      setProject(p);
      setEntries(e);
      setHours(h);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    setLoading(true);
    reload();
  }, [reload]);

  const value = {
    project,
    entries,
    hours,
    loading,
    error,
    reloadProject: reload,
    setProject
  };

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject deve ser usado dentro de ProjectProvider');
  return ctx;
}
