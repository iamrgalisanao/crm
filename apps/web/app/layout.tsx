import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '../lib/auth';

export const metadata: Metadata = {
  title: 'CRM + Sales',
  description: 'CRM + Sales Management Platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
