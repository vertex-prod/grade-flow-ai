/** Home: sends the visitor straight to the upload page. */
import { redirect } from 'next/navigation';
import { pathFor } from '@/lib/domain/routes';

export default function Home() {
  redirect(pathFor('upload'));
}
