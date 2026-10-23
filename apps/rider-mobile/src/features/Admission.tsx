import { Redirect } from 'expo-router';
import { useSession } from '../hooks';
import { riderAdmission } from '../session/admission';
import { logout, preview, recheckSession } from '../runtime';
import { Body, Button, Loading, Page, ErrorState } from '../ui';
export function Admission({ children }: React.PropsWithChildren) {
  const state = useSession();
  const admission = riderAdmission(state, preview);
  if (admission === 'admitted') return children;
  if (admission === 'login') return <Redirect href="/" />;
  return (
    <Page
      title={
        admission === 'forbidden'
          ? 'Rider access required'
          : 'Checking Rider access'
      }
    >
      {admission === 'loading' ? (
        <Loading />
      ) : (
        <>
          <Body>
            {admission === 'forbidden'
              ? 'This account does not have a current RIDER role. Contact operations to check your onboarding.'
              : 'Rider access could not be confirmed. Your token does not grant admission by itself.'}
          </Body>
          <ErrorState error={state.principalError} />
          <Button
            title="Check Rider access again"
            onPress={() => void recheckSession().catch(() => {})}
          />
          <Button
            title="Sign out"
            onPress={() => void logout().catch(() => {})}
          />
        </>
      )}
    </Page>
  );
}
