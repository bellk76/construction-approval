import { useState } from 'react';
import { api } from './api';
import type { User } from './api';

const DEMO_USERS = [
  ['foreman', 'foreman123', 'Прораб (создаёт заявки)'],
  ['supply', 'supply123', 'Снабжение (до 300k)'],
  ['pto', 'pto123', 'ПТО (до 1M)'],
  ['accountant', 'accountant123', 'Бухгалтерия (до 1M)'],
  ['director', 'director123', 'Директор (свыше 1M)'],
  ['admin', 'admin123', 'Администратор'],
];

export function Login({ onLogin, onError }: { onLogin: (u: User) => void; onError: (m: string) => void }) {
  const [login, setLogin] = useState('foreman');
  const [password, setPassword] = useState('foreman123');

  const submit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    try {
      const r = await api.login(login, password);
      onLogin(r.user);
    } catch (err) {
      onError((err as Error).message);
    }
  };

  return (
    <div className="grid">
      <form onSubmit={submit} className="card">
        <h2>Вход</h2>
        <label>
          Логин
          <input value={login} onChange={(e) => setLogin(e.target.value)} />
        </label>
        <label>
          Пароль
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button type="submit">Войти</button>
      </form>

      <div className="card">
        <h2>Демо-пользователи</h2>
        <table>
          <tbody>
            {DEMO_USERS.map(([l, p, d]) => (
              <tr key={l} onClick={() => { setLogin(l); setPassword(p); }} className="clickable">
                <td><code>{l}</code></td>
                <td className="muted">{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">Клик по строке подставит логин/пароль.</p>
      </div>
    </div>
  );
}
