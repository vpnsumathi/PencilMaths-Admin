import { signOut } from '@/app/actions';

export default function NoAccess() {
  return (
    <main style={{ padding: 24 }}>
      <h1>No access</h1>
      <p>Your account does not have access to Pencil Maths. Please contact Pencil Maths if you think this is wrong.</p>
      <form action={signOut}><button>Sign out</button></form>
    </main>
  );
}
