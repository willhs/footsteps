import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{ padding: 24 }}>
      <h2>Page not found</h2>
      <p>We couldn’t find the page you’re looking for.</p>
      <Link href="/">Return home</Link>
    </div>
  );
}
