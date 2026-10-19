
"use client"

import { useState, useMemo, useRef, useEffect } from 'react'
import { 
  Search, Plus, Loader2, Camera, Eye, User, Home, MapPin, Phone, Users as UsersIcon, Pencil, Trash2, Scale, Ruler, Clock, Hash, FileUp, FileSpreadsheet, FileText, CheckCircle2, AlertTriangle, Upload, AlertCircle, Download, FileCode, Check, Settings2, CloudUpload, CloudOff, RefreshCw, Info
} from "lucide-react"
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
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
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import Link from 'next/link'
import { useCollection, useFirestore, useMemoFirebase, useDoc } from '@/firebase'
import { collection, query, orderBy, addDoc, limit, doc, updateDoc, writeBatch } from 'firebase/firestore'
import { Applicant } from '@/lib/types'
import { errorEmitter } from '@/firebase/error-emitter'
import { FirestorePermissionError } from '@/firebase/errors'
import { useToast } from '@/hooks/use-toast'
import { extractFormData } from '@/ai/flows/extract-form-data-flow'
import { extractFromFile } from '@/ai/flows/extract-from-file-flow'
import * as XLSX from 'xlsx'

const formSchema = z.object({
  registrationSequence: z.string().min(1, "No. Urut harus diisi"),
  fullName: z.string().min(2, "Nama minimal 2 karakter"),
  gender: z.enum(['Laki-laki', 'Perempuan']),
  NISN: z.string().optional(),
  NIK: z.string().optional(),
  familyCardNumber: z.string().optional(),
  birthPlace: z.string().optional(),
  birthDate: z.string().optional(),
  aktaLahirNumber: z.string().optional(),
  religion: z.string().optional(),
  address: z.string().optional(),
  rt: z.string().optional(),
  rw: z.string().optional(),
  kelurahan: z.string().optional(),
  kecamatan: z.string().optional(),
  propinsi: z.string().optional(),
  livingWith: z.enum(['Bersama Orang Tua', 'Wali', 'Asrama', 'Kos']),
  transportation: z.enum(['Jalan Kaki', 'Motor', 'Mobil', 'Angkot/Kendaraan Umum']),
  childOrder: z.string().optional(),
  studentPhone: z.string().optional(),
  numberOfSiblings: z.string().optional(),
  heightCm: z.string().optional(),
  weightKg: z.string().optional(),
  travelTimeMinutes: z.string().optional(),
  welfareType: z.enum(['PIP', 'PKH', 'KKS', 'KPS', 'Tidak Ada']),
  welfareCardNumber: z.string().optional(),
  welfareCardName: z.string().optional(),
  fatherName: z.string().optional(),
  fatherNIK: z.string().optional(),
  fatherBirthYear: z.string().optional(),
  fatherEducation: z.string().optional(),
  fatherJob: z.string().optional(),
  fatherIncome: z.string().optional(),
  motherName: z.string().optional(),
  motherNIK: z.string().optional(),
  motherBirthYear: z.string().optional(),
  motherEducation: z.string().optional(),
  motherJob: z.string().optional(),
  motherIncome: z.string().optional(),
  guardianName: z.string().optional(),
  guardianNIK: z.string().optional(),
  guardianBirthYear: z.string().optional(),
  guardianEducation: z.string().optional(),
  guardianJob: z.string().optional(),
  guardianIncome: z.string().optional(),
  originSchool: z.string().optional(),
  applicationPath: z.enum(['Zonasi', 'Prestasi', 'Afirmasi', 'Perpindahan Orang Tua']),
})

const TEMPLATE_COLUMNS = [
  { id: 'registrationNumber', label: 'No. Urut Pendaftaran (No Reg)' },
  { id: 'NISN', label: 'NISN' },
  { id: 'NIK', label: 'NIK' },
  { id: 'fullName', label: 'Nama Lengkap' },
  { id: 'gender', label: 'Jenis Kelamin' },
  { id: 'originSchool', label: 'Sekolah Asal' },
  { id: 'applicationPath', label: 'Jalur Masuk' },
  { id: 'academicScore', label: 'Skor Akademik' },
  { id: 'distanceToSchoolKm', label: 'Jarak (Km)' },
  { id: 'verificationStatus', label: 'Status Verifikasi' },
  { id: 'admissionStatus', label: 'Hasil Seleksi' },
  { id: 'parentName', label: 'Nama Orang Tua' },
  { id: 'studentPhone', label: 'No. Telepon' },
  { id: 'address', label: 'Alamat' },
  { id: 'kelurahan', label: 'Kelurahan' },
  { id: 'kecamatan', label: 'Kecamatan' },
  { id: 'propinsi', label: 'Provinsi' },
  { id: 'birthDate', label: 'Tanggal Lahir' },
  { id: 'religion', label: 'Agama' },
]

export default function ApplicantsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [importData, setImportData] = useState<any[]>([])
  const [editingApplicant, setEditingApplicant] = useState<Applicant | null>(null)
  const [applicantToDelete, setApplicantToDelete] = useState<Applicant | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleteAllDialogOpen, setIsDeleteAllDialogOpen] = useState(false)
  const [selectedTemplateCols, setSelectedTemplateCols] = useState<string[]>(TEMPLATE_COLUMNS.map(c => c.id))
  
  const [localApplicants, setLocalApplicants] = useState<Applicant[]>([])
  const [isDirty, setIsDirty] = useState(false)

  const scanInputRef = useRef<HTMLInputElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()
  const db = useFirestore()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      registrationSequence: "",
      fullName: "", gender: "Laki-laki", NISN: "", NIK: "", familyCardNumber: "",
      birthPlace: "", birthDate: "", aktaLahirNumber: "", religion: "Katolik",
      address: "", rt: "", rw: "", kelurahan: "", kecamatan: "", propinsi: "Jawa Barat",
      livingWith: "Bersama Orang Tua", transportation: "Jalan Kaki",
      childOrder: "1", studentPhone: "", numberOfSiblings: "0",
      heightCm: "", weightKg: "", travelTimeMinutes: "", welfareType: "Tidak Ada",
      welfareCardNumber: "", welfareCardName: "",
      originSchool: "", applicationPath: "Zonasi",
      fatherName: "", fatherNIK: "", fatherBirthYear: "", fatherEducation: "", fatherJob: "", fatherIncome: "",
      motherName: "", motherNIK: "", motherBirthYear: "", motherEducation: "", motherJob: "", motherIncome: "",
      guardianName: "", guardianNIK: "", guardianBirthYear: "", guardianEducation: "", guardianJob: "", guardianIncome: ""
    },
  })

  const settingsRef = useMemoFirebase(() => db ? doc(db, 'settings', 'system') : null, [db])
  const { data: systemConfig } = useDoc<any>(settingsRef)

  const applicantsQuery = useMemoFirebase(() => {
    if (!db) return null
    return query(collection(db, 'applicants'), orderBy('createdAt', 'desc'), limit(2000))
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
      ((a.fullName || "").toLowerCase().includes(searchTerm.toLowerCase()) || (a.NISN || "").includes(searchTerm))
    )
  }, [localApplicants, searchTerm])

  const handleAddNew = () => {
    setEditingApplicant(null)
    const lastSeq = localApplicants.reduce((max, a) => Math.max(max, a.registrationSequence || 0), 0) || 0
    form.reset({
      registrationSequence: (lastSeq + 1).toString(),
      fullName: "", gender: "Laki-laki", NISN: "", NIK: "", familyCardNumber: "",
      birthPlace: "", birthDate: "", aktaLahirNumber: "", religion: "Katolik",
      address: "", rt: "", rw: "", kelurahan: "", kecamatan: "", propinsi: "Jawa Barat",
      livingWith: "Bersama Orang Tua", transportation: "Jalan Kaki",
      childOrder: "1", studentPhone: "", numberOfSiblings: "0",
      heightCm: "", weightKg: "", travelTimeMinutes: "", welfareType: "Tidak Ada",
      welfareCardNumber: "", welfareCardName: "",
      originSchool: "", applicationPath: "Zonasi",
      fatherName: "", fatherNIK: "", fatherBirthYear: "", fatherEducation: "", fatherJob: "", fatherIncome: "",
      motherName: "", motherNIK: "", motherBirthYear: "", motherEducation: "", motherJob: "", motherIncome: "",
      guardianName: "", guardianNIK: "", guardianBirthYear: "", guardianEducation: "", guardianJob: "", guardianIncome: ""
    })
    setIsDialogOpen(true)
  }

  const handleEditLocal = (a: Applicant) => {
    setEditingApplicant(a)
    form.reset({
      ...a,
      registrationSequence: a.registrationSequence?.toString() || "",
      childOrder: a.childOrder?.toString() || "",
      numberOfSiblings: a.numberOfSiblings?.toString() || "",
      heightCm: a.heightCm?.toString() || "",
      weightKg: a.weightKg?.toString() || "",
      travelTimeMinutes: a.travelTimeMinutes?.toString() || "",
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
      childOrder: Number(values.childOrder) || 0,
      numberOfSiblings: Number(values.numberOfSiblings) || 0,
      heightCm: Number(values.heightCm) || 0,
      weightKg: Number(values.weightKg) || 0,
      travelTimeMinutes: Number(values.travelTimeMinutes) || 0,
      parentName: values.livingWith === 'Wali' ? (values.guardianName || values.fatherName || "") : (values.fatherName || values.motherName || ""),
      parentPhone: values.studentPhone || "",
      verificationStatus: editingApplicant?.verificationStatus || 'Belum Diverifikasi',
      admissionStatus: editingApplicant?.admissionStatus || 'pending',
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
    toast({ title: "Perubahan Disimpan di Buffer", description: "Klik Sinkronkan untuk mengirim ke database." })
  }

  const handleDeleteTrigger = (a: Applicant) => {
    setApplicantToDelete(a)
    setIsDeleteDialogOpen(true)
  }

  const executeDeleteLocal = () => {
    if (!applicantToDelete) return
    setLocalApplicants(prev => prev.filter(a => a.id !== applicantToDelete.id))
    setIsDirty(true)
    setIsDeleteDialogOpen(false)
    setApplicantToDelete(null)
    toast({ title: "Dihapus dari draf" })
  }

  const handleSyncToCloud = async () => {
    if (!db || !serverApplicants) return
    setIsSyncing(true)
    const batch = writeBatch(db)

    try {
      // 1. Delete applicants in server but not in local
      const toDelete = serverApplicants.filter(sa => !localApplicants.some(la => la.id === sa.id))
      toDelete.forEach(a => {
        batch.delete(doc(db, 'applicants', a.id))
      })

      // 2. Add/Update
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

  const handleDownloadTemplate = async (format: 'csv' | 'excel' | 'pdf') => {
    const selectedHeaders = TEMPLATE_COLUMNS.filter(c => selectedTemplateCols.includes(c.id)).map(c => c.label)
    if (format === 'excel') {
      const worksheet = XLSX.utils.json_to_sheet([])
      XLSX.utils.sheet_add_aoa(worksheet, [selectedHeaders], { origin: "A1" })
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, "Template")
      XLSX.writeFile(workbook, "Template_Pendaftaran.xlsx")
    }
    setIsTemplateDialogOpen(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Data Calon Murid</h1>
          <div className="flex items-center gap-2 mt-1">
             <p className="text-muted-foreground text-sm">Manajemen data sesuai standar Dapodik.</p>
             {isDirty ? (
               <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse gap-1"><CloudOff className="w-3 h-3" /> Ada Draf Belum Sinkron</Badge>
             ) : (
               <Badge className="bg-green-500/10 text-green-500 border-green-500/20 gap-1"><CheckCircle2 className="w-3 h-3" /> Tersinkron</Badge>
             )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isDirty && (
            <Button onClick={handleSyncToCloud} disabled={isSyncing} className="bg-green-600 hover:bg-green-700 shadow-lg shadow-green-500/20 gap-2">
              {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
              Sinkronkan ke Cloud
            </Button>
          )}
          <Button variant="outline" onClick={() => setIsTemplateDialogOpen(true)} className="gap-2 border-accent/20 text-accent">
            <Download className="w-4 h-4" /> Unduh Template
          </Button>
          <Button onClick={handleAddNew} className="gap-2 shadow-lg shadow-primary/20"><Plus className="w-4 h-4" /> Murid Baru</Button>
        </div>
      </div>

      <div className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-border/50 flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Cari Nama atau NISN..." className="pl-9 bg-muted/20" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
        </div>
        <Table>
          <TableHeader className="bg-primary/5">
            <TableRow>
              <TableHead className="font-bold text-primary">No. Reg</TableHead>
              <TableHead className="font-bold text-primary">Nama Lengkap</TableHead>
              <TableHead className="font-bold text-primary">Asal Sekolah</TableHead>
              <TableHead className="font-bold text-primary">Jalur</TableHead>
              <TableHead className="font-bold text-primary">Status</TableHead>
              <TableHead className="text-right font-bold text-primary">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !localApplicants.length ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></TableCell></TableRow>
            ) : filteredApplicants.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">Tidak ada pendaftar.</TableCell></TableRow>
            ) : filteredApplicants.map((a) => {
              const isTemp = a.id.startsWith('temp-')
              return (
                <TableRow key={a.id} className={`hover:bg-muted/10 transition-colors ${isTemp ? 'bg-amber-500/5 border-dashed border-2' : ''}`}>
                  <TableCell className="font-mono text-xs font-bold">
                    <div className="flex items-center gap-2">
                      {a.registrationNumber}
                      {isTemp && <RefreshCw className="w-3 h-3 text-amber-500 animate-spin" />}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{a.fullName}</TableCell>
                  <TableCell className="text-sm">{a.originSchool || "-"}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px] font-bold">{a.applicationPath}</Badge></TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px] uppercase font-bold">{a.verificationStatus}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="hover:text-primary" onClick={() => handleEditLocal(a)}><Pencil className="w-4 h-4" /></Button>
                      {!isTemp && <Button variant="ghost" size="icon" asChild><Link href={`/dashboard/applicants/${a.id}`}><Eye className="w-4 h-4" /></Link></Button>}
                      <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => handleDeleteTrigger(a)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <div className="bg-accent/5 p-4 rounded-xl border border-accent/20 flex gap-4">
         <Info className="w-5 h-5 text-accent shrink-0 mt-0.5" />
         <div className="text-xs text-muted-foreground leading-relaxed">
           Sistem menggunakan <strong>Mode Offline Buffer</strong>. Anda dapat mengelola data murid secara bebas tanpa biaya Firestore. Pastikan menekan tombol <strong>"Sinkronkan ke Cloud"</strong> untuk menyimpan perubahan permanen ke server.
         </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingApplicant ? 'Edit Data Murid' : 'Pendaftaran Murid Baru'}</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSaveLocal)} className="space-y-6 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                   <h3 className="font-bold text-sm border-b pb-1 text-primary uppercase">I. Identitas Pokok</h3>
                   <FormField control={form.control} name="fullName" render={({ field }) => (
                     <FormItem><FormLabel>Nama Lengkap</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                   )} />
                   <div className="grid grid-cols-2 gap-4">
                     <FormField control={form.control} name="registrationSequence" render={({ field }) => (
                       <FormItem><FormLabel>No. Urut (Daftar)</FormLabel><FormControl><Input type="number" {...field} value={field.value || ""} /></FormControl></FormItem>
                     )} />
                     <FormField control={form.control} name="gender" render={({ field }) => (
                       <FormItem><FormLabel>Jenis Kelamin</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="Laki-laki">Laki-laki</SelectItem><SelectItem value="Perempuan">Perempuan</SelectItem></SelectContent></Select></FormItem>
                     )} />
                   </div>
                </div>
                <div className="space-y-4">
                   <h3 className="font-bold text-sm border-b pb-1 text-primary uppercase">II. Dokumen Legal</h3>
                   <div className="grid grid-cols-2 gap-4">
                     <FormField control={form.control} name="NISN" render={({ field }) => (
                       <FormItem><FormLabel>NISN</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl></FormItem>
                     )} />
                     <FormField control={form.control} name="NIK" render={({ field }) => (
                       <FormItem><FormLabel>NIK</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl></FormItem>
                     )} />
                   </div>
                   <FormField control={form.control} name="applicationPath" render={({ field }) => (
                     <FormItem><FormLabel>Jalur Masuk</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="Zonasi">Zonasi</SelectItem><SelectItem value="Prestasi">Prestasi</SelectItem><SelectItem value="Afirmasi">Afirmasi</SelectItem><SelectItem value="Perpindahan Orang Tua">Perpindahan</SelectItem></SelectContent></Select></FormItem>
                   )} />
                </div>
              </div>
              <DialogFooter><Button type="submit" className="w-full">Simpan ke Buffer</Button></DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-destructive" /> Hapus dari draf?</AlertDialogTitle>
            <AlertDialogDescription>Data murid akan dihapus dari daftar sementara Anda. Ingat untuk Sinkron agar perubahan ini sampai ke server.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={executeDeleteLocal} className="bg-destructive text-destructive-foreground">Ya, Hapus</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle>Unduh Template Impor</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 gap-4 py-4">
            <Button onClick={() => handleDownloadTemplate('excel')} variant="outline" className="gap-2 border-green-500/20 text-green-500"><FileSpreadsheet className="w-4 h-4" /> Excel (.xlsx)</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
