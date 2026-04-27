import type { Metadata } from 'next';

import { AuthProvider } from '@/context/AuthContext';
import { QueryProvider } from '@/providers/QueryProvider';

import './globals.css';

export const metadata: Metadata = {
  title: 'TraceDNA — Digital Rights Protection Platform',
  description:
    'Enterprise-grade platform to detect unauthorized mutations of digital sports media using AI-powered Content DNA fingerprinting.',
  keywords: 'digital rights, piracy detection, content DNA, DMCA, video fingerprinting',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-surface">
        <QueryProvider>
          <AuthProvider>{children}</AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
