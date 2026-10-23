import { useState } from 'react';
import { fixtures, logout, preview, queryClient } from '../runtime';
import { useSession } from '../hooks';
import { fixtureScenarios } from './fixtures';
import { Body, Button, Card, ErrorState, Muted, Page } from '../ui';
export default function Account() {
  const session = useSession();
  const [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false);
  const [scenario, setScenario] = useState(fixtures.getScenario());
  return (
    <Page title="Rider account">
      <Card>
        <Body>{preview ? 'Development Rider' : `Rider ${session.userId}`}</Body>
        <Muted>
          Rider access comes from the live principal API. Device state cannot
          grant a role.
        </Muted>
      </Card>
      {preview ? (
        <>
          <Body>Development fixture scenarios</Body>
          <Muted>
            Current: {scenario}. These scenarios never use live API responses.
          </Muted>
          {fixtureScenarios.map((value) => (
            <Button
              key={value}
              title={`Fixture: ${value}`}
              onPress={() => {
                fixtures.setScenario(value);
                setScenario(value);
                queryClient.clear();
              }}
            />
          ))}
        </>
      ) : (
        <>
          <ErrorState error={error} />
          <Button
            title={busy ? 'Signing out…' : 'Sign out'}
            disabled={busy}
            onPress={() => {
              setBusy(true);
              void logout()
                .catch(setError)
                .finally(() => setBusy(false));
            }}
          />
          <Muted>
            Local session data is cleared immediately. Server revocation needs a
            network connection.
          </Muted>
        </>
      )}
    </Page>
  );
}
