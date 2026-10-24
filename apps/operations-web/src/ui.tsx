import { useQuery } from '@tanstack/react-query';
import {
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from 'react';
import type { ReadSpec } from './api/reads';
import { uuid } from './api/schema';
import { ReadError } from './auth/session';
import type { Runtime } from './runtime';

export function Status({ value }: { value: string | null }) {
  const tone =
    value && /FAIL|REQUIRED|UNCERTAIN|OPEN|SUSPENDED|REJECTED/.test(value)
      ? 'alert'
      : value && /PENDING|REQUESTED|RESERVED|APPROVED/.test(value)
        ? 'pending'
        : 'neutral';
  return <span className={`status ${tone}`}>{value ?? 'Not recorded'}</span>;
}
export const Reference = ({ value }: { value: string | null }) =>
  value ? (
    <code className="reference">{value}</code>
  ) : (
    <span className="muted">Not recorded</span>
  );
export function Time({ value }: { value: string | null }) {
  return value ? (
    <time dateTime={value}>
      {new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Kolkata',
      }).format(new Date(value))}{' '}
      IST
    </time>
  ) : (
    <span className="muted">Not recorded</span>
  );
}
export function Panel({
  title,
  children,
  note,
}: {
  title: string;
  children: ReactNode;
  note?: string;
}) {
  return (
    <section className="panel" aria-label={title}>
      <div className="panel-heading">
        <h2>{title}</h2>
      </div>
      {note && <p className="scope">{note}</p>}
      {children}
    </section>
  );
}
export function Gap({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="gap" aria-label={title}>
      <span className="eyebrow">Integration boundary</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </section>
  );
}
export function Table({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: ReactNode[][];
}) {
  if (!rows.length)
    return (
      <p className="empty" role="status">
        No records returned for this scope.
      </p>
    );
  return (
    <div
      className="table-scroll"
      tabIndex={0}
      role="region"
      aria-label={caption}
    >
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, col) => (
                <td key={col}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function ReadPanel<T>({
  runtime,
  title,
  spec,
  children,
}: {
  runtime: Runtime;
  title: string;
  spec: ReadSpec<T>;
  children: (data: T) => ReactNode;
}) {
  const state = useSyncExternalStore(
    runtime.session.subscribe,
    runtime.session.snapshot,
  );
  const query = useQuery({
    queryKey: ['manager', state.epoch, spec.path],
    queryFn: async ({ signal }) =>
      spec.parse(await runtime.session.read(spec.path, signal)),
    enabled: state.phase === 'ready',
  });
  return (
    <Panel title={title} note={spec.scope}>
      <div className="read-tools">
        <span className="muted">
          {runtime.kind === 'fixture' ? 'Fixture snapshot' : 'Backend snapshot'}
          {query.dataUpdatedAt > 0 && !query.isFetching && !query.error ? (
            <>
              {' '}
              · read{' '}
              <Time value={new Date(query.dataUpdatedAt).toISOString()} />
            </>
          ) : (
            ''
          )}
        </span>
        <button
          type="button"
          className="secondary"
          disabled={query.isFetching || state.phase !== 'ready'}
          onClick={() => {
            void query.refetch();
          }}
        >
          Refresh {title.toLowerCase()}
        </button>
      </div>
      {query.isFetching || query.isPending ? (
        <p role="status" className="empty">
          Reading current state…
        </p>
      ) : query.error ? (
        <div role="alert" className="read-error">
          <strong>Current read unavailable</strong>
          <p>
            {query.error instanceof ReadError
              ? query.error.message
              : 'The service response could not be verified.'}
          </p>
          <p>
            Previous results are hidden. Refresh to obtain a current snapshot.
          </p>
        </div>
      ) : query.data !== undefined ? (
        children(query.data)
      ) : (
        <p className="empty">No verified response.</p>
      )}
    </Panel>
  );
}
export function Lookup({
  label,
  onSelect,
  initial = '',
}: {
  label: string;
  onSelect: (id: string) => void;
  initial?: string;
}) {
  const [value, setValue] = useState(initial),
    [error, setError] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    try {
      const id = uuid(value.trim());
      setError('');
      onSelect(id);
    } catch {
      setError('Enter a valid UUID reference.');
    }
  };
  return (
    <form className="lookup" onSubmit={submit}>
      <label>
        {label}
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="00000000-0000-0000-0000-000000000000"
          spellCheck={false}
          autoComplete="off"
          required
          aria-invalid={!!error}
        />
      </label>
      <button type="submit">Read details</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
export function Pager({
  next,
  onNext,
  onReset,
  active,
}: {
  next: string | number | null;
  onNext: () => void;
  onReset: () => void;
  active: boolean;
}) {
  return (
    <div className="pager">
      <button
        type="button"
        className="secondary"
        onClick={onReset}
        disabled={!active}
      >
        First page
      </button>
      <button
        type="button"
        className="secondary"
        disabled={next === null}
        onClick={onNext}
      >
        Next page
      </button>
      <span className="muted">
        {next === null ? 'End of this result set' : 'More records available'}
      </span>
    </div>
  );
}
