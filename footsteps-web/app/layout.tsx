import type { Metadata } from 'next';
import './globals.css';
import NetworkIndicator from '../components/ui/NetworkIndicator';

export const metadata: Metadata = {
  title: 'footsteps',
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
        {/* Global, subtle network activity indicator */}
        <NetworkIndicator />
      </body>
    </html>
  );
}
