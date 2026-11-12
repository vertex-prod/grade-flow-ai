import { AuthScreen } from '@/components/auth/AuthScreen';

export const metadata = { title: 'Sign in · GradeFlow AI' };

export default function LoginPage() {
  return <AuthScreen mode="signin" />;
}
