import { useState } from 'react';
import { Clapperboard, Loader2 } from 'lucide-react';
import { auth, signInWithEmailAndPassword } from '../lib/firebase';
import { Button, Input, Field } from '../components/ui';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const email = username.includes('@') ? username.trim() : `${username.trim()}@production.team`;
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code || '';
      if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) {
        setError('Sai tên đăng nhập hoặc mật khẩu');
      } else {
        setError('Không đăng nhập được — kiểm tra kết nối mạng');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-bg">
      <div className="fade-up w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent to-accent-2 flex items-center justify-center mb-4 shadow-lg shadow-indigo-500/20">
            <Clapperboard size={26} className="text-white" />
          </div>
          <h1 className="text-xl font-extrabold tracking-tight">Media Team</h1>
          <p className="text-sm text-muted mt-1">Đăng nhập để tiếp tục</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-surface border border-line rounded-2xl p-6 space-y-4">
          <Field label="Tên đăng nhập">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ten_dang_nhap hoặc email" autoFocus />
          </Field>
          <Field label="Mật khẩu">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </Field>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" disabled={busy || !username || !password} className="w-full">
            {busy ? <Loader2 size={16} className="animate-spin" /> : 'Đăng nhập'}
          </Button>
        </form>
      </div>
    </div>
  );
}
