
"use client"

import { useState, useEffect, useMemo } from 'react'
import { 
  Users, Trash2, Plus, Pencil, Loader2, CheckCircle2, UserPlus, Search, CloudUpload, CloudOff, RefreshCw, Info, UserMinus, X, GraduationCap, ArrowLeft, ChevronRight, School, Trash, Printer, FileText, FileSpreadsheet, Download
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useCollection, useFirestore, useMemoFirebase, useDoc } from '@/firebase'
import { collection, doc, updateDoc, writeBatch, query, orderBy, getDocs, where } from 'firebase/firestore'
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

const studentEditSchema = z.object({
  fullName: z.string().min(2, "Nama minimal 2 karakter"),
  NIS: z.string().optional(),
  NISN: z.string().optional(),
  gender: z.enum(['Laki-laki', 'Perempuan']),
})

export default function ClassesPage() {
  const [view, setView] = useState<'grid' | 'students'>('grid')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isAddStudentMode, setIsAddStudentMode] = useState(false)
  const [isEditStudentOpen, setIsEditStudentOpen] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  
  const [editingClass, setEditingClass] = useState<Classroom | null>(null)
  const [selectedClassForStudents, setSelectedClassForStudents] = useState<Classroom | null>(null)
  const [editingStudentData, setEditingStudentData] = useState<Applicant | null>(null)
  
  const [isDirty, setIsDirty] = useState(false)
  const [localClasses, setLocalClasses] = useState<Classroom[]>([])
  const [localApplicants, setLocalApplicants] = useState<Applicant[]>([])
  const [classToDelete, setClassToDelete] = useState<Classroom | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isClearAllDialogOpen, setIsClearAllDialogOpen] = useState(false)

  const [isPromotionDialogOpen, setIsPromotionDialogOpen] = useState(false)
  const [classToPromote, setClassToPromote] = useState<Classroom | null>(null)
  
  const [studentSearch, setStudentSearch] = useState("")
  const [globalApplicantsForAdd, setGlobalApplicantsForAdd] = useState<Applicant[]>([])
  const [loadingGlobalAdd, setLoadingGlobalAdd] = useState(false)
  
  const { toast } = useToast()
  const db = useFirestore()

  const settingsRef = useMemoFirebase(() => db ? doc(db, 'settings', 'system') : null, [db])
  const { data: config } = useDoc<any>(settingsRef)

  const classesQuery = useMemoFirebase(() => db ? query(collection(db, 'classes'), orderBy('name', 'asc')) : null, [db])
  const { data: serverClasses, loading: loadingClasses } = useCollection<Classroom>(classesQuery)

  // LAZY FETCH: Hanya ambil murid yang benar-benar ada di kelas yang terpilih
  useEffect(() => {
    async function fetchClassStudents() {
      if (!db || !selectedClassForStudents || view !== 'students' || isDirty) return
      
      const studentIds = selectedClassForStudents.students || []
      if (studentIds.length === 0) {
        setLocalApplicants([])
        return
      }

      // Firestore limits 'in' queries to 30 items. We batch fetch if more.
      const chunks = [];
      for (let i = 0; i < studentIds.length; i += 30) {
        chunks.push(studentIds.slice(i, i + 30));
      }

      const results: Applicant[] = [];
      for (const chunk of chunks) {
        const q = query(collection(db, 'applicants'), where('id', 'in', chunk));
        const snap = await getDocs(q);
        results.push(...snap.docs.map(d => ({ ...d.data(), id: d.id } as Applicant)));
      }
      setLocalApplicants(results)
    }
    fetchClassStudents()
  }, [db, selectedClassForStudents, view, isDirty])

  // LAZY FETCH FOR ADD MODE: Ambil murid yang belum masuk kelas manapun (Status accepted)
  useEffect(() => {
    async function fetchAvailableStudents() {
      if (!db || !isAddStudentMode) return
      setLoadingGlobalAdd(true)
      try {
        const q = query(collection(db, 'applicants'), where('admissionStatus', '==', 'accepted'), where('isDeleted', '==', false), limit(500))
        const snap = await getDocs(q)
        const apps = snap.docs.map(d => ({ ...d.data(), id: d.id } as Applicant))
        
        // Filter yang benar-benar belum punya kelas
        const assignedIds = new Set(localClasses.flatMap(c => c.students || []))
        setGlobalApplicantsForAdd(apps.filter(a => !assignedIds.has(a.id)))
      } catch (e) {
        console.error(e)
      } finally {
        setLoadingGlobalAdd(false)
      }
    }
    fetchAvailableStudents()
  }, [db, isAddStudentMode, localClasses])

  useEffect(() => {
    if (serverClasses && !isDirty) {
      setLocalClasses(serverClasses)
    }
  }, [serverClasses, isDirty])

  const form = useForm<z.infer<typeof classFormSchema>>({
    resolver: zodResolver(classFormSchema),
    defaultValues: { name: "", gradeLevel: "7", homeroomTeacher: "", capacity: "32" },
  })

  const studentEditForm = useForm<z.infer<typeof studentEditSchema>>({
    resolver: zodResolver(studentEditSchema),
    defaultValues: { fullName: "", NIS: "", NISN: "", gender: "Laki-laki" },
  })

  const onSaveLocal = (values: z.infer<typeof classFormSchema>) => {
    const normalizedName = values.name.toLowerCase().trim();
    const isDuplicate = localClasses.some(c => 
      c.name.toLowerCase().trim() === normalizedName && 
      (!editingClass || c.id !== editingClass.id)
    );

    if (isDuplicate) {
      toast({ variant: "destructive", title: "Gagal Menyimpan", description: `Kelas "${values.name}" sudah terdaftar.` });
      return;
    }

    const uniqueStudents = Array.from(new Set(editingClass?.students || []));
    const classData = {
      id: editingClass ? editingClass.id : `temp-${Date.now()}`,
      name: values.name.trim(),
      gradeLevel: parseInt(values.gradeLevel),
      homeroomTeacher: values.homeroomTeacher?.trim() || "",
      capacity: parseInt(values.capacity),
      students: uniqueStudents,
      currentEnrollment: uniqueStudents.length
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

  const handleEditStudent = (student: Applicant) => {
    setEditingStudentData(student)
    studentEditForm.reset({
      fullName: student.fullName,
      NIS: student.NIS || "",
      NISN: student.NISN,
      gender: student.gender
    })
    setIsEditStudentOpen(true)
  }

  const onSaveStudentLocal = (values: z.infer<typeof studentEditSchema>) => {
    if (!editingStudentData) return
    const updated = { ...editingStudentData, ...values, updatedAt: new Date().toISOString() }
    setLocalApplicants(prev => prev.map(a => a.id === editingStudentData.id ? updated : a))
    setIsDirty(true)
    setIsEditStudentOpen(false)
    toast({ title: "Biodata Siswa Diperbarui" })
  }

  const handleDeleteTrigger = (cls: Classroom) => {
    setClassToDelete(cls)
    setIsDeleteDialogOpen(true)
  }

  const executeDeleteLocal = () => {
    if (!classToDelete) return
    setLocalClasses(prev => prev.filter(c => c.id !== classToDelete.id))
    setIsDirty(true)
    setIsDeleteDialogOpen(false)
    setClassToDelete(null)
  }

  const handleClearAllStudents = () => {
    if (!selectedClassForStudents) return
    const updatedClass = {
      ...selectedClassForStudents,
      students: [],
      currentEnrollment: 0
    }
    setLocalClasses(prev => prev.map(c => c.id === updatedClass.id ? updatedClass : c))
    setSelectedClassForStudents(updatedClass)
    setIsDirty(true)
    setIsClearAllDialogOpen(false)
    toast({ title: "Daftar Murid Dikosongkan" })
  }

  const handleSyncToCloud = async () => {
    if (!db || !serverClasses) return
    setIsSyncing(true)
    const batch = writeBatch(db)

    try {
      const nextClasses = localClasses.map(lc => {
        if (lc.id.startsWith('temp-')) {
          const newRef = doc(collection(db, 'classes'))
          const { id, ...data } = lc
          batch.set(newRef, { ...data, id: newRef.id })
          return { ...lc, id: newRef.id }
        } else {
          const serverVer = serverClasses.find(sc => sc.id === lc.id)
          if (serverVer && JSON.stringify(serverVer) !== JSON.stringify(lc)) {
            batch.update(doc(db, 'classes', lc.id), lc as any)
          }
          return lc
        }
      })

      // Sync applicants if changed locally (e.g. edited name in student table)
      localApplicants.forEach(la => {
        batch.update(doc(db, 'applicants', la.id), la as any)
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

  const currentClassStudents = useMemo(() => {
    if (!selectedClassForStudents || !localApplicants) return []
    const studentIds = new Set(selectedClassForStudents.students || [])
    return localApplicants
      .filter(a => studentIds.has(a.id) && !a.isDeleted)
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
  }, [selectedClassForStudents, localApplicants])

  const classGenderStats = useMemo(() => {
    const total = currentClassStudents.length
    const male = currentClassStudents.filter(s => s.gender === 'Laki-laki').length
    const female = total - male
    return { total, male, female }
  }, [currentClassStudents])

  const handleAddStudentToClass = (student: Applicant) => {
    if (!selectedClassForStudents) return
    const currentStudents = selectedClassForStudents.students || []
    if (currentStudents.includes(student.id)) {
      toast({ title: "Murid sudah ada di kelas ini" })
      return
    }
    const updatedStudents = Array.from(new Set([...currentStudents, student.id]))
    const updatedClass = {
      ...selectedClassForStudents,
      students: updatedStudents,
      currentEnrollment: updatedStudents.length
    }
    setLocalClasses(prev => prev.map(c => c.id === updatedClass.id ? updatedClass : c))
    setLocalApplicants(prev => {
      if (prev.some(x => x.id === student.id)) return prev
      return [...prev, student]
    })
    setSelectedClassForStudents(updatedClass)
    setIsDirty(true)
    toast({ title: "Murid Ditambahkan" })
  }

  const handleRemoveStudentFromClass = (studentId: string) => {
    if (!selectedClassForStudents) return
    const updatedStudents = (selectedClassForStudents.students || []).filter(id => id !== studentId)
    const updatedClass = {
      ...selectedClassForStudents,
      students: updatedStudents,
      currentEnrollment: updatedStudents.length
    }
    setLocalClasses(prev => prev.map(c => c.id === updatedClass.id ? updatedClass : c))
    setSelectedClassForStudents(updatedClass)
    setIsDirty(true)
    toast({ title: "Murid Dikeluarkan" })
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
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button onClick={() => { setView('grid'); setEditingClass(null); setIsAddStudentMode(false); }} className="p-2 hover:bg-muted border rounded-full transition-colors"><ArrowLeft className="w-5 h-5" /></button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-headline font-bold">Daftar Murid: Kelas {selectedClassForStudents.name}</h1>
                <Badge variant="outline" className="font-mono">Tingkat {selectedClassForStudents.gradeLevel}</Badge>
              </div>
              <div className="flex items-center gap-3 mt-3">
                 <Badge className="bg-primary/10 text-primary border-primary/20 gap-1.5 py-1 px-3">
                   <Users className="w-3.5 h-3.5" /> TOTAL: {classGenderStats.total}
                 </Badge>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setIsAddStudentMode(!isAddStudentMode)} className="gap-2 bg-primary">
              {isAddStudentMode ? <X className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
              {isAddStudentMode ? "Batal Tambah" : "Tambah Murid"}
            </Button>
          </div>
        </div>

        {isAddStudentMode ? (
          <div className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-sm animate-in slide-in-from-top-4 duration-300">
            <div className="p-4 border-b bg-accent/5 flex items-center justify-between">
              <h3 className="font-bold text-xs uppercase text-accent tracking-widest flex items-center gap-2"><Plus className="w-3 h-3" /> Pilih Murid untuk Masuk Kelas</h3>
              <div className="relative w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Cari Nama/NISN..." className="pl-9 bg-background" value={studentSearch} onChange={e => setStudentSearch(e.target.value)} />
              </div>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[600px] overflow-y-auto">
              {loadingGlobalAdd ? (
                <div className="col-span-full py-12 text-center"><Loader2 className="animate-spin mx-auto text-primary" /></div>
              ) : globalApplicantsForAdd
                .filter(s => s.fullName.toLowerCase().includes(studentSearch.toLowerCase()) || (s.NISN || "").includes(studentSearch))
                .map(s => (
                <div key={s.id} className="flex items-center justify-between p-4 rounded-xl hover:bg-muted/50 border border-border/40 bg-muted/20 transition-all group">
                   <div className="flex flex-col">
                     <span className="text-sm font-bold group-hover:text-primary transition-colors">{s.fullName}</span>
                     <span className="text-[10px] text-muted-foreground font-mono">NISN: {s.NISN || "-"}</span>
                   </div>
                   <Button size="sm" variant="outline" className="h-8 px-4 text-primary border-primary/20 hover:bg-primary hover:text-white text-[10px] font-bold" onClick={() => handleAddStudentToClass(s)}>Pilih <ChevronRight className="w-3 h-3 ml-1" /></Button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50 border-b">
                  <TableRow>
                    <TableHead className="w-16 text-center font-bold">No</TableHead>
                    <TableHead className="font-bold w-[120px]">NISN</TableHead>
                    <TableHead className="font-bold">Nama Murid</TableHead>
                    <TableHead className="font-bold">Status</TableHead>
                    <TableHead className="text-right font-bold pr-8">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentClassStudents.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-32 text-muted-foreground italic flex flex-col items-center gap-4">
                      <GraduationCap className="w-16 h-16 opacity-5" />
                      <p>Belum ada murid di kelas ini.</p>
                    </TableCell></TableRow>
                  ) : currentClassStudents.map((s, idx) => (
                    <TableRow key={s.id} className="hover:bg-muted/10 transition-colors h-16">
                      <TableCell className="text-center font-mono text-xs text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{s.NISN || "-"}</TableCell>
                      <TableCell className="font-bold text-sm text-foreground">{s.fullName}</TableCell>
                      <TableCell>
                        <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-[10px] py-0.5 px-3 font-bold gap-1.5">
                          AKTIF
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" asChild title="Lihat Detail">
                            <Link href={`/dashboard/applicants/${s.id}`}><Search className="w-4 h-4" /></Link>
                          </Button>
                          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-destructive hover:bg-destructive/5" onClick={() => handleRemoveStudentFromClass(s.id)} title="Hapus dari Kelas">
                            <UserMinus className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
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
              {groupedClasses[level].sort((a,b) => a.name.localeCompare(b.name, undefined, {numeric: true})).map(cls => {
                const isTemp = cls.id.startsWith('temp-')
                return (
                  <Card key={cls.id} className={`border-border/50 relative group transition-all hover:border-primary/50 shadow-sm hover:shadow-md ${isTemp ? 'bg-amber-500/5 border-dashed border-2' : ''}`}>
                    <Button variant="ghost" size="icon" className="absolute top-2 right-2 text-destructive opacity-0 group-hover:opacity-100 hover:bg-destructive/10" onClick={() => handleDeleteTrigger(cls)}><Trash2 className="w-4 h-4" /></Button>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-xl">Kelas {cls.name} {isTemp && <RefreshCw className="w-4 h-4 text-amber-500 animate-spin" />}</CardTitle>
                      <CardDescription className="flex items-center justify-between mt-1">
                        <div className="flex items-center gap-2">
                          <Users className="w-3.5 h-3.5" />
                          <span className="font-bold text-foreground">{cls.students?.length || 0}</span> / {cls.capacity} Murid
                        </div>
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="bg-muted/30 p-3 rounded-lg text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                        Wali Kelas: <span className="text-primary block mt-1 text-sm normal-case font-bold">{cls.homeroomTeacher || "Belum Ditentukan"}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-2">
                        <Button variant="outline" className="w-full text-xs gap-2 border-primary/20 hover:bg-primary/5" onClick={() => { setEditingClass(cls); form.reset({...cls, gradeLevel: cls.gradeLevel.toString(), capacity: cls.capacity.toString()}); setIsDialogOpen(true); }}>
                          <Pencil className="w-3.5 h-3.5" /> Edit Kelas
                        </Button>
                        <Button variant="default" className="w-full text-xs gap-2 bg-primary shadow-lg shadow-primary/20" onClick={() => { setSelectedClassForStudents(cls); setView('students'); }}>
                          <Users className="w-3.5 h-3.5" /> Daftar Murid
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
            <AlertDialogTitle className="flex items-center gap-2">Hapus Rombel?</AlertDialogTitle>
            <AlertDialogDescription>Tindakan ini menghapus draf kelas Anda. Murid di dalamnya akan dikeluarkan dari rombel tapi data profil mereka tetap aman di Data Induk.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={executeDeleteLocal} className="bg-destructive text-destructive-foreground">Ya, Hapus Kelas</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
