
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { Toaster } from '@/components/ui/toaster';
import { RegisterSW } from '@/components/RegisterSW';

const ICON_URL = "/icon-logo.png";

export const viewport: Viewport = {
  themeColor: '#4361ee',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: 'SIS TERPADU | Sistem Informasi Sekolah Terpadu',
  description: 'Sistem informasi manajemen sekolah terpadu modern berbasis standar Dapodik.',
  manifest: '/manifest',
  icons: {
    icon: [
      { url: ICON_URL, sizes: 'any' },
      { url: ICON_URL, type: 'image/png', sizes: '32x32' },
      { url: ICON_URL, type: 'image/png', sizes: '192x192' },
      { url: ICON_URL, type: 'image/png', sizes: '512x512' },
    ],
    shortcut: [ICON_URL],
    apple: [
      { url: ICON_URL, sizes: '180x180', type: 'image/png' },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SIS TERPADU',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="dark">
      <head>
        <link rel="icon" href={ICON_URL} />
        <link rel="shortcut icon" href={ICON_URL} />
        <link rel="apple-touch-icon" href={ICON_URL} />
        
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="font-body antialiased bg-background text-foreground min-h-screen">
        <FirebaseClientProvider>
          <RegisterSW />
          {children}
        </FirebaseClientProvider>
        <Toaster />
      </body>
    </html>
  );
}
