import { useEffect, useState } from 'react';
import { api } from './api';
import type { User } from './api';
import { Login } from './Login';
import { Requests } from './Requests';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .me()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="container">Загрузка…</div>;

  if (!user) {
    return (
      <div className="container">
        <h1>Согласование заявок</h1>
        <Login
          onLogin={(u) => {
            setError('');
            setUser(u);
          }}
          onError={setError}
        />
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="container">
      <header className="topbar">
        <div>
          <strong>{user.fullName}</strong>
          <span className="muted"> · роли: {user.roleCodes.join(', ')}</span>
        </div>
        <button
          onClick={async () => {
            await api.logout();
            setUser(null);
          }}
        >
          Выйти
        </button>
      </header>
      <Requests user={user} />
    </div>
  );
}
