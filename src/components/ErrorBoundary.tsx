import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props { children: ReactNode }
interface State { error: Error | null }

/**
 * Chặn crash render lan ra toàn app. Không có boundary này, một lỗi ở bất kỳ
 * trang nào (vd Performance với dữ liệu thật thiếu field) sẽ unmount cả React
 * tree → màn hình đen im lặng, không dấu vết cho người dùng lẫn debug.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('App crash:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-bg text-ink p-6 text-center">
        <AlertTriangle size={32} className="text-red-400" />
        <div>
          <p className="font-bold text-lg">Đã xảy ra lỗi khi hiển thị trang này</p>
          <p className="text-sm text-muted mt-1 max-w-md">{error.message}</p>
        </div>
        <button
          onClick={() => { this.setState({ error: null }); window.location.reload(); }}
          className="inline-flex items-center gap-2 rounded-lg text-sm font-semibold px-4 py-2 bg-accent hover:bg-indigo-500 text-white transition-all cursor-pointer"
        >
          <RefreshCw size={15} /> Tải lại trang
        </button>
      </div>
    );
  }
}
