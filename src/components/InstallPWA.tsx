'use client';

import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function InstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      // Mencegah browser menampilkan prompt default
      e.preventDefault();
      // Simpan event agar bisa dipicu nanti
      setDeferredPrompt(e);
      setIsVisible(true);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsVisible(false);
      console.log('Aplikasi berhasil diinstal');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Cek jika aplikasi sudah dalam mode standalone (terinstal)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsVisible(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    // Tampilkan prompt instalasi
    deferredPrompt.prompt();

    // Tunggu jawaban pengguna
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setIsVisible(false);
    }
  };

  if (!isVisible) return null;

  return (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={handleInstallClick}
      className="hidden md:flex gap-2 bg-primary/10 border-primary/30 text-primary hover:bg-primary/20 animate-in fade-in zoom-in duration-500"
    >
      <Download className="w-4 h-4" />
      Instal Aplikasi
    </Button>
  );
}

// Versi Banner untuk Mobile
export function InstallPWABanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="md:hidden fixed bottom-4 left-4 right-4 z-[100] bg-primary text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between animate-in slide-in-from-bottom-10">
      <div className="flex items-center gap-3">
        <div className="bg-white/20 p-2 rounded-lg">
          <Download className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold">Instal Aplikasi?</p>
          <p className="text-[10px] opacity-80">Akses lebih cepat & hemat kuota.</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={handleInstall} className="h-8 text-xs font-bold px-4">Instal</Button>
        <Button size="icon" variant="ghost" onClick={() => setIsVisible(false)} className="h-8 w-8 text-white/50"><X className="w-4 h-4" /></Button>
      </div>
    </div>
  );
}
