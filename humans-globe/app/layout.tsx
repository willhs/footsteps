import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Globe of Humans - 100,000 Years of Human Presence',
  description: 'Watch humanity spread across Earth from 100,000 BCE to today',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}