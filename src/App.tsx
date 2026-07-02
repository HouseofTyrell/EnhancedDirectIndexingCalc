import { useState, useEffect } from 'react';
import { Calculator } from './Calculator';
import { QfafTestPage } from './pages/QfafTestPage';
import { WorkspaceTab } from './workspace/WorkspaceTab';
import { ThemeToggle } from './components/ThemeToggle';
import { ErrorBoundary } from './components/ErrorBoundary';
import { brandText, useBrandRevealed } from './branding';

type View = 'calculator' | 'workspace' | 'qfaf-test';

function getInitialView(): View {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');
  if (view === 'qfaf-test' || view === 'calculator' || view === 'workspace') {
    return view;
  }
  // Includes legacy ?view=edi-only links: the EDI-Only tab was retired
  // (D-014) — its analytics now live in the Workspace's EDI-only mode.
  return 'workspace';
}

export function App() {
  useBrandRevealed();
  const [activeView, setActiveView] = useState<View>(getInitialView);

  // Allow dev access to QFAF Test via Ctrl+Shift+Q
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'q') {
        e.preventDefault();
        setActiveView('qfaf-test');
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="app">
      <nav className="app-nav">
        <div className="nav-container">
          <button
            className={`nav-tab ${activeView === 'workspace' ? 'active' : ''}`}
            onClick={() => setActiveView('workspace')}
          >
            Workspace
          </button>
          <button
            className={`nav-tab ${activeView === 'calculator' ? 'active' : ''}`}
            onClick={() => setActiveView('calculator')}
          >
            Classic Calculator
          </button>
          {activeView === 'qfaf-test' && (
            <button className={`nav-tab active`} onClick={() => setActiveView('qfaf-test')}>
              {brandText('QFAF Test')}
            </button>
          )}
          <ThemeToggle />
        </div>
      </nav>

      <main className="app-content">
        <ErrorBoundary>
          <div
            hidden={activeView !== 'workspace'}
            style={{ display: activeView === 'workspace' ? undefined : 'none' }}
          >
            <WorkspaceTab isActive={activeView === 'workspace'} />
          </div>
          <div
            hidden={activeView !== 'calculator'}
            style={{ display: activeView === 'calculator' ? undefined : 'none' }}
          >
            <Calculator isActive={activeView === 'calculator'} />
          </div>
          {activeView === 'qfaf-test' && <QfafTestPage />}
        </ErrorBoundary>
      </main>
    </div>
  );
}
