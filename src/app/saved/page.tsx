import { redirect } from 'next/navigation';

export default function SavedRedirect() {
  redirect('/pipeline?status=saved');
}
