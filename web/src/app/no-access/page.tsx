import { signOut } from '@/app/actions';

export default function NoAccess() {
  return (
    <main style={{ padding: 24 }}>
      <h1>No access</h1>
      <p>Your account is not set up as active staff. Ask an admin to add you.</p>
      <form action={signOut}><button>Sign out</button></form>
    </main>
  );
}
