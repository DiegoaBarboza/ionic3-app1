import { useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import Logo from './Logo.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { ProjectProvider, useProject } from '../context/ProjectContext.jsx';
import { downloadProjectBackup, readBackupFile } from '../lib/backup.js';
import { overwriteProjectFromBackup } from '../data/projects.js';
import { listStages } from '../data/stages.js';
import { listStageTeam } from '../data/pessoas.js';
import { listEncomendas } from '../data/encomendas.js';
import { listPecas } from '../data/pecas.js';

const BASE_TABS = [
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
  const [backingUp, setBackingUp] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const tabs =
    project?.tipo_projeto === 'servico'
      ? [BASE_TABS[0], { to: 'projeto', label: 'Projeto' }, ...BASE_TABS.slice(1)]
      : project?.tipo_projeto === 'maquina'
        ? [BASE_TABS[0], { to: 'construcao', label: 'Construção' }, ...BASE_TABS.slice(1)]
        : BASE_TABS;

  async function handleBackupDownload() {
    setBackingUp(true);
    setRestoreError('');
    try {
      let extra = {};
      if (project.tipo_projeto === 'maquina') {
        const [stages, stageTeam, encomendas, pecas] = await Promise.all([
          listStages(project.id),
          listStageTeam(project.id),
          listEncomendas(project.id),
          listPecas(project.id)
        ]);
        extra = { stages, stageTeam, encomendas, pecas };
      }
      downloadProjectBackup(project, entries, hours, extra);
    } catch (err) {
      setRestoreError('Não foi possível gerar o backup: ' + err.message);
    } finally {
      setBackingUp(false);
    }
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
            <button className="ghost icon-btn" onClick={() => navigate('/')} title="Voltar para projetos">
              ←
            </button>
            <span className="project-name">{project ? project.name : loading ? 'Carregando…' : ''}</span>
          </div>
          <div className="topbar-right">
            <Logo withText={false} height={28} />
            {project && (
              <div className="menu-wrap">
                <button className="ghost icon-btn" onClick={() => setMenuOpen((v) => !v)} title="Mais opções">
                  ⋮
                </button>
                {menuOpen && (
                  <>
                    <div className="menu-overlay" onClick={() => setMenuOpen(false)} />
                    <div className="menu-dropdown">
                      <button
                        className="menu-item"
                        onClick={() => {
                          setMenuOpen(false);
                          handleBackupDownload();
                        }}
                        disabled={backingUp}
                      >
                        {backingUp ? 'Gerando backup…' : '⬇️ Backup do projeto'}
                      </button>
                      <button
                        className="menu-item"
                        onClick={() => {
                          fileInputRef.current?.click();
                          setMenuOpen(false);
                        }}
                        disabled={restoring}
                      >
                        {restoring ? 'Restaurando…' : '⬆️ Restaurar backup'}
                      </button>
                      <button
                        className="menu-item danger"
                        onClick={() => {
                          setMenuOpen(false);
                          signOut();
                        }}
                      >
                        Sair
                      </button>
                    </div>
                  </>
                )}
                <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={handleRestoreFile} />
              </div>
            )}
          </div>
        </div>
        <div className="tabbar">
          {tabs.map((tab) => (
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
