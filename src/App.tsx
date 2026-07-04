import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { auth, onAuthStateChanged, type User } from './lib/firebase';
import { AppDataProvider, useAppData } from './store/AppDataContext';
import { ToastProvider } from './hooks/useToast';
import { Sidebar, type View } from './components/layout/Sidebar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { ProjectsPage, type ProjectsTab } from './pages/Projects';
import { ProjectDetailPage } from './pages/ProjectDetail';
import { DailyContentPage } from './pages/DailyContent';
import { ReportsPage } from './pages/Reports';
import { PerformancePage } from './pages/Performance';
import { SettingsPage } from './pages/Settings';

function Shell({ user }: { user: User }) {
  const { loading, isAdmin } = useAppData();
  const [view, setView] = useState<View>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  // Lifted so the Inhouse/Outsource/Content tab survives opening a project detail
  const [projectsTypeFilter, setProjectsTypeFilter] = useState<ProjectsTab>('inhouse');

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-muted">
        <Loader2 size={28} className="animate-spin text-accent" />
        <p className="text-sm">Đang tải dữ liệu...</p>
      </div>
    );
  }

  const openProject = (id: string) => setSelectedProjectId(id);
  const closeProject = () => setSelectedProjectId(null);
  const navigate = (v: View) => { setSelectedProjectId(null); setView(v); };

  return (
    <div className="flex min-h-screen">
      <Sidebar view={view} onNavigate={navigate} />
      <main className="flex-1 min-w-0 p-4 lg:p-8">
        {/* key = remount boundary khi đổi trang, để một crash không kẹt cứng cả app */}
        <ErrorBoundary key={selectedProjectId || view}>
          {selectedProjectId ? (
            <ProjectDetailPage projectId={selectedProjectId} user={user} onBack={closeProject} />
          ) : (
            <>
              {view === 'dashboard' && <DashboardPage user={user} onOpenProject={openProject} />}
              {view === 'projects' && <ProjectsPage user={user} onOpenProject={openProject} typeFilter={projectsTypeFilter} onTypeFilterChange={setProjectsTypeFilter} />}
              {view === 'daily' && <DailyContentPage user={user} onOpenProject={openProject} />}
              {view === 'reports' && <ReportsPage user={user} />}
              {view === 'performance' && isAdmin && <PerformancePage onOpenProject={openProject} />}
              {view === 'settings' && <SettingsPage user={user} />}
            </>
          )}
        </ErrorBoundary>
      </main>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
  }, []);

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-accent" />
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <AppDataProvider user={user}>
      <ToastProvider>
        <Shell user={user} />
      </ToastProvider>
    </AppDataProvider>
  );
}
