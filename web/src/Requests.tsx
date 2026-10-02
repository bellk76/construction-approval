import { useEffect, useState } from 'react';
import { api } from './api';
import type { PurchaseRequest, RefItem, User } from './api';

function canApprove(user: User, req: PurchaseRequest): boolean {
  const pending = req.steps.filter((s) => s.status === 'PENDING');
  if (pending.length === 0) return false;
  const current = pending[0];
  return user.roleCodes.includes(current.requiredRole.code);
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    DRAFT: 'черновик',
    ON_APPROVAL: 'на согласовании',
    APPROVED: 'согласована',
    REJECTED: 'отклонена',
  };
  return <span className={`badge badge-${status}`}>{map[status] ?? status}</span>;
}

export function Requests({ user }: { user: User }) {
  const [id, setId] = useState('');
  const [req, setReq] = useState<PurchaseRequest | null>(null);
  const [amount, setAmount] = useState('250000');
  const [msg, setMsg] = useState('');
  const [projects, setProjects] = useState<RefItem[]>([]);
  const [contractors, setContractors] = useState<RefItem[]>([]);
  const [projectId, setProjectId] = useState<number | ''>('');
  const [contractorId, setContractorId] = useState<number | ''>('');

  useEffect(() => {
    api.projects().then((p) => {
      setProjects(p);
      if (p[0]) setProjectId(p[0].id);
    });
    api.contractors().then((c) => {
      setContractors(c);
      if (c[0]) setContractorId(c[0].id);
    });
  }, []);

  const guard = async (fn: () => Promise<unknown>) => {
    try {
      setMsg('');
      await fn();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const load = () => guard(async () => setReq(await api.request(Number(id))));

  const create = () =>
    guard(async () => {
      if (!projectId || !contractorId) return;
      const r = await api.create({ projectId: Number(projectId), contractorId: Number(contractorId), amount: Number(amount) });
      setId(String(r.id));
      setMsg(`Создана заявка №${r.id}. Нажмите «Показать».`);
    });

  const submitIt = () =>
    guard(async () => {
      const r = await api.submit(Number(id));
      setReq(r);
      setMsg('Заявка отправлена на согласование, маршрут построен.');
    });

  return (
    <div>
      <div className="card">
        <h2>Новая заявка на закупку</h2>
        <div className="row">
          <label>
            Объект
            <select value={projectId} onChange={(e) => setProjectId(Number(e.target.value))}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  №{p.id} · {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Подрядчик
            <select value={contractorId} onChange={(e) => setContractorId(Number(e.target.value))}>
              {contractors.map((c) => (
                <option key={c.id} value={c.id}>
                  №{c.id} · {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Сумма, ₽
            <input data-testid="amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <button data-testid="create" onClick={create} disabled={!user.permissions.includes('document.create')}>
            Создать
          </button>
        </div>
        {!user.permissions.includes('document.create') && (
          <p className="muted">У вашей роли нет права создавать документы.</p>
        )}
      </div>

      <div className="card">
        <h2>Заявка</h2>
        <div className="row">
          <label>
            Номер (ID)
            <input data-testid="request-id" value={id} onChange={(e) => setId(e.target.value)} />
          </label>
          <button data-testid="show" onClick={load}>Показать</button>
          <button data-testid="submit" onClick={submitIt}>Отправить на согласование</button>
        </div>

        {req && (
          <div>
            <p>
              <strong>{req.number}</strong> на {Number(req.amount).toLocaleString('ru-RU')} ₽ —{' '}
              {statusBadge(req.status)}
            </p>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Роль</th>
                  <th>Срок</th>
                  <th>Статус</th>
                  <th>Действие</th>
                </tr>
              </thead>
              <tbody>
                {req.steps.map((s) => {
                  const isCurrent = req.steps.filter((x) => x.status === 'PENDING')[0]?.id === s.id;
                  return (
                    <tr key={s.id} className={isCurrent ? 'current' : ''}>
                      <td>{s.order}</td>
                      <td>{s.requiredRole.name}</td>
                      <td>{new Date(s.dueAt).toLocaleDateString('ru-RU')}</td>
                      <td>{s.status}</td>
                      <td>
                        {isCurrent && s.status === 'PENDING' && (
                          <>
                            <button
                              disabled={!user.roleCodes.includes(s.requiredRole.code)}
                              onClick={() => guard(async () => setReq(await api.approve(s.id)))}
                            >
                              Согласовать
                            </button>
                            <button
                              className="danger"
                              disabled={!user.roleCodes.includes(s.requiredRole.code)}
                              onClick={() =>
                                guard(async () => setReq(await api.reject(s.id, 'не согласовано')))
                              }
                            >
                              Отклонить
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="muted">
              Согласовать может только роль текущего шага. Кнопки неактивны для чужих ролей.
            </p>
          </div>
        )}
      </div>

      {msg && <p className="notice">{msg}</p>}
    </div>
  );
}
