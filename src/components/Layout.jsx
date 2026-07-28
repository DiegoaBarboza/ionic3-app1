import { useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import Logo from './Logo.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { ProjectProvider, useProject } from '../context/ProjectContext.jsx';
import { downloadProjectBackup, readBackupFile } from '../lib/backup.js';
import { overwriteProjectFromBackup } from '../data/projects.js';

const TABS = [
  { to: 'dashboard', label: 'Dashboard' },
  { to: 'lancamentos', label: 'Lançamentos' },
  { to: 'horas', label: 'Horas' },
  { to: 'relatorios', label: 'Relatórios' }
];

function LayoutInner() {
  const { project, entries, hours, loading, error, reloadProject } = useProject();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState('');

  function handleBackupDownload() {
    downloadProjectBackup(project, entries, hours);
  }

  async function handleRestoreFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!confirm('Isso vai substituir todos os lançamentos e horas deste projeto pelos dados do arquivo. Continuar?')) {
      return;
    }
    setRestoring(true);
    setRestoreError('');
    try {
      const backup = await readBackupFile(file);
      await overwriteProjectFromBackup(project.id, backup);
      await reloadProject();
    } catch (err) {
      setRestoreError('Não foi possível restaurar o backup: ' + err.message);
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="main-area">
        <div className="topbar">
          <div className="topbar-left">
            <button className="ghost" onClick={() => navigate('/')} title="Voltar para projetos">
              ← Projetos
            </button>
            <span className="project-name">{project ? project.name : loading ? 'Carregando…' : ''}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {project && (
              <>
                <button className="ghost" onClick={handleBackupDownload} title="Baixar backup deste projeto (.json)">
                  ⬇️ Backup
                </button>
                <button
                  className="ghost"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={restoring}
                  title="Restaurar backup sobre este projeto"
                >
                  {restoring ? 'Restaurando…' : '⬆️ Restaurar'}
                </button>
                <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={handleRestoreFile} />
              </>
            )}
            <Logo withText={false} height={30} />
            <button className="ghost" onClick={signOut}>
              Sair
            </button>
          </div>
        </div>
        <div className="tabbar">
          {TABS.map((tab) => (
            <NavLink key={tab.to} to={tab.to} className={({ isActive }) => 'tab-link' + (isActive ? ' active' : '')}>
              {tab.label}
            </NavLink>
          ))}
        </div>
        <div className="content">
          {restoreError && <p className="error-text">{restoreError}</p>}
          {error && <p className="error-text">Erro ao carregar projeto: {error}</p>}
          {!error && loading && <p className="muted">Carregando dados do projeto…</p>}
          {!error && !loading && project && <Outlet />}
        </div>
      </div>
    </div>
  );
}

export default function Layout() {
  const { projectId } = useParams();
  return (
    <ProjectProvider projectId={projectId}>
      <LayoutInner />
    </ProjectProvider>
  );
}
