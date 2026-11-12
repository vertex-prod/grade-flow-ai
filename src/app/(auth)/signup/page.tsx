import { AuthScreen } from '@/components/auth/AuthScreen';

export const metadata = { title: 'Create account · GradeFlow AI' };

export default function SignupPage() {
  return <AuthScreen mode="signup" />;
}
