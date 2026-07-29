import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { auth, onAuthStateChanged, type User } from './lib/firebase';
import { AppDataProvider, useAppData } from './store/AppDataContext';
import { ToastProvider } from './hooks/useToast';
import { useAutoIcsSync } from './hooks/useAutoIcsSync';
import { Sidebar, type View } from './components/layout/Sidebar';
import { currentMonth, tsToDateStr } from './lib/utils';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { MePage } from './pages/Me';
import { ProjectsPage, type ProjectsTab } from './pages/Projects';
import { ProjectDetailPage } from './pages/ProjectDetail';
import { DailyContentPage, ContentDetailPage, type CalendarScroll } from './pages/DailyContent';
import { ReportsPage } from './pages/Reports';
import { PerformancePage } from './pages/Performance';
import { SettingsPage } from './pages/Settings';

function Shell({ user }: { user: User }) {
  const { loading, isAdmin, projects, dailyContent } = useAppData();
  useAutoIcsSync(); // tự động đẩy feed lịch Inhouse lên Apple khi dữ liệu đổi
  const [view, setView] = useState<View>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedContentId, setSelectedContentId] = useState<string | null>(null);
  // Lifted so the Inhouse/Outsource/Content tab survives opening a project detail
  const [projectsTypeFilter, setProjectsTypeFilter] = useState<ProjectsTab>('inhouse');
  // Lifted so Lịch tháng giữ nguyên tháng đang xem khi mở project detail rồi quay lại
  const [calendarMonth, setCalendarMonth] = useState(currentMonth());
  // Ngày của dự án vừa tạo / vừa mở chi tiết — lần mở Lịch tháng kế tiếp cuộn tới tháng đó
  // thay vì tháng hiện tại. Chỉ bấm menu "Lịch tháng" mới xoá cờ để về hôm nay.
  const [calendarFocusDate, setCalendarFocusDate] = useState<string | null>(null);
  // Tăng mỗi lần bấm menu "Lịch tháng" → đổi key để lịch remount và cuộn lại về hôm nay,
  // kể cả khi đang đứng sẵn ở view daily (setView cùng giá trị thì React không remount).
  const [calendarResetNonce, setCalendarResetNonce] = useState(0);
  // Vị trí cuộn của Lịch tháng, ghi liên tục khi cuộn. Là ref (không phải state) để lịch unmount
  // rồi mount lại vẫn đọc được, mà cập nhật thì không làm cả app re-render.
  const calendarScrollRef = useRef<CalendarScroll | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-muted">
        <Loader2 size={28} className="animate-spin text-accent" />
        <p className="text-sm">Đang tải dữ liệu...</p>
      </div>
    );
  }

  // Mở chi tiết dự án / nội dung KHÔNG đụng vào lịch: lịch tự khôi phục đúng vị trí cuộn cũ
  const openProject = (id: string) => { setSelectedContentId(null); setSelectedProjectId(id); };
  const closeProject = () => setSelectedProjectId(null);
  const openContent = (id: string) => { setSelectedProjectId(null); setSelectedContentId(id); };
  const closeContent = () => setSelectedContentId(null);
  // Bấm menu "Lịch tháng" là cách duy nhất đưa lịch về hôm nay: xoá cả vị trí đã lưu lẫn cờ focus
  const navigate = (v: View) => {
    if (v === 'daily') { calendarScrollRef.current = null; setCalendarFocusDate(null); setCalendarResetNonce((n) => n + 1); }
    setSelectedProjectId(null);
    setSelectedContentId(null);
    setView(v);
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar view={view} onNavigate={navigate} />
      <main className="flex-1 min-w-0 p-4 lg:p-8">
        {/* key = remount boundary khi đổi trang, để một crash không kẹt cứng cả app */}
        <ErrorBoundary key={selectedProjectId || selectedContentId || (view === 'daily' ? `daily-${calendarResetNonce}` : view)}>
          {selectedProjectId ? (
            <ProjectDetailPage projectId={selectedProjectId} user={user} onBack={closeProject} />
          ) : selectedContentId ? (
            <ContentDetailPage contentId={selectedContentId} user={user} onBack={closeContent} onOpenProject={openProject} />
          ) : (
            <>
              {view === 'dashboard' && <DashboardPage user={user} onOpenProject={openProject} onOpenContent={openContent} />}
              {view === 'me' && <MePage user={user} onOpenProject={openProject} onOpenContent={openContent} />}
              {view === 'projects' && <ProjectsPage user={user} onOpenProject={openProject} onOpenContent={openContent} typeFilter={projectsTypeFilter} onTypeFilterChange={setProjectsTypeFilter} onFocusCalendar={setCalendarFocusDate} />}
              {view === 'daily' && <DailyContentPage user={user} onOpenProject={openProject} onOpenContent={openContent} month={calendarMonth} onMonthChange={setCalendarMonth} focusDate={calendarFocusDate} scrollRef={calendarScrollRef} />}
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
