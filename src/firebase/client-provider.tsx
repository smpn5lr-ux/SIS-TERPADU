
'use client';

import React, { useMemo, useEffect } from 'react';
import { initializeFirebase, useMemoFirebase, useDoc } from './index';
import { FirebaseProvider, useFirestore } from './provider';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';
import { doc } from 'firebase/firestore';

/**
 * Komponen internal untuk mengelola Branding secara dinamis (Favicon & Title).
 * Mengambil logo dan nama aplikasi dari Firestore dan memperbarui elemen browser.
 */
function BrandingManager() {
  const db = useFirestore();
  const settingsRef = useMemoFirebase(() => (db ? doc(db, 'settings', 'system') : null), [db]);
  const { data: config } = useDoc<any>(settingsRef);

  useEffect(() => {
    if (config?.appLogoUrl) {
      // Perbarui Favicon
      const selectors = [
        "link[rel='icon']",
        "link[rel='shortcut icon']",
        "link[rel='apple-touch-icon']",
      ];

      selectors.forEach((selector) => {
        const link: HTMLLinkElement | null = document.querySelector(selector);
        if (link) {
          link.href = config.appLogoUrl;
        } else if (selector === "link[rel='icon']") {
          const newLink = document.createElement('link');
          newLink.rel = 'icon';
          newLink.href = config.appLogoUrl;
          document.head.appendChild(newLink);
        }
      });
    }

    if (config?.appName) {
      // Perbarui Judul Tab Browser
      // Menggunakan format: Nama Aplikasi | Instansi (jika ada)
      const schoolName = config.schoolName ? ` | ${config.schoolName}` : '';
      document.title = `${config.appName}${schoolName}`;
    }
  }, [config]);

  return null;
}

export function FirebaseClientProvider({ children }: { children: React.ReactNode }) {
  // Inisialisasi secara sinkron di level client untuk menghindari flicker state null
  const services = useMemo(() => initializeFirebase(), []);

  return (
    <FirebaseProvider
      firebaseApp={services.firebaseApp}
      firestore={services.firestore}
      auth={services.auth}
    >
      <FirebaseErrorListener />
      <BrandingManager />
      {children}
    </FirebaseProvider>
  );
}
