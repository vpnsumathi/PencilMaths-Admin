import { redirect } from 'next/navigation';

// The home page sends people to the login page for now.
// Once sign-in works, this becomes the dashboard.
export default function Home() {
  redirect('/login');
}
