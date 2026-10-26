
"use client"

import { useState, useEffect, useMemo, useRef } from 'react'
import { 
  Users, Trash2, Plus, Pencil, Loader2, CheckCircle2, UserPlus, Search, CloudUpload, CloudOff, RefreshCw, Info, UserMinus, X, GraduationCap, ArrowLeft, ChevronRight, School, Trash, Printer, FileText, FileSpreadsheet, Download, Upload, AlertCircle
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { useCollection, useFirestore, useMemoFirebase, useDoc } from '@/firebase'
import { collection, doc, updateDoc, writeBatch, query, orderBy, getDocs, where, limit } from 'firebase/firestore'
import { Applicant, Classroom } from '@/lib/types'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { useToast } from '@/hooks/use-toast'
import { ScrollArea } from "@/components/ui/scroll-area"
import Link from 'next/link'
import * as XLSX from 'xlsx'

const classFormSchema = z.object({
  name: z.string().min(1, "Nama kelas harus diisi"),
  gradeLevel: z.string().min(1, "Tingkat harus diisi"),
  homeroomTeacher: z.string().optional(),
  capacity: z.string().min(1, "Kapasitas harus diisi"),
})

export default function ClassesPage() {
  const [view, setView] = useState<'grid' | 'students'>('grid')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isAddStudentMode, setIsAddStudentMode] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  
  const [editingClass, setEditingClass] = useState<Classroom | null>(null)
  const [selectedClassForStudents, setSelectedClassForStudents] = useState<Classroom | null>(null)
  
  const [isDirty, setIsDirty] = useState(false)
  const [localClasses, setLocalClasses] = useState<Classroom[]>([])
  const [localApplicants, setLocalApplicants] = useState<Applicant[]>([])
  const [classToDelete, setClassToDelete] = useState<Classroom | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isClearAllDialogOpen, setIsClearAllDialogOpen] = useState(false)
  const [isImportEnrollmentOpen, setIsImportEnrollmentOpen] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  const [studentSearch, setStudentSearch] = useState("")
  const [globalApplicantsForAdd, setGlobalApplicantsForAdd] = useState<Applicant[]>([])
  const [loadingGlobalAdd, setLoadingGlobalAdd] = useState(false)
  const [isLoadingStudents, setIsLoadingStudents] = useState(false)
  
  const { toast } = useToast()
  const db = useFirestore()
  const enrollmentFileInputRef = useRef<HTMLInputElement>(null)

  const settingsRef = useMemoFirebase(() => db ? doc(db, 'settings', 'system') : null, [db])
  const { data: config } = useDoc<any>(settingsRef)

  const classesQuery = useMemoFirebase(() => db ? query(collection(db, 'classes'), orderBy('name', 'asc')) : null, [db])
  const { data: serverClasses, loading: loadingClasses } = useCollection<Classroom>(classesQuery)

  const lastFetchedClassId = useRef<string | null>(null);

  useEffect(() => {
    async function fetchClassStudents() {
      if (!db || !selectedClassForStudents || view !== 'students') return
      
      // Bersihkan list murid dari ID yang null/empty
      const studentIds = (selectedClassForStudents.students || []).filter(Boolean)
      
      if (studentIds.length === 0) {
        setLocalApplicants([])
        lastFetchedClassId.current = selectedClassForStudents.id;
        return
      }

      if (lastFetchedClassId.current === selectedClassForStudents.id && isDirty) return;

      setIsLoadingStudents(true)
      try {
        const chunks = [];
        for (let i = 0; i < studentIds.length; i += 30) {
          chunks.push(studentIds.slice(i, i + 30));
        }

        const results: Applicant[] = [];
        for (const chunk of chunks) {
          const q = query(collection(db, 'applicants'), where('__name__', 'in', chunk));
          const snap = await getDocs(q);
          results.push(...snap.docs.map(d => ({ ...d.data(), id: d.id } as Applicant)));
        }
        
        // Urutkan alfabetis
        const sortedResults = results.sort((a,b) => (a.fullName || "").localeCompare(b.fullName || ""));
        setLocalApplicants(sortedResults)
        
        // Update hitungan jika ada data "hantu" (ID yang ada di kelas tapi tidak ada di applicants)
        if (sortedResults.length !== studentIds.length && !isDirty) {
          const validIds = sortedResults.map(r => r.id);
          const updatedClass = { ...selectedClassForStudents, students: validIds, currentEnrollment: validIds.length };
          setSelectedClassForStudents(updatedClass);
          setLocalClasses(prev => prev.map(c => c.id === updatedClass.id ? updatedClass : c));
        }

        lastFetchedClassId.current = selectedClassForStudents.id;
      } catch (err) {
        console.error("Gagal mengambil data siswa:", err)
      } finally {
        setIsLoadingStudents(false)
      }
    }
    fetchClassStudents()
  }, [db, selectedClassForStudents?.id, view])

  useEffect(() => {
    async function fetchActiveStudents() {
      if (!db || !isAddStudentMode) return
      setLoadingGlobalAdd(true)
      try {
        const q = query(
          collection(db, 'applicants'), 
          where('admissionStatus', 'in', ['accepted', 'graduated']), 
          where('isDeleted', '==', false), 
          limit(2000)
        )
        const snap = await getDocs(q)
        const apps = snap.docs.map(d => ({ ...d.data(), id: d.id } as Applicant))
        setGlobalApplicantsForAdd(apps.sort((a,b) => (a.fullName || "").localeCompare(b.fullName || "")))
      } catch (e) {
        console.error(e)
      } finally {
        setLoadingGlobalAdd(false)
      }
    }
    fetchActiveStudents()
  }, [db, isAddStudentMode])

  useEffect(() => {
    if (serverClasses && !isDirty) {
      setLocalClasses(serverClasses)
    }
  }, [serverClasses, isDirty])

  const form = useForm<z.infer<typeof classFormSchema>>({
    resolver: zodResolver(classFormSchema),
    defaultValues: { name: "", gradeLevel: "7", homeroomTeacher: "", capacity: "32" },
  })

  const onSaveLocal = (values: z.infer<typeof classFormSchema>) => {
    const classData = {
      id: editingClass ? editingClass.id : `temp-${Date.now()}`,
      name: values.name.trim(),
      gradeLevel: parseInt(values.gradeLevel),
      homeroomTeacher: values.homeroomTeacher?.trim() || "",
      capacity: parseInt(values.capacity),
      students: editingClass?.students || [],
      currentEnrollment: (editingClass?.students || []).length
    } as Classroom

    if (editingClass) {
      setLocalClasses(prev => prev.map(c => c.id === editingClass.id ? classData : c))
    } else {
      setLocalClasses(prev => [...prev, classData])
    }

    setIsDirty(true)
    setIsDialogOpen(false)
    toast({ title: "Perubahan Disimpan di Buffer" })
  }

  const handleSyncToCloud = async () => {
    if (!db || !serverClasses) return
    setIsSyncing(true)
    const batch = writeBatch(db)

    try {
      const nextClasses = localClasses.map(lc => {
        // Pastikan list students bersih
        const cleanStudents = Array.from(new Set((lc.students || []).filter(Boolean)));
        const lcClean = { ...lc, students: cleanStudents, currentEnrollment: cleanStudents.length };

        if (lc.id.startsWith('temp-')) {
          const newRef = doc(collection(db, 'classes'))
          const { id, ...data } = lcClean
          batch.set(newRef, { ...data, id: newRef.id })
          return { ...lcClean, id: newRef.id }
        } else {
          const serverVer = serverClasses.find(sc => sc.id === lc.id)
          if (serverVer && JSON.stringify(serverVer) !== JSON.stringify(lcClean)) {
            batch.update(doc(db, 'classes', lc.id), lcClean as any)
          }
          return lcClean
        }
      })

      const classesToDelete = serverClasses.filter(sc => !localClasses.some(lc => lc.id === sc.id))
      classesToDelete.forEach(c => batch.delete(doc(db, 'classes', c.id)))

      await batch.commit()
      setLocalClasses(nextClasses)
      setIsDirty(false)
      toast({ title: "Sinkronisasi Berhasil" })
    } catch (e) {
      toast({ variant: "destructive", title: "Gagal Sinkronisasi" })
    } finally {
      setIsSyncing(false)
    }
  }

  const handleAddStudentToClass = (student: Applicant) => {
    if (!selectedClassForStudents) return
    
    // Cegah ID sementara masuk ke kelas
    if (student.id.startsWith('temp-')) {
      toast({ variant: "destructive", title: "Gagal", description: "Sinkronkan data murid di Data Induk terlebih dahulu." });
      return;
    }

    const currentStudents = selectedClassForStudents.students || []
    if (currentStudents.includes(student.id)) {
      toast({ variant: "destructive", title: "Murid sudah ada di kelas ini" })
      return
    }

    const updatedStudents = Array.from(new Set([...currentStudents, student.id])).filter(Boolean)
    
    if (updatedStudents.length > selectedClassForStudents.capacity) {
      toast({ variant: "destructive", title: "Kapasitas Penuh", description: `Maksimal ${selectedClassForStudents.capacity} murid.` });
    }

    const updatedClass = {
      ...selectedClassForStudents,
      students: updatedStudents,
      currentEnrollment: updatedStudents.length
    }
    
    setLocalClasses(prev => prev.map(c => c.id === updatedClass.id ? updatedClass : c))
    setLocalApplicants(prev => {
      if (prev.some(x => x.id === student.id)) return prev
      return [...prev, student].sort((a,b) => (a.fullName || "").localeCompare(b.fullName || ""))
    })
    setSelectedClassForStudents(updatedClass)
    setIsDirty(true)
  }

  const handleRemoveStudentFromClass = (studentId: string) => {
    if (!selectedClassForStudents) return
    const updatedStudents = (selectedClassForStudents.students || []).filter(id => id !== studentId && id)
    const updatedClass = {
      ...selectedClassForStudents,
      students: updatedStudents,
      currentEnrollment: updatedStudents.length
    }
    setLocalClasses(prev => prev.map(c => c.id === updatedClass.id ? updatedClass : c))
    setLocalApplicants(prev => prev.filter(a => a.id !== studentId))
    setSelectedClassForStudents(updatedClass)
    setIsDirty(true)
    toast({ title: "Murid Dikeluarkan" })
  }

  const handleClearAllStudents = () => {
    if (!selectedClassForStudents) return
    const updatedClass = {
      ...selectedClassForStudents,
      students: [],
      currentEnrollment: 0
    }
    setLocalClasses(prev => prev.map(c => c.id === updatedClass.id ? updatedClass : c))
    setLocalApplicants([])
    setSelectedClassForStudents(updatedClass)
    setIsDirty(true)
    setIsClearAllDialogOpen(false)
    toast({ title: "Kelas Berhasil Dikosongkan" })
  }

  const handleImportEnrollment = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedClassForStudents || !db) return
    const file = e.target.files?.[0]
    if (!file) return

    setIsImporting(true)
    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const jsonData = XLSX.utils.sheet_to_json(sheet) as any[]
        
        const nisnList = jsonData.map(row => String(row['NISN'] || row['nisn'] || '').trim()).filter(Boolean)
        const nameList = jsonData.map(row => String(row['Nama'] || row['Nama Lengkap'] || '').trim().toLowerCase()).filter(Boolean)

        if (nisnList.length === 0 && nameList.length === 0) {
          toast({ variant: "destructive", title: "Format Salah", description: "Kolom NISN atau Nama tidak ditemukan." })
          return
        }

        const q = query(collection(db, 'applicants'), where('admissionStatus', 'in', ['accepted', 'graduated']), where('isDeleted', '==', false))
        const snap = await getDocs(q)
        const allStudents = snap.docs.map(d => ({ ...d.data(), id: d.id } as Applicant))
        
        const matchedIds: string[] = []
        const matchedApps: Applicant[] = []

        allStudents.forEach(s => {
          if (!s.id.startsWith('temp-') && ((s.NISN && nisnList.includes(s.NISN)) || (s.fullName && nameList.includes(s.fullName.toLowerCase())))) {
            matchedIds.push(s.id)
            matchedApps.push(s)
          }
        })

        if (matchedIds.length === 0) {
          toast({ variant: "destructive", title: "Tidak Ada Kecocokan", description: "Tidak menemukan murid permanen yang sesuai di database." })
        } else {
          const finalIds = Array.from(new Set([...(selectedClassForStudents.students || []), ...matchedIds])).filter(Boolean)
          
          if (finalIds.length > selectedClassForStudents.capacity) {
            toast({ variant: "destructive", title: "Melebihi Kapasitas", description: `Total ${finalIds.length} murid, sementara kapasitas hanya ${selectedClassForStudents.capacity}.` });
          }

          const updatedClass = {
            ...selectedClassForStudents,
            students: finalIds,
            currentEnrollment: finalIds.length
          }
          
          setLocalClasses(prev => prev.map(c => c.id === updatedClass.id ? updatedClass : c))
          
          setLocalApplicants(prev => {
            const currentIds = new Set(prev.map(p => p.id))
            const filteredNew = matchedApps.filter(ma => !currentIds.has(ma.id))
            return [...prev, ...filteredNew].sort((a,b) => (a.fullName || "").localeCompare(b.fullName || ""))
          })
          
          setSelectedClassForStudents(updatedClass)
          setIsDirty(true)
          toast({ title: "Import Berhasil", description: `${matchedIds.length} murid ditambahkan ke kelas.` })
        }
      } catch (err) {
        toast({ variant: "destructive", title: "Error", description: "Terjadi kesalahan saat memproses file." })
      } finally {
        setIsImporting(false)
        setIsImportEnrollmentOpen(false)
        if (enrollmentFileInputRef.current) enrollmentFileInputRef.current.value = ''
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const groupedClasses = useMemo(() => {
    const groups: Record<number, Classroom[]> = {}
    localClasses.forEach(cls => {
      const level = cls.gradeLevel
      if (!groups[level]) groups[level] = []
      groups[level].push(cls)
    })
    return groups
  }, [localClasses])

  const sortedLevels = useMemo(() => Object.keys(groupedClasses).map(Number).sort((a, b) => a - b), [groupedClasses])

  if (loadingClasses && !localClasses.length) return <div className="flex justify-center py-24"><Loader2 className="animate-spin text-primary" /></div>

  if (view === 'students' && selectedClassForStudents) {
    const stats = {
      total: localApplicants.length,
      male: localApplicants.filter(s => s.gender === 'Laki-laki').length,
      female: localApplicants.filter(s => s.gender === 'Perempuan').length
    }
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button onClick={() => { setView('grid'); setEditingClass(null); setIsAddStudentMode(false); lastFetchedClassId.current = null; }} className="p-2 hover:bg-muted border rounded-full transition-colors"><ArrowLeft className="w-5 h-5" /></button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-headline font-bold">Kelas {selectedClassForStudents.name}</h1>
                <Badge variant="outline" className="font-mono">Tingkat {selectedClassForStudents.gradeLevel}</Badge>
              </div>
              <div className="flex items-center gap-3 mt-1">
                 <span className="text-xs text-muted-foreground font-bold">DAFTAR AKTIF: {stats.total} SISWA</span>
                 <Separator orientation="vertical" className="h-3" />
                 <span className="text-[10px] text-primary uppercase font-bold">L: {stats.male} • P: {stats.female}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setIsImportEnrollmentOpen(true)} className="gap-2 border-primary/20 text-primary hover:bg-primary/5">
              <FileSpreadsheet className="w-4 h-4" /> Import Excel
            </Button>
            <Button variant="outline" onClick={() => setIsClearAllDialogOpen(true)} className="gap-2 text-destructive border-destructive/20 hover:bg-destructive/5">
              <Trash className="w-4 h-4" /> Kosongkan Kelas
            </Button>
            <Button onClick={() => setIsAddStudentMode(!isAddStudentMode)} className="gap-2 bg-primary">
              {isAddStudentMode ? <X className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
              {isAddStudentMode ? "Tutup Seleksi" : "Tambah 1 per 1"}
            </Button>
          </div>
        </div>

        {isAddStudentMode ? (
          <div className="bg-card border-2 border-primary/20 rounded-2xl overflow-hidden shadow-xl animate-in slide-in-from-top-4 duration-300">
            <div className="p-4 border-b bg-primary/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                 <Search className="w-4 h-4 text-primary" />
                 <h3 className="font-bold text-xs uppercase text-primary tracking-widest">Pilih Murid Aktif</h3>
              </div>
              <div className="relative w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Cari Nama/NISN..." className="pl-9 bg-background h-9 text-xs" value={studentSearch} onChange={e => setStudentSearch(e.target.value)} />
              </div>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[500px] overflow-y-auto">
              {loadingGlobalAdd ? (
                <div className="col-span-full py-12 text-center"><Loader2 className="animate-spin mx-auto text-primary" /></div>
              ) : globalApplicantsForAdd.length === 0 ? (
                <div className="col-span-full py-12 text-center text-muted-foreground italic">Tidak ada murid aktif ditemukan di database.</div>
              ) : globalApplicantsForAdd
                .filter(s => (s.fullName || "").toLowerCase().includes(studentSearch.toLowerCase()) || (s.NISN || "").includes(studentSearch))
                .map(s => {
                  const alreadyInThisClass = (selectedClassForStudents.students || []).includes(s.id);
                  return (
                    <div key={s.id} className={`flex items-center justify-between p-4 rounded-xl border border-border/40 bg-card transition-all group ${alreadyInThisClass ? 'opacity-50 grayscale' : 'hover:bg-primary/5'}`}>
                       <div className="flex flex-col">
                         <span className="text-sm font-bold group-hover:text-primary transition-colors">{s.fullName}</span>
                         <span className="text-[10px] text-muted-foreground font-mono">NISN: {s.NISN || "-"}</span>
                       </div>
                       {alreadyInThisClass ? (
                         <Badge variant="outline" className="text-[8px] bg-green-500/10 text-green-500">Sudah Ada</Badge>
                       ) : (
                         <Button size="sm" variant="ghost" className="h-8 px-4 text-primary hover:bg-primary hover:text-white text-[10px] font-bold" onClick={() => handleAddStudentToClass(s)}>Pilih <Plus className="w-3 h-3 ml-1" /></Button>
                       )}
                    </div>
                  )
                })}
            </div>
          </div>
        ) : (
          <div className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-sm">
            <Table>
              <TableHeader className="bg-muted/50 border-b">
                <TableRow>
                  <TableHead className="w-16 text-center font-bold">No</TableHead>
                  <TableHead className="font-bold w-[150px]">NISN</TableHead>
                  <TableHead className="font-bold">Nama Murid</TableHead>
                  <TableHead className="font-bold">L/P</TableHead>
                  <TableHead className="text-right font-bold pr-8">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingStudents ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-20"><Loader2 className="animate-spin mx-auto text-primary" /> Memuat daftar siswa...</TableCell></TableRow>
                ) : localApplicants.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-32 text-muted-foreground italic flex flex-col items-center gap-4">
                    <GraduationCap className="w-16 h-16 opacity-5" />
                    <p>Belum ada murid di kelas ini. Gunakan fitur Import atau Tambah Manual.</p>
                  </TableCell></TableRow>
                ) : localApplicants.map((s, idx) => (
                  <TableRow key={s.id} className="hover:bg-muted/10 transition-colors h-14">
                    <TableCell className="text-center font-mono text-xs text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{s.NISN || "-"}</TableCell>
                    <TableCell className="font-bold text-sm text-foreground">{s.fullName}</TableCell>
                    <TableCell className="text-xs">{s.gender === 'Laki-laki' ? 'L' : 'P'}</TableCell>
                    <TableCell className="text-right pr-6">
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-destructive hover:bg-destructive/5" onClick={() => handleRemoveStudentFromClass(s.id)}>
                        <UserMinus className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <Dialog open={isImportEnrollmentOpen} onOpenChange={setIsImportEnrollmentOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Import Murid ke Kelas {selectedClassForStudents.name}</DialogTitle>
              <DialogDescription>Gunakan Excel berisi kolom NISN atau Nama Lengkap untuk memasukkan murid ke rombel ini secara otomatis.</DialogDescription>
            </DialogHeader>
            <div className="py-8 flex flex-col items-center justify-center border-2 border-dashed rounded-xl bg-muted/5 gap-4">
               <Upload className="w-8 h-8 text-primary" />
               <input type="file" ref={enrollmentFileInputRef} onChange={handleImportEnrollment} accept=".xlsx,.xls" className="hidden" />
               <Button onClick={() => enrollmentFileInputRef.current?.click()} disabled={isImporting}>
                  {isImporting ? <Loader2 className="animate-spin mr-2" /> : <FileSpreadsheet className="mr-2" />}
                  Unggah Daftar Excel
               </Button>
               <p className="text-[10px] text-muted-foreground italic">Pastikan data NISN/Nama murid sudah ada di Data Induk.</p>
            </div>
          </DialogContent>
        </Dialog>

        <AlertDialog open={isClearAllDialogOpen} onOpenChange={setIsClearAllDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2"><AlertCircle className="w-5 h-5 text-destructive" /> Kosongkan Kelas?</AlertDialogTitle>
              <AlertDialogDescription>Tindakan ini akan mengeluarkan <strong>seluruh murid</strong> dari kelas {selectedClassForStudents.name}. Data profil murid tetap aman di Data Induk Siswa.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Batal</AlertDialogCancel>
              <AlertDialogAction onClick={handleClearAllStudents} className="bg-destructive">Ya, Kosongkan</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Manajemen Kelas</h1>
          <div className="flex items-center gap-2 mt-1">
             <p className="text-muted-foreground">Kelola rombel dan distribusi murid.</p>
             {isDirty && <Badge className="bg-amber-500/10 text-amber-500 animate-pulse gap-1"><CloudOff className="w-3 h-3" /> Ada Draf Baru</Badge>}
          </div>
        </div>
        <div className="flex gap-2">
          {isDirty && (
            <Button onClick={handleSyncToCloud} disabled={isSyncing} className="bg-green-600 gap-2 shadow-lg shadow-green-500/20">
              {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
              Sinkronkan ke Cloud
            </Button>
          )}
          <Button onClick={() => { setEditingClass(null); form.reset(); setIsDialogOpen(true); }} className="gap-2 shadow-lg shadow-primary/20"><Plus className="w-4 h-4" /> Tambah Rombel</Button>
        </div>
      </div>

      <div className="space-y-12">
        {sortedLevels.map(level => (
          <section key={level} className="space-y-4">
            <div className="flex items-center gap-4">
              <Badge className="bg-primary px-3 py-1 text-lg">TINGKAT {level}</Badge>
              <div className="h-px bg-border flex-1"></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {groupedClasses[level].sort((a,b) => (a.name || "").localeCompare(b.name || "", undefined, {numeric: true})).map(cls => {
                const isTemp = cls.id.startsWith('temp-')
                const enrollmentCount = (cls.students || []).filter(Boolean).length;
                return (
                  <Card key={cls.id} className={`border-border/50 relative group transition-all hover:border-primary/50 shadow-sm hover:shadow-md ${isTemp ? 'bg-amber-500/5 border-dashed border-2' : ''}`}>
                    <Button variant="ghost" size="icon" className="absolute top-2 right-2 text-destructive opacity-0 group-hover:opacity-100 hover:bg-destructive/10" onClick={() => { setClassToDelete(cls); setIsDeleteDialogOpen(true); }}><Trash2 className="w-4 h-4" /></Button>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-xl">Kelas {cls.name}</CardTitle>
                      <CardDescription className="flex items-center justify-between mt-1">
                        <div className="flex items-center gap-2">
                          <Users className="w-3.5 h-3.5" />
                          <span className={`font-bold ${enrollmentCount > cls.capacity ? 'text-destructive' : 'text-foreground'}`}>
                            {enrollmentCount}
                          </span> / {cls.capacity} Murid
                        </div>
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="bg-muted/30 p-3 rounded-lg text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                        Wali Kelas: <span className="text-primary block mt-1 text-sm normal-case font-bold">{cls.homeroomTeacher || "Belum Ditentukan"}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-2">
                        <Button variant="outline" className="w-full text-xs gap-2 border-primary/20 hover:bg-primary/5" onClick={() => { setEditingClass(cls); form.reset({...cls, gradeLevel: cls.gradeLevel.toString(), capacity: cls.capacity.toString()}); setIsDialogOpen(true); }}>
                          <Pencil className="w-3.5 h-3.5" /> Edit
                        </Button>
                        <Button variant="default" className="w-full text-xs gap-2 bg-primary shadow-lg shadow-primary/20" onClick={() => { setSelectedClassForStudents(cls); setView('students'); }}>
                          <Users className="w-3.5 h-3.5" /> Murid
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader><DialogTitle className="font-headline">{editingClass ? 'Ubah Informasi Rombel' : 'Tambah Rombongan Belajar'}</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSaveLocal)} className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel className="text-[10px] font-bold uppercase">Nama Kelas</FormLabel><FormControl><Input placeholder="7-A" {...field} value={field.value || ""} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="gradeLevel" render={({ field }) => (
                  <FormItem><FormLabel className="text-[10px] font-bold uppercase">Tingkat</FormLabel><FormControl><Input type="number" {...field} value={field.value || ""} /></FormControl></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="homeroomTeacher" render={({ field }) => (
                <FormItem><FormLabel className="text-[10px] font-bold uppercase">Wali Kelas</FormLabel><FormControl><Input placeholder="Nama Lengkap Guru" {...field} value={field.value || ""} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="capacity" render={({ field }) => (
                <FormItem><FormLabel className="text-[10px] font-bold uppercase">Kapasitas Maksimal</FormLabel><FormControl><Input type="number" {...field} value={field.value || ""} /></FormControl></FormItem>
              )} />
              <DialogFooter className="pt-4"><Button type="submit" className="w-full h-11">Simpan ke Buffer</Button></DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Rombel?</AlertDialogTitle>
            <AlertDialogDescription>Tindakan ini menghapus draf kelas Anda. Murid di dalamnya akan dikeluarkan dari rombel tapi data profil mereka tetap aman di Data Induk.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={() => { setLocalClasses(prev => prev.filter(c => c.id !== classToDelete?.id)); setIsDirty(true); setIsDeleteDialogOpen(false); }} className="bg-destructive">Hapus</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
