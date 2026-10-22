'use client';

import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { firebaseConfig } from './config';
import { useMemo, useRef } from 'react';

export function initializeFirebase() {
  const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  
  // Enable long-polling to bypass WebSocket restrictions often found in cloud workstation environments.
  // This addresses the "Could not reach Cloud Firestore backend" timeout errors.
  const firestore = initializeFirestore(firebaseApp, {
    experimentalForceLongPolling: true,
  });
  
  const auth = getAuth(firebaseApp);

  return { firebaseApp, firestore, auth };
}

/**
 * Hook khusus untuk memastikan referensi atau kueri Firebase tetap stabil.
 * Ini mencegah pemicuan berulang pada useEffect di dalam useCollection/useDoc.
 */
export function useMemoFirebase<T>(factory: () => T, deps: any[]): T {
  const ref = useRef<T>(null);
  const lastDeps = useRef<any[]>(null);
  const changed = !lastDeps.current || !deps.every((d, i) => d === lastDeps.current[i]);
  if (changed) {
    lastDeps.current = deps;
    ref.current = factory();
  }
  return ref.current!;
}

export * from './provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './auth/use-user';
