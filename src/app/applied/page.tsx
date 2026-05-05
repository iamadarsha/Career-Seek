import { redirect } from 'next/navigation';

export default function AppliedRedirect() {
  redirect('/pipeline?status=applied');
}
