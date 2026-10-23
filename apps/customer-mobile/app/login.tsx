import LoginScreen from '../src/features/auth/LoginScreen';
import AuthRoute from '../src/preview/AuthRoute';
export default function LoginRoute() {
  return (
    <AuthRoute>
      <LoginScreen />
    </AuthRoute>
  );
}
