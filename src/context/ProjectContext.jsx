import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getProject } from '../data/projects.js';
import { listEntries } from '../data/entries.js';
import { listHours } from '../data/hours.js';
import {
  EVENTO_FILA,
  EVENTO_SINCRONIZADO,
  ehErroDeRede,
  estaOffline,
  guardarCache,
  lerCache,
  pendentes
} from '../lib/offline.js';

export const ProjectContext = createContext(null);

/** Junta os lançamentos ainda na fila (sem internet) com os do servidor, mais recentes primeiro. */
function comPendentes(lista, projectId, tabela) {
  const fila = pendentes(projectId, tabela);
  if (fila.length === 0) return lista;
  return [...fila, ...lista].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export function ProjectProvider({ projectId, children }) {
  const [project, setProject] = useState(null);
  const [serverEntries, setServerEntries] = useState([]);
  const [serverHours, setServerHours] = useState([]);
  const [filaVersao, setFilaVersao] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // data/hora da cópia guardada quando a tela está mostrando dados sem internet
  const [offlineDesde, setOfflineDesde] = useState(null);

  const reload = useCallback(async () => {
    setError('');
    // sem sinal: usa a cópia salva na hora, sem esperar as tentativas de rede
    const cacheRapido = estaOffline() ? lerCache(`projeto:${projectId}`) : null;
    if (cacheRapido) {
      setProject(cacheRapido.dados.project);
      setServerEntries(cacheRapido.dados.entries);
      setServerHours(cacheRapido.dados.hours);
      setOfflineDesde(cacheRapido.em);
      setLoading(false);
      return;
    }
    try {
      const [p, e, h] = await Promise.all([getProject(projectId), listEntries(projectId), listHours(projectId)]);
      setProject(p);
      setServerEntries(e);
      setServerHours(h);
      setOfflineDesde(null);
      guardarCache(`projeto:${projectId}`, { project: p, entries: e, hours: h });
    } catch (err) {
      const cache = ehErroDeRede(err) ? lerCache(`projeto:${projectId}`) : null;
      if (cache) {
        setProject(cache.dados.project);
        setServerEntries(cache.dados.entries);
        setServerHours(cache.dados.hours);
        setOfflineDesde(cache.em);
      } else {
        setError(
          ehErroDeRede(err)
            ? 'Sem internet e este projeto ainda não foi aberto neste aparelho. Abra-o uma vez com sinal pra ficar disponível offline.'
            : err.message
        );
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    setLoading(true);
    reload();
  }, [reload]);

  // fila mudou (lançou/descartou offline) -> remonta a lista; enviou pro servidor -> recarrega de verdade
  useEffect(() => {
    const onFila = () => setFilaVersao((v) => v + 1);
    const onSync = () => reload();
    window.addEventListener(EVENTO_FILA, onFila);
    window.addEventListener(EVENTO_SINCRONIZADO, onSync);
    window.addEventListener('online', onSync);
    return () => {
      window.removeEventListener(EVENTO_FILA, onFila);
      window.removeEventListener(EVENTO_SINCRONIZADO, onSync);
      window.removeEventListener('online', onSync);
    };
  }, [reload]);

  // filaVersao força recalcular a mistura com a fila
  const entries = React.useMemo(
    () => comPendentes(serverEntries, projectId, 'entries'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [serverEntries, projectId, filaVersao]
  );
  const hours = React.useMemo(
    () => comPendentes(serverHours, projectId, 'hours'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [serverHours, projectId, filaVersao]
  );

  const value = {
    project,
    entries,
    hours,
    loading,
    error,
    offlineDesde,
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
