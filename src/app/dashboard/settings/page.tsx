
"use client"

import { useState, useEffect, useRef } from "react"
import { 
  Save, 
  ShieldCheck, 
  Building2, 
  Loader2,
  ImageIcon,
  Type,
  Upload,
  Calendar,
  MapPin
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useFirestore, useDoc, useMemoFirebase } from "@/firebase"
import { doc, setDoc } from "firebase/firestore"
import { useToast } from "@/hooks/use-toast"
import { errorEmitter } from "@/firebase/error-emitter"
import { FirestorePermissionError } from "@/firebase/errors"

export default function SettingsPage() {
  const db = useFirestore()
  const { toast } = useToast()
  const [isSaving, setIsSaving] = useState(false)
  
  const logoInputRef = useRef<HTMLInputElement>(null)
  
  const settingsRef = useMemoFirebase(() => {
    if (!db) return null
    return doc(db, "settings", "system")
  }, [db])

  const { data: config, loading: loadingConfig } = useDoc<any>(settingsRef)

  const [localConfig, setLocalConfig] = useState<any>({
    appName: "SIS TERPADU",
    appLogoUrl: "",
    schoolName: "SMP Negeri 5 Langke Rembong",
    dinasName: "DINAS PENDIDIKAN PEMUDA DAN OLAHRAGA",
    govName: "PEMERINTAH KABUPATEN MANGGARAI",
    schoolAddress: "Alamat: Mando, Kelurahan Compang Carep, Kecamatan Langke Rembong",
    npsn: "00000000",
    academicYear: "2024/2025",
    activeSemester: 1
  })

  useEffect(() => {
    if (config) {
      setLocalConfig({
        ...localConfig,
        ...config
      })
    }
  }, [config])

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
    if (!allowedTypes.includes(file.type)) {
      toast({
        variant: "destructive",
        title: "Format Tidak Didukung",
        description: "Gunakan JPG, PNG, WEBP, atau SVG.",
      })
      return
    }

    if (file.size > 512000) {
      toast({
        variant: "destructive",
        title: "File Terlalu Besar",
        description: "Maksimal ukuran logo adalah 500KB.",
      })
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const base64 = event.target?.result as string
      setLocalConfig({ ...localConfig, appLogoUrl: base64 })
      toast({
        title: "Logo Diunggah",
        description: "Klik 'Simpan Profil' untuk menerapkan perubahan.",
      })
    }
    reader.readAsDataURL(file)
  }

  const handleSaveConfig = () => {
    if (!db || !settingsRef) return
    setIsSaving(true)

    setDoc(settingsRef, localConfig, { merge: true })
      .then(() => {
        toast({
          title: "Pengaturan Disimpan",
          description: "Konfigurasi sistem berhasil diperbarui.",
        })
      })
      .catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: settingsRef.path,
          operation: 'write',
          requestResourceData: localConfig
        }))
      })
      .finally(() => setIsSaving(false))
  }

  if (loadingConfig) return (
    <div className="flex flex-col items-center justify-center h-64 gap-2">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
      <p className="text-muted-foreground">Memuat pengaturan sistem...</p>
    </div>
  )

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Pengaturan Sistem</h1>
          <p className="text-muted-foreground mt-1">Konfigurasi global untuk identitas sekolah dan periode aktif.</p>
        </div>
        <Button 
          onClick={handleSaveConfig} 
          disabled={isSaving}
          className="bg-primary hover:bg-primary/90 gap-2 shadow-lg shadow-primary/20"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Simpan Perubahan
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-border/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-accent" />
                <CardTitle className="font-headline text-lg">Periode Akademik Aktif</CardTitle>
              </div>
              <CardDescription>Tentukan tahun ajaran dan semester yang berlaku saat ini.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Tahun Ajaran</label>
                  <Input 
                    value={localConfig.academicYear}
                    onChange={(e) => setLocalConfig({...localConfig, academicYear: e.target.value})}
                    placeholder="Contoh: 2024/2025" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Semester Aktif</label>
                  <Select 
                    value={localConfig.activeSemester?.toString()} 
                    onValueChange={(v) => setLocalConfig({...localConfig, activeSemester: parseInt(v)})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih Semester" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Semester 1 (Ganjil)</SelectItem>
                      <SelectItem value="2">Semester 2 (Genap)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" />
                <CardTitle className="font-headline text-lg">Branding Aplikasi</CardTitle>
              </div>
              <CardDescription>Sesuaikan nama dan logo aplikasi sistem.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                    <Type className="w-3 h-3" /> Nama Aplikasi
                  </label>
                  <Input 
                    value={localConfig.appName}
                    onChange={(e) => setLocalConfig({...localConfig, appName: e.target.value})}
                    placeholder="Contoh: SIS TERPADU" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                    <ImageIcon className="w-3 h-3" /> Logo Aplikasi
                  </label>
                  <div className="flex gap-2">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => logoInputRef.current?.click()}
                      className="shrink-0 gap-2 border-primary/20 text-primary hover:bg-primary/5 w-full"
                    >
                      <Upload className="w-4 h-4" /> Unggah Logo
                    </Button>
                    <input 
                      type="file" 
                      ref={logoInputRef} 
                      onChange={handleFileUpload} 
                      accept=".jpg,.jpeg,.png,.webp,.svg" 
                      className="hidden" 
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" />
                <CardTitle className="font-headline text-lg">Identitas Sekolah (Kop Surat)</CardTitle>
              </div>
              <CardDescription>Informasi resmi sekolah untuk Kop Surat Laporan.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Pemerintah Daerah (Baris 1 Kop)</label>
                  <Input 
                    value={localConfig.govName}
                    onChange={(e) => setLocalConfig({...localConfig, govName: e.target.value})}
                    placeholder="Contoh: PEMERINTAH KABUPATEN MANGGARAI"
                  />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Dinas Pendidikan (Baris 2 Kop)</label>
                  <Input 
                    value={localConfig.dinasName}
                    onChange={(e) => setLocalConfig({...localConfig, dinasName: e.target.value})}
                    placeholder="Contoh: DINAS PENDIDIKAN PEMUDA DAN OLAHRAGA"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Nama Sekolah (Baris 3 Kop)</label>
                  <Input 
                    value={localConfig.schoolName}
                    onChange={(e) => setLocalConfig({...localConfig, schoolName: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">NPSN</label>
                  <Input 
                    value={localConfig.npsn}
                    onChange={(e) => setLocalConfig({...localConfig, npsn: e.target.value})}
                  />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> Alamat Lengkap (Baris 4 Kop)
                  </label>
                  <Input 
                    value={localConfig.schoolAddress}
                    onChange={(e) => setLocalConfig({...localConfig, schoolAddress: e.target.value})}
                    placeholder="Contoh: Alamat: Mando, Kelurahan Compang Carep, Kecamatan Langke Rembong"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-border/50 bg-primary/5">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <ShieldCheck className="w-6 h-6 text-primary mt-1" />
                <div>
                  <h4 className="font-bold text-sm">Penting: Kop Surat Laporan</h4>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Data Identitas Sekolah akan digunakan sebagai header (Kop Surat) pada seluruh dokumen PDF yang dihasilkan sistem, termasuk **Daftar Hadir Siswa**.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
