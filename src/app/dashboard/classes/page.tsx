
"use client"

import { useState, useEffect, useMemo, useRef } from 'react'
import { 
  Users, Trash2, Plus, Pencil, Loader2, CheckCircle2, Search, CloudUpload, CloudOff, Info, UserMinus, X, GraduationCap, ArrowLeft, School, Download, Upload, AlertCircle, ArrowRightLeft, UserPlus, ShieldAlert
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { useCollection, useFirestore, useMemoFirebase, useDoc, useUser } from '@/firebase'
import { collection, doc, updateDoc, writeBatch, query, getDocs, where, orderBy } from 'firebase/firestore'
import { Applicant, Classroom } from '@/lib/types'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import * as XLSX from 'xlsx'

const classFormSchema = z.object({
  name: z.string().min(1, "Nama kelas harus diisi"),
  gradeLevel: z.string().min(1, "Tingkat harus diisi"),
  homeroomTeacher: z.string().optional(),
  capacity: z.string().min(1, "Kapasitas harus diisi"),
})

export default function ClassesPage() {
  const { user, loading: userLoading } = useUser()
  const [view, setView] = useState<'grid' | 'students'>('grid')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isAuditDialogOpen, setIsAuditDialogOpen] = useState(false)
  
  const [editingClass, setEditingClass] = useState<Classroom | null>(null)
  const [selectedClassForStudents, setSelectedClassForStudents] = useState<Classroom | null>(null)
  
  const [isDirty, setIsDirty] = useState(false)
  const [localClasses, setLocalClasses] = useState<Classroom[]>([])
  const [localApplicants, setLocalApplicants] = useState<Applicant[]>([])
  const [idsToTrash, setIdsToTrash] = useState<Set<string>>(new Set())
  
  const [classToDelete, setClassToDelete] = useState<Classroom | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isClearAllDialogOpen, setIsClearAllDialogOpen] = useState(false)
  const [isImportEnrollmentOpen, setIsImportEnrollmentOpen] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false)
  const [studentToMove, setStudentToMove] = useState<Applicant | null>(null)
  const [targetClassId, setTargetClassId] = useState("")
  
  const [isRemoveConfirmOpen, setIsRemoveConfirmOpen] = useState(false)
  const [studentToRemove, setStudentToRemove] = useState<Applicant | null>(null)

  const { toast } = useToast()
  const db = useFirestore()
  const enrollmentFileInputRef = useRef<HTMLInputElement>(null)

  const settingsRef = useMemoFirebase(() => db ? doc(db, 'settings', 'system') : null, [db])
  const { data: config } = useDoc<any>(settingsRef)

  const classesQuery = useMemoFirebase(() => {
    if (!db || userLoading || !user) return null
    return query(collection(db, 'classes'), orderBy('name', 'asc'))
  }, [db, user, userLoading])
  const { data: serverClasses, loading: loadingClasses } = useCollection<Classroom>(classesQuery)

  const lastFetchedClassId = useRef<string | null>(null);

  useEffect(() => {
    async function fetchClassStudents() {
      if (!db || !selectedClassForStudents || view !== 'students' || userLoading) return
      
      const rawIds = (selectedClassForStudents.students || []).filter(Boolean);
      const studentIds = Array.from(new Set(rawIds));
      
      if (studentIds.length === 0) {
        setLocalApplicants([])
        lastFetchedClassId.current = selectedClassForStudents.id;
        return
      }

      if (lastFetchedClassId.current === selectedClassForStudents.id && localApplicants.length > 0 && isDirty) return;

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
        
        const validResults = results.filter(r => !r.isDeleted);
        const sortedResults = validResults.sort((a,b) => (a.fullName || "").localeCompare(b.fullName || ""));
        
        setLocalApplicants(sortedResults)
        lastFetchedClassId.current = selectedClassForStudents.id;
      } catch (err) {
        console.error("Gagal mengambil data siswa:", err)
      } finally {
        setIsLoadingStudents(false)
      }
    }
    fetchClassStudents()
  }, [db, selectedClassForStudents?.id, view, userLoading, isDirty])

  useEffect(() => {
    if (serverClasses && !isDirty) {
      setLocalClasses(serverClasses)
    }
  }, [serverClasses, isDirty])

  const [isLoadingStudents, setIsLoadingStudents] = useState(false)

  const form = useForm<z.infer<typeof classFormSchema>>({
    resolver: zodResolver(classFormSchema),
    defaultValues: { name: "", gradeLevel: "7", homeroomTeacher: "", capacity: "32" },
  })

  const handleCleanupUnassigned = async () => {
    if (!db) return;
    setIsSyncing(true);
    setIsAuditDialogOpen(false);
    
    try {
      const batch = writeBatch(db);
      const classesSnap = await getDocs(collection(db, 'classes'));
      const allAssignedIds = new Set<string>();
      classesSnap.docs.forEach(d => {
        const c = d.data() as Classroom;
        (c.students || []).forEach(id => {
          if (id) allAssignedIds.add(id);
        });
      });

      const studentsSnap = await getDocs(query(collection(db, 'applicants'), where('isDeleted', '==', false)));
      let removedCount = 0;
      
      studentsSnap.docs.forEach(d => {
        if (!allAssignedIds.has(d.id)) {
          batch.update(d.ref, { 
            isDeleted: true, 
            deletedAt: new Date().toISOString() 
          });
          removedCount++;
        }
      });

      if (removedCount > 0) {
        await batch.commit();
        toast({ 
          title: "Audit Selesai", 
          description: `${removedCount} murid tanpa rombel telah dipindahkan ke Tempat Sampah.` 
        });
      } else {
        toast({ title: "Audit Selesai", description: "Seluruh murid aktif sudah memiliki rombel." });
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Audit Gagal" });
    } finally {
      setIsSyncing(false);
    }
  };

  const onSaveLocal = (values: z.infer<typeof classFormSchema>) => {
    const classData = {
      id: editingClass ? editingClass.id : doc(collection(db!, 'classes')).id,
      name: values.name.trim(),
      gradeLevel: parseInt(values.gradeLevel),
      homeroomTeacher: values.homeroomTeacher?.trim() || "",
      capacity: parseInt(values.capacity),
      students: Array.from(new Set((editingClass?.students || []).filter(Boolean))),
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
      const activeSnap = await getDocs(query(collection(db, 'applicants'), where('isDeleted', '==', false)))
      const allActiveIds = new Set(activeSnap.docs.map(d => d.id))

      idsToTrash.forEach(id => {
        batch.update(doc(db, 'applicants', id), { 
          isDeleted: true, 
          deletedAt: new Date().toISOString() 
        })
      })

      localClasses.forEach(lc => {
        const cleanIds = Array.from(new Set((lc.students || []).filter(id => id && allActiveIds.has(id) && !idsToTrash.has(id))));
        
        const lcClean = { 
          ...lc, 
          students: cleanIds, 
          currentEnrollment: cleanIds.length 
        };

        const serverVer = serverClasses.find(sc => sc.id === lc.id)
        if (!serverVer) {
          batch.set(doc(db, 'classes', lc.id), lcClean)
        } else if (JSON.stringify(serverVer) !== JSON.stringify(lcClean)) {
          batch.update(doc(db, 'classes', lc.id), lcClean as any)
        }
      })

      const classesToDelete = serverClasses.filter(sc => !localClasses.some(lc => lc.id === sc.id))
      classesToDelete.forEach(c => batch.delete(doc(db, 'classes', c.id)))

      await batch.commit()
      setIdsToTrash(new Set())
      setIsDirty(false)
      toast({ title: "Sinkronisasi Berhasil" })
    } catch (e) {
      toast({ variant: "destructive", title: "Gagal Sinkronisasi" })
    } finally {
      setIsSyncing(false)
    }
  }

  const handleMoveStudent = () => {
    if (!selectedClassForStudents || !studentToMove || !targetClassId) return
    
    const targetClass = localClasses.find(c => c.id === targetClassId)
    if (!targetClass) return

    const sourceClassUpdated = {
      ...selectedClassForStudents,
      students: (selectedClassForStudents.students || []).filter(id => id !== studentToMove.id),
      currentEnrollment: Math.max(0, (selectedClassForStudents.currentEnrollment || 1) - 1)
    }

    const targetClassUpdated = {
      ...targetClass,
      students: Array.from(new Set([...(targetClass.students || []), studentToMove.id])),
      currentEnrollment: (targetClass.students?.length || 0) + 1
    }

    setLocalClasses(prev => prev.map(c => {
      if (c.id === sourceClassUpdated.id) return sourceClassUpdated
      if (c.id === targetClassUpdated.id) return targetClassUpdated
      return c
    }))

    setLocalApplicants(prev => prev.filter(a => a.id !== studentToMove.id))
    setSelectedClassForStudents(sourceClassUpdated)
    setIsDirty(true)
    setIsMoveDialogOpen(false)
    setStudentToMove(null)
    setTargetClassId("")
    toast({ title: "Siswa Dipindahkan" })
  }

  const handleRemoveStudentFromClass = () => {
    if (!selectedClassForStudents || !studentToRemove) return
    const studentId = studentToRemove.id
    setIdsToTrash(prev => new Set([...prev, studentId]))
    
    const updatedStudents = (selectedClassForStudents.students || []).filter(id => id !== studentId)
    const updatedClass = {
      ...selectedClassForStudents,
      students: updatedStudents,
      currentEnrollment: updatedStudents.length
    }
    setLocalClasses(prev => prev.map(c => c.id === updatedClass.id ? updatedClass : c))
    setLocalApplicants(prev => prev.filter(a => a.id !== studentId))
    setSelectedClassForStudents(updatedClass)
    setIsDirty(true)
    setIsRemoveConfirmOpen(false)
    setStudentToRemove(null)
    toast({ title: "Siswa Dihapus ke Tempat Sampah" })
  }

  const handleClearAllStudents = () => {
    if (!selectedClassForStudents) return
    const currentStudentIds = selectedClassForStudents.students || []
    setIdsToTrash(prev => {
      const next = new Set(prev)
      currentStudentIds.forEach(id => next.add(id))
      return next
    })
    
    const updatedClass = { ...selectedClassForStudents, students: [], currentEnrollment: 0 }
    setLocalClasses(prev => prev.map(c => c.id === updatedClass.id ? updatedClass : c))
    setLocalApplicants([])
    setSelectedClassForStudents(updatedClass)
    setIsDirty(true)
    setIsClearAllDialogOpen(false)
    toast({ title: "Kelas Dikosongkan" })
  }

  const handleDownloadImportTemplate = () => {
    const data = [["No", "NIS", "NISN", "Nama Lengkap", "L/P (Laki-laki/Perempuan)"]]
    const ws = XLSX.utils.aoa_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Template Import Rombel")
    XLSX.writeFile(wb, "Template_Import_Rombel.xlsx")
    toast({ title: "Template Diunduh" })
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
        
        const nisnList = jsonData.map(row => String(row['NISN'] || '').trim()).filter(Boolean)
        const nisList = jsonData.map(row => String(row['NIS'] || '').trim()).filter(Boolean)
        const nameList = jsonData.map(row => String(row['Nama Lengkap'] || row['Nama'] || '').trim().toLowerCase()).filter(Boolean)

        const q = query(collection(db, 'applicants'), where('isDeleted', '==', false))
        const snap = await getDocs(q)
        const allStudents = snap.docs.map(d => ({ ...d.data(), id: d.id } as Applicant))
        
        const matchedIds: string[] = []
        const matchedApps: Applicant[] = []

        allStudents.forEach(s => {
          const isAlreadyInThisClass = (selectedClassForStudents.students || []).includes(s.id);
          if (isAlreadyInThisClass) return;

          const matchNISN = s.NISN && nisnList.includes(s.NISN);
          const matchNIS = s.NIS && nisList.includes(s.NIS);
          const matchName = s.fullName && nameList.includes(s.fullName.toLowerCase());

          if (matchNISN || matchNIS || matchName) {
            if (matchedIds.includes(s.id)) return;
            matchedIds.push(s.id)
            matchedApps.push(s)
          }
        })

        if (matchedIds.length === 0) {
          toast({ variant: "destructive", title: "Tidak Ada Murid Baru", description: "Gunakan template yang benar atau periksa Nama/NISN di Database Utama." })
        } else {
          const finalIds = Array.from(new Set([...(selectedClassForStudents.students || []), ...matchedIds]))
          const updatedClass = {
            ...selectedClassForStudents,
            students: finalIds,
            currentEnrollment: finalIds.length
          }
          
          setLocalClasses(prev => prev.map(c => c.id === updatedClass.id ? updatedClass : c))
          setLocalApplicants(prev => [...prev, ...matchedApps].sort((a,b) => (a.fullName || "").localeCompare(b.fullName || "")))
          setSelectedClassForStudents(updatedClass)
          setIsDirty(true)
          toast({ title: "Import Berhasil", description: `${matchedIds.length} murid ditarik ke rombel.` })
        }
      } catch (err) {
        toast({ variant: "destructive", title: "Error" })
      } finally {
        setIsImporting(false)
        setIsImportEnrollmentOpen(false)
        if (enrollmentFileInputRef.current) enrollmentFileInputRef.current.value = ''
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleExportExcel = () => {
    if (!selectedClassForStudents || localApplicants.length === 0) return
    const data = localApplicants.map((s, idx) => ({
      "No": idx + 1,
      "NIS": s.NIS || "-",
      "NISN": s.NISN || "-",
      "Nama Murid": s.fullName,
      "L/P": s.gender === 'Laki-laki' ? 'L' : 'P'
    }))
    const worksheet = XLSX.utils.json_to_sheet(data)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Daftar Murid")
    XLSX.writeFile(workbook, `Daftar_Siswa_Kelas_${selectedClassForStudents.name}.xlsx`)
  }

  const handleDownloadTemplate = () => {
    if (!selectedClassForStudents) return
    const data = [["No", "Nama Murid", "NISN", "Absensi (%)", "Tugas 1", "Tugas 2", "Tugas 3", "Ulangan", "STS", "SAS"]]
    localApplicants.forEach((s, i) => {
        data.push([(i + 1).toString(), s.fullName, s.NISN || "-", "", "", "", "", "", "", ""])
    })
    const ws = XLSX.utils.aoa_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Template Nilai")
    XLSX.writeFile(wb, `Template_Nilai_Kelas_${selectedClassForStudents.name}.xlsx`)
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
            <button onClick={() => { setView('grid'); setSelectedClassForStudents(null); lastFetchedClassId.current = null; }} className="p-2 hover:bg-muted border rounded-full transition-colors"><ArrowLeft className="w-5 h-5" /></button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-headline font-bold">Kelas {selectedClassForStudents.name}</h1>
                <Badge variant="outline" className="font-mono">Tingkat {selectedClassForStudents.gradeLevel}</Badge>
              </div>
              <div className="flex items-center gap-3 mt-1">
                 <span className="text-xs text-muted-foreground font-bold">TOTAL: {stats.total} SISWA</span>
                 <Separator orientation="vertical" className="h-3" />
                 <span className="text-[10px] text-primary uppercase font-bold">L: {stats.male} • P: {stats.female}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleExportExcel} className="gap-2 border-primary/20 text-primary">
              <Download className="w-4 h-4" /> Unduh Daftar Excel
            </Button>
            <Button variant="outline" onClick={handleDownloadTemplate} className="gap-2 border-green-500/20 text-green-500">
              <Download className="w-4 h-4" /> Template Nilai
            </Button>
            <div className="h-4 w-px bg-border mx-1 hidden md:block" />
            <Button variant="outline" onClick={handleDownloadImportTemplate} className="gap-2 border-primary/30 text-primary hover:bg-primary/5 shadow-sm">
              <Download className="w-4 h-4" /> Unduh Template Import
            </Button>
            <Button onClick={() => setIsImportEnrollmentOpen(true)} className="gap-2 bg-primary">
              <Upload className="w-4 h-4" /> Import Excel
            </Button>
            <Button variant="outline" onClick={() => setIsClearAllDialogOpen(true)} className="gap-2 text-destructive border-destructive/20 hover:bg-destructive/5">
              <Trash className="w-4 h-4" /> Kosongkan Kelas
            </Button>
          </div>
        </div>

        <div className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-sm">
          <Table>
            <TableHeader className="bg-muted/50 border-b">
              <TableRow>
                <TableHead className="w-16 text-center font-bold">No</TableHead>
                <TableHead className="font-bold w-[180px]">NIS / NISN</TableHead>
                <TableHead className="font-bold">Nama Murid</TableHead>
                <TableHead className="font-bold">L/P</TableHead>
                <TableHead className="text-right font-bold pr-8">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingStudents ? (
                <TableRow><TableCell colSpan={5} className="text-center py-20"><Loader2 className="animate-spin mx-auto text-primary" /></TableCell></TableRow>
              ) : localApplicants.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-32 text-muted-foreground italic">Belum ada murid di kelas ini. Gunakan Import Excel untuk menarik data dari Database Utama.</TableCell></TableRow>
              ) : localApplicants.map((s, idx) => (
                <TableRow key={s.id} className="hover:bg-muted/10 h-14">
                  <TableCell className="text-center font-mono text-xs text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell>
                    <div className="flex flex-col font-mono text-[11px]">
                       <span className="font-bold text-primary">{s.NIS || "-"}</span>
                       <span className="text-accent">{s.NISN || "-"}</span>
                    </div>
                  </TableCell>
                  <TableCell><span className="font-bold text-sm">{s.fullName}</span></TableCell>
                  <TableCell className="text-xs">{s.gender === 'Laki-laki' ? 'L' : 'P'}</TableCell>
                  <TableCell className="text-right pr-6">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" className="text-primary gap-1.5" onClick={() => { setStudentToMove(s); setIsMoveDialogOpen(true); }}><ArrowRightLeft className="w-3.5 h-3.5" /> Pindah</Button>
                      <Button variant="ghost" size="sm" className="text-destructive gap-1.5" onClick={() => { setStudentToRemove(s); setIsRemoveConfirmOpen(true); }}><UserMinus className="w-3.5 h-3.5" /> Hapus</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <Dialog open={isMoveDialogOpen} onOpenChange={setIsMoveDialogOpen}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader><DialogTitle>Pindahkan Kelas</DialogTitle><DialogDescription>Pindahkan <strong>{studentToMove?.fullName}</strong> ke rombel lain.</DialogDescription></DialogHeader>
            <div className="py-4 space-y-4">
               <div className="space-y-2">
                 <Label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Pilih Kelas Tujuan</Label>
                 <Select value={targetClassId} onValueChange={setTargetClassId}><SelectTrigger className="h-12"><SelectValue placeholder="Pilih Rombongan Belajar" /></SelectTrigger><SelectContent>{localClasses.filter(c => c.id !== selectedClassForStudents.id).sort((a,b) => a.name.localeCompare(b.name, undefined, {numeric: true})).map(c => (<SelectItem key={c.id} value={c.id}>Kelas {c.name} (Tingkat {c.gradeLevel})</SelectItem>))}</SelectContent></Select>
               </div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setIsMoveDialogOpen(false)}>Batal</Button><Button onClick={handleMoveStudent} disabled={!targetClassId}>Proses Pindah</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={isRemoveConfirmOpen} onOpenChange={setIsRemoveConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle className="flex items-center gap-2"><AlertCircle className="w-5 h-5 text-destructive" /> Konfirmasi Penghapusan</AlertDialogTitle><AlertDialogDescription>Apakah Anda yakin ingin menghapus <strong>{studentToRemove?.fullName}</strong>? Murid akan dipindahkan ke **Tempat Sampah** database.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel onClick={() => setStudentToRemove(null)}>Batal</AlertDialogCancel><AlertDialogAction onClick={handleRemoveStudentFromClass} className="bg-destructive">Ya, Hapus</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={isImportEnrollmentOpen} onOpenChange={setIsImportEnrollmentOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Import Murid Massal</DialogTitle><DialogDescription>Daftarkan murid dari Database Utama ke Kelas {selectedClassForStudents.name}.</DialogDescription></DialogHeader>
            <div className="py-8 flex flex-col items-center justify-center border-2 border-dashed rounded-xl bg-muted/5 gap-4">
               <Upload className="w-8 h-8 text-primary" />
               <input type="file" ref={enrollmentFileInputRef} onChange={handleImportEnrollment} accept=".xlsx,.xls" className="hidden" />
               <Button onClick={() => enrollmentFileInputRef.current?.click()} disabled={isImporting}>{isImporting ? <Loader2 className="animate-spin mr-2" /> : <FileSpreadsheet className="mr-2" />} Pilih File Excel</Button>
               <Button variant="outline" onClick={handleDownloadImportTemplate} className="text-xs h-8 gap-2"><Download className="w-3 h-3" /> Unduh Template</Button>
            </div>
          </DialogContent>
        </Dialog>

        <AlertDialog open={isClearAllDialogOpen} onOpenChange={setIsClearAllDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Kosongkan Kelas?</AlertDialogTitle><AlertDialogDescription>Seluruh murid akan dikeluarkan dari rombel dan dipindahkan ke **Tempat Sampah**.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={handleClearAllStudents} className="bg-destructive">Ya, Kosongkan</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Manajemen Rombel</h1>
          <div className="flex items-center gap-2 mt-1">
             <p className="text-muted-foreground">Kelola pembagian kelas dan distribusi murid.</p>
             {isDirty && <Badge className="bg-amber-500/10 text-amber-500 animate-pulse gap-1"><CloudOff className="w-3 h-3" /> Ada Draf Baru</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setIsAuditDialogOpen(true)} className="gap-2 border-destructive/20 text-destructive hover:bg-destructive/5" disabled={isSyncing}><ShieldAlert className="w-4 h-4" /> Audit Database</Button>
          <div className="w-px h-8 bg-border mx-1 hidden md:block"></div>
          {isDirty && (
            <Button onClick={handleSyncToCloud} disabled={isSyncing} className="bg-green-600 gap-2 shadow-lg shadow-green-500/20">
              {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />} Sinkronkan ke Cloud
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
                const enrollmentCount = (cls.students || []).length;
                return (
                  <Card key={cls.id} className="border-border/50 relative group transition-all hover:border-primary/50 shadow-sm">
                    <Button variant="ghost" size="icon" className="absolute top-2 right-2 text-destructive opacity-0 group-hover:opacity-100" onClick={() => { setClassToDelete(cls); setIsDeleteDialogOpen(true); }}><Trash2 className="w-4 h-4" /></Button>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-xl">Kelas {cls.name}</CardTitle>
                      <CardDescription className="flex items-center justify-between mt-1">
                        <div className="flex items-center gap-2"><Users className="w-3.5 h-3.5" /><span className={`font-bold ${enrollmentCount > cls.capacity ? 'text-destructive' : 'text-foreground'}`}>{enrollmentCount}</span> / {cls.capacity} Murid</div>
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="bg-muted/30 p-3 rounded-lg text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Wali Kelas: <span className="text-primary block mt-1 text-sm normal-case font-bold">{cls.homeroomTeacher || "Belum Ditentukan"}</span></div>
                      <div className="grid grid-cols-2 gap-2 pt-2">
                        <Button variant="outline" className="w-full text-xs gap-2 border-primary/20" onClick={() => { setEditingClass(cls); form.reset({...cls, gradeLevel: cls.gradeLevel.toString(), capacity: cls.capacity.toString()}); setIsDialogOpen(true); }}><Pencil className="w-3.5 h-3.5" /> Edit Info</Button>
                        <Button variant="default" className="w-full text-xs gap-2 bg-primary" onClick={() => { setSelectedClassForStudents(cls); setView('students'); }}><Users className="w-3.5 h-3.5" /> Lihat Murid</Button>
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
          <DialogHeader><DialogTitle>{editingClass ? 'Ubah Informasi Rombel' : 'Tambah Rombongan Belajar'}</DialogTitle></DialogHeader>
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

      <AlertDialog open={isAuditDialogOpen} onOpenChange={setIsAuditDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle className="flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-destructive" /> Audit Database & Bersihkan</AlertDialogTitle><AlertDialogDescription>Tindakan ini akan memindahkan setiap murid yang **TIDAK terdaftar di rombel manapun** ke Tempat Sampah.<br/><br/>Tujuannya agar angka di Dasbor hanya menampilkan data riil murid yang sudah memiliki kelas.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={handleCleanupUnassigned} className="bg-destructive">Ya, Bersihkan</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Hapus Rombel?</AlertDialogTitle><AlertDialogDescription>Tindakan ini menghapus draf kelas Anda dari sistem.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={() => { setLocalClasses(prev => prev.filter(c => c.id !== classToDelete?.id)); setIsDirty(true); setIsDeleteDialogOpen(false); }} className="bg-destructive">Hapus</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
