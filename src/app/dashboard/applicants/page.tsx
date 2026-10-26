
"use client"

import { useState, useMemo, useEffect, useRef } from 'react'
import { 
  Search, Plus, Loader2, Pencil, Trash2, CloudUpload, CloudOff, RefreshCw, Eye, FileSpreadsheet, Upload
} from "lucide-react"
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import Link from 'next/link'
import { useCollection, useFirestore, useMemoFirebase, useDoc } from '@/firebase'
import { collection, query, orderBy, doc, writeBatch, limit } from 'firebase/firestore'
import { Applicant } from '@/lib/types'
import { useToast } from '@/hooks/use-toast'
import * as XLSX from 'xlsx'

const formSchema = z.object({
  registrationSequence: z.string().min(1, "No. Urut harus diisi"),
  fullName: z.string().min(2, "Nama minimal 2 karakter"),
  gender: z.enum(['Laki-laki', 'Perempuan']),
  NIS: z.string().optional(),
  NISN: z.string().optional(),
  NIK: z.string().optional(),
  birthPlace: z.string().optional(),
  birthDate: z.string().optional(),
  religion: z.string().optional(),
  address: z.string().optional(),
  rt: z.string().optional(),
  rw: z.string().optional(),
  kelurahan: z.string().optional(),
  kecamatan: z.string().optional(),
  propinsi: z.string().optional(),
  livingWith: z.enum(['Bersama Orang Tua', 'Wali', 'Asrama', 'Kos']),
  transportation: z.enum(['Jalan Kaki', 'Motor', 'Mobil', 'Angkot/Kendaraan Umum']),
  studentPhone: z.string().optional(),
  originSchool: z.string().optional(),
  applicationPath: z.enum(['Zonasi', 'Prestasi', 'Afirmasi', 'Perpindahan Orang Tua']),
  fatherName: z.string().optional(),
  fatherJob: z.string().optional(),
  motherName: z.string().optional(),
  motherJob: z.string().optional(),
  guardianName: z.string().optional(),
})

export default function ApplicantsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [editingApplicant, setEditingApplicant] = useState<Applicant | null>(null)
  const [applicantToDelete, setApplicantToDelete] = useState<Applicant | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  
  const [localApplicants, setLocalApplicants] = useState<Applicant[]>([])
  const [isDirty, setIsDirty] = useState(false)

  const { toast } = useToast()
  const db = useFirestore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      registrationSequence: "",
      fullName: "", gender: "Laki-laki", NIS: "", NISN: "", NIK: "",
      birthPlace: "", birthDate: "", religion: "Katolik",
      address: "", rt: "", rw: "", kelurahan: "", kecamatan: "", propinsi: "Jawa Barat",
      livingWith: "Bersama Orang Tua", transportation: "Jalan Kaki",
      studentPhone: "", originSchool: "", applicationPath: "Zonasi",
      fatherName: "", fatherJob: "", motherName: "", motherJob: "", guardianName: ""
    },
  })

  const settingsRef = useMemoFirebase(() => db ? doc(db, 'settings', 'system') : null, [db])
  const { data: systemConfig } = useDoc<any>(settingsRef)

  const applicantsQuery = useMemoFirebase(() => {
    if (!db) return null
    return query(collection(db, 'applicants'), orderBy('createdAt', 'desc'), limit(1000))
  }, [db])

  const { data: serverApplicants, loading } = useCollection<Applicant>(applicantsQuery)

  useEffect(() => {
    if (serverApplicants && !isDirty) {
      setLocalApplicants(serverApplicants)
    }
  }, [serverApplicants, isDirty])

  const filteredApplicants = useMemo(() => {
    return localApplicants.filter(a => 
      !a.isDeleted &&
      ((a.fullName || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
       (a.NISN || "").includes(searchTerm) || 
       (a.NIS || "").includes(searchTerm))
    )
  }, [localApplicants, searchTerm])

  const handleEditLocal = (a: Applicant) => {
    setEditingApplicant(a)
    form.reset({
      ...a,
      registrationSequence: a.registrationSequence?.toString() || "",
    } as any)
    setIsDialogOpen(true)
  }

  function onSaveLocal(values: z.infer<typeof formSchema>) {
    const seq = Number(values.registrationSequence) || 0;
    let prefix = (systemConfig?.regPrefix || "REG-").trim();
    if (prefix && !prefix.endsWith('-')) prefix = prefix + '-';
    const regNumber = `${prefix}${seq.toString().padStart(2, '0')}`;

    const applicantData = {
      ...values,
      id: editingApplicant ? editingApplicant.id : `temp-${Date.now()}`,
      registrationSequence: seq,
      registrationNumber: regNumber,
      verificationStatus: editingApplicant?.verificationStatus || 'Lengkap',
      admissionStatus: editingApplicant?.admissionStatus || 'accepted',
      createdAt: editingApplicant?.createdAt || new Date().toISOString(),
      isDeleted: false
    } as Applicant

    if (editingApplicant) {
      setLocalApplicants(prev => prev.map(a => a.id === editingApplicant.id ? applicantData : a))
    } else {
      setLocalApplicants(prev => [applicantData, ...prev])
    }
    
    setIsDirty(true)
    setIsDialogOpen(false)
    toast({ title: "Perubahan Disimpan di Buffer" })
  }

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsImporting(true)
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[]

        const newApps: Applicant[] = jsonData.map((row, idx) => {
          const gender = row['Jenis Kelamin'] === 'P' || row['Jenis Kelamin'] === 'Perempuan' ? 'Perempuan' : 'Laki-laki'
          const seq = localApplicants.length + idx + 1
          return {
            id: `temp-${Date.now()}-${idx}`,
            fullName: row['Nama Lengkap'] || row['Nama'] || 'Tanpa Nama',
            NISN: String(row['NISN'] || ''),
            NIK: String(row['NIK'] || ''),
            gender: gender,
            registrationSequence: seq,
            registrationNumber: `REG-IMP-${seq}`,
            verificationStatus: 'Lengkap',
            admissionStatus: 'accepted',
            applicationPath: 'Zonasi',
            originSchool: row['Sekolah Asal'] || '-',
            createdAt: new Date().toISOString(),
            isDeleted: false
          } as Applicant
        })

        setLocalApplicants(prev => [...newApps, ...prev])
        setIsDirty(true)
        setIsImportOpen(false)
        toast({ title: "Import Berhasil", description: `${newApps.length} murid ditambahkan ke draf.` })
      } catch (err) {
        toast({ variant: "destructive", title: "Gagal Import", description: "Format file tidak dikenali." })
      } finally {
        setIsImporting(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleSyncToCloud = async () => {
    if (!db || !serverApplicants) return
    setIsSyncing(true)
    const batch = writeBatch(db)
    try {
      const serverIdsInLocal = new Set(localApplicants.map(la => la.id))
      
      serverApplicants.forEach(sa => {
        if (!serverIdsInLocal.has(sa.id)) {
          batch.update(doc(db, 'applicants', sa.id), { 
            isDeleted: true, 
            deletedAt: new Date().toISOString() 
          })
        }
      })

      localApplicants.forEach(la => {
        if (la.id.startsWith('temp-')) {
          const newRef = doc(collection(db, 'applicants'))
          const { id, ...data } = la
          batch.set(newRef, data)
        } else {
          const serverVer = serverApplicants.find(sa => sa.id === la.id)
          if (JSON.stringify(serverVer) !== JSON.stringify(la)) {
            batch.update(doc(db, 'applicants', la.id), la as any)
          }
        }
      })
      await batch.commit()
      setIsDirty(false)
      toast({ title: "Sinkronisasi Berhasil" })
    } catch (e) {
      toast({ variant: "destructive", title: "Gagal Sinkronisasi" })
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Data Calon Murid</h1>
          <div className="flex items-center gap-2 mt-1">
             <p className="text-muted-foreground text-sm">Pendaftaran dan seleksi PPDB.</p>
             {isDirty && <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse">Draf Belum Sinkron</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isDirty && (
            <Button onClick={handleSyncToCloud} disabled={isSyncing} className="bg-green-600 gap-2">
              {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
              Sinkronkan ke Cloud
            </Button>
          )}
          <Button variant="outline" onClick={() => setIsImportOpen(true)} className="gap-2 border-primary/30 text-primary">
            <FileSpreadsheet className="w-4 h-4" /> Import Excel
          </Button>
          <Button onClick={() => { setEditingApplicant(null); form.reset(); setIsDialogOpen(true); }} className="gap-2 shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4" /> Tambah Manual
          </Button>
        </div>
      </div>

      <div className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-border/50 flex flex-col md:flex-row items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Cari Nama/NIS/NISN..." className="pl-9 bg-muted/20" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/10 px-3 py-2 rounded-lg border">
             <Info className="w-3.5 h-3.5" /> Total Murid di Draf: <strong>{filteredApplicants.length}</strong>
          </div>
        </div>
        <Table>
          <TableHeader className="bg-primary/5">
            <TableRow>
              <TableHead className="font-bold text-primary w-[60px]">No</TableHead>
              <TableHead className="font-bold text-primary w-[120px]">NIS/NISN</TableHead>
              <TableHead className="font-bold text-primary">Nama Lengkap</TableHead>
              <TableHead className="font-bold text-primary">Asal Sekolah</TableHead>
              <TableHead className="font-bold text-primary">Status</TableHead>
              <TableHead className="text-right font-bold text-primary">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !localApplicants.length ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></TableCell></TableRow>
            ) : filteredApplicants.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">Tidak ada pendaftar aktif.</TableCell></TableRow>
            ) : filteredApplicants.map((a, idx) => {
              const isTemp = a.id.startsWith('temp-')
              return (
                <TableRow key={a.id} className={isTemp ? 'bg-amber-500/5' : ''}>
                  <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell className="font-mono text-xs font-bold text-primary">
                    <div className="flex flex-col">
                      <span>{a.NIS || "-"}</span>
                      <span className="text-accent">{a.NISN || "-"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{a.fullName}</TableCell>
                  <TableCell className="text-sm">{a.originSchool || "-"}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px] uppercase font-bold">{a.verificationStatus}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEditLocal(a)}><Pencil className="w-4 h-4" /></Button>
                      {!isTemp && <Button variant="ghost" size="icon" asChild><Link href={`/dashboard/applicants/${a.id}`}><Eye className="w-4 h-4" /></Link></Button>}
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => { setApplicantToDelete(a); setIsDeleteDialogOpen(true); }}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Import Murid Massal</DialogTitle>
            <DialogDescription>Gunakan file Excel (.xlsx) dengan kolom: Nama Lengkap, NISN, NIK, Jenis Kelamin (L/P), Sekolah Asal.</DialogDescription>
          </DialogHeader>
          <div className="py-6 flex flex-col items-center justify-center border-2 border-dashed rounded-xl bg-muted/5 gap-4">
             <div className="bg-primary/10 p-4 rounded-full">
                <Upload className="w-8 h-8 text-primary" />
             </div>
             <div className="text-center">
                <p className="text-sm font-bold">Pilih File Excel</p>
                <p className="text-xs text-muted-foreground mt-1">Hanya mendukung format .xlsx atau .xls</p>
             </div>
             <input type="file" ref={fileInputRef} onChange={handleImportExcel} accept=".xlsx,.xls" className="hidden" />
             <Button onClick={() => fileInputRef.current?.click()} disabled={isImporting} className="gap-2">
                {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                Pilih File Sekarang
             </Button>
          </div>
          <DialogFooter className="text-center sm:text-center text-[10px] text-muted-foreground italic">
            Data akan masuk ke Buffer. Pastikan Anda menekan tombol "Sinkronkan" untuk menyimpan ke cloud.
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle>{editingApplicant ? 'Edit Data Calon Murid' : 'Pendaftaran Baru'}</DialogTitle>
            <DialogDescription>Lengkapi biodata sesuai dokumen resmi.</DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="flex-1 p-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSaveLocal)} className="space-y-6">
                <Tabs defaultValue="pribadi" className="w-full">
                  <TabsList className="grid w-full grid-cols-3 mb-6">
                    <TabsTrigger value="pribadi">Identitas Pribadi</TabsTrigger>
                    <TabsTrigger value="alamat">Domisili</TabsTrigger>
                    <TabsTrigger value="ortu">Orang Tua</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="pribadi" className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name="fullName" render={({ field }) => (
                        <FormItem className="col-span-2"><FormLabel>Nama Lengkap</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="NIS" render={({ field }) => (
                        <FormItem><FormLabel>NIS</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="gender" render={({ field }) => (
                        <FormItem><FormLabel>Jenis Kelamin</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="Laki-laki">Laki-laki</SelectItem><SelectItem value="Perempuan">Perempuan</SelectItem></SelectContent></Select></FormItem>
                      )} />
                      <FormField control={form.control} name="NISN" render={({ field }) => (
                        <FormItem><FormLabel>NISN</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="NIK" render={({ field }) => (
                        <FormItem><FormLabel>NIK</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="birthPlace" render={({ field }) => (
                        <FormItem><FormLabel>Tempat Lahir</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="birthDate" render={({ field }) => (
                        <FormItem><FormLabel>Tanggal Lahir</FormLabel><FormControl><Input type="date" {...field} value={field.value || ""} /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="applicationPath" render={({ field }) => (
                        <FormItem className="col-span-2"><FormLabel>Jalur Masuk</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="Zonasi">Zonasi</SelectItem><SelectItem value="Prestasi">Prestasi</SelectItem><SelectItem value="Afirmasi">Afirmasi</SelectItem><SelectItem value="Perpindahan Orang Tua">Perpindahan</SelectItem></SelectContent></Select></FormItem>
                      )} />
                      <FormField control={form.control} name="registrationSequence" render={({ field }) => (
                        <FormItem className="col-span-2"><FormLabel>No. Urut Daftar</FormLabel><FormControl><Input type="number" {...field} value={field.value || ""} /></FormControl></FormItem>
                      )} />
                    </div>
                  </TabsContent>

                  <TabsContent value="alamat" className="space-y-4">
                    <FormField control={form.control} name="address" render={({ field }) => (
                      <FormItem><FormLabel>Alamat Lengkap</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl></FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name="rt" render={({ field }) => (
                        <FormItem><FormLabel>RT</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="rw" render={({ field }) => (
                        <FormItem><FormLabel>RW</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="kelurahan" render={({ field }) => (
                        <FormItem><FormLabel>Kelurahan</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="kecamatan" render={({ field }) => (
                        <FormItem><FormLabel>Kecamatan</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl></FormItem>
                      )} />
                    </div>
                  </TabsContent>

                  <TabsContent value="ortu" className="space-y-4">
                    <div className="space-y-4">
                      <div className="p-3 bg-muted/20 rounded-lg border">
                        <h4 className="text-xs font-bold uppercase mb-3 flex items-center gap-2 text-primary"><Eye className="w-3 h-3" /> Data Ayah</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <FormField control={form.control} name="fatherName" render={({ field }) => (
                            <FormItem><FormLabel>Nama Ayah</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl></FormItem>
                          )} />
                          <FormField control={form.control} name="fatherJob" render={({ field }) => (
                            <FormItem><FormLabel>Pekerjaan</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl></FormItem>
                          )} />
                        </div>
                      </div>
                      <div className="p-3 bg-muted/20 rounded-lg border">
                        <h4 className="text-xs font-bold uppercase mb-3 flex items-center gap-2 text-pink-500"><Eye className="w-3 h-3" /> Data Ibu</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <FormField control={form.control} name="motherName" render={({ field }) => (
                            <FormItem><FormLabel>Nama Ibu</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl></FormItem>
                          )} />
                          <FormField control={form.control} name="motherJob" render={({ field }) => (
                            <FormItem><FormLabel>Pekerjaan</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl></FormItem>
                          )} />
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
                <DialogFooter className="pb-6"><Button type="submit" className="w-full">Simpan ke Buffer</Button></DialogFooter>
              </form>
            </Form>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Data?</AlertDialogTitle>
            <AlertDialogDescription>Data akan dipindahkan ke tempat sampah sementara. Klik Sinkron untuk menerapkan perubahan ke Cloud.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={() => { setLocalApplicants(prev => prev.filter(a => a.id !== applicantToDelete?.id)); setIsDirty(true); setIsDeleteDialogOpen(false); }} className="bg-destructive">Hapus</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
