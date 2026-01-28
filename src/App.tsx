import { useState } from 'react';
import { Calculator } from './Calculator';
import { QfafTestPage } from './pages/QfafTestPage';
import { ThemeToggle } from './components/ThemeToggle';

type View = 'calculator' | 'qfaf-test';

export function App() {
  const [activeView, setActiveView] = useState<View>('calculator');

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
            className={`nav-tab ${activeView === 'qfaf-test' ? 'active' : ''}`}
            onClick={() => setActiveView('qfaf-test')}
          >
            QFAF Test
          </button>
          <ThemeToggle />
        </div>
      </nav>

      <main className="app-content">
        {activeView === 'calculator' && <Calculator />}
        {activeView === 'qfaf-test' && <QfafTestPage />}
      </main>
    </div>
  );
}
