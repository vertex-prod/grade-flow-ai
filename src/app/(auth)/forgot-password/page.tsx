import { AuthScreen } from '@/components/auth/AuthScreen';

export const metadata = { title: 'Reset password · GradeFlow AI' };

export default function ForgotPasswordPage() {
  return <AuthScreen mode="forgot" />;
}
