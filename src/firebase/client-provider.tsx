'use client';

import React, { useMemo, useEffect } from 'react';
import { initializeFirebase, useMemoFirebase, useDoc } from './index';
import { FirebaseProvider, useFirestore } from './provider';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';
import { doc } from 'firebase/firestore';

/**
 * Komponen internal untuk mengelola Favicon secara dinamis.
 * Mengambil logo dari Firestore dan memperbarui elemen <link rel="icon"> di head dokumen.
 */
function FaviconManager() {
  const db = useFirestore();
  const settingsRef = useMemoFirebase(() => (db ? doc(db, 'settings', 'system') : null), [db]);
  const { data: config } = useDoc<any>(settingsRef);

  useEffect(() => {
    if (config?.appLogoUrl) {
      // Cari semua elemen link yang berkaitan dengan ikon
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
          // Jika tidak ada, buat baru
          const newLink = document.createElement('link');
          newLink.rel = 'icon';
          newLink.href = config.appLogoUrl;
          document.head.appendChild(newLink);
        }
      });
      
      // Opsional: Perbarui judul tab jika nama aplikasi berubah
      if (config?.appName && !document.title.includes(config.appName)) {
        // Kita biarkan metadata layout yang menangani judul utama agar tidak konflik
      }
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
      <FaviconManager />
      {children}
    </FirebaseProvider>
  );
}
