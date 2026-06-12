import { useState, useEffect } from 'react';
import { Calculator } from './Calculator';
import { QfafTestPage } from './pages/QfafTestPage';
import { EdiOnlyPage } from './pages/EdiOnlyPage';
import { WorkspaceTab } from './workspace/WorkspaceTab';
import { ThemeToggle } from './components/ThemeToggle';
import { ErrorBoundary } from './components/ErrorBoundary';

type View = 'calculator' | 'workspace' | 'qfaf-test' | 'edi-only';

function getInitialView(): View {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');
  if (view === 'qfaf-test' || view === 'edi-only' || view === 'calculator' || view === 'workspace') {
    return view;
  }
  return 'calculator';
}

export function App() {
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
            className={`nav-tab ${activeView === 'calculator' ? 'active' : ''}`}
            onClick={() => setActiveView('calculator')}
          >
            Tax Calculator
          </button>
          <button
            className={`nav-tab ${activeView === 'workspace' ? 'active' : ''}`}
            onClick={() => setActiveView('workspace')}
          >
            Workspace <span className="nav-tab-badge">Beta</span>
          </button>
          <button
            className={`nav-tab ${activeView === 'edi-only' ? 'active' : ''}`}
            onClick={() => setActiveView('edi-only')}
          >
            EDI-Only
          </button>
          {activeView === 'qfaf-test' && (
            <button
              className={`nav-tab active`}
              onClick={() => setActiveView('qfaf-test')}
            >
              QFAF Test
            </button>
          )}
          <ThemeToggle />
        </div>
      </nav>

      <main className="app-content">
        <ErrorBoundary>
          {activeView === 'calculator' && <Calculator />}
          {activeView === 'workspace' && <WorkspaceTab />}
          {activeView === 'qfaf-test' && <QfafTestPage />}
          {activeView === 'edi-only' && <EdiOnlyPage />}
        </ErrorBoundary>
      </main>
    </div>
  );
}
