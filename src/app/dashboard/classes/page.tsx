
"use client"

import { useState, useEffect, useMemo } from 'react'
import { 
  Users, Trash2, Plus, Pencil, Eye, FileSpreadsheet, Loader2, CheckCircle2, UserPlus, Search, Upload, Download, CloudUpload, CloudOff, RefreshCw, Info, UserMinus, X, GraduationCap, ArrowLeft, ChevronRight, Hash, ArrowUpCircle, School
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useCollection, useFirestore, useMemoFirebase, useDoc } from '@/firebase'
import { collection, doc, updateDoc, writeBatch, query, orderBy } from 'firebase/firestore'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const classFormSchema = z.object({
  name: z.string().min(1, "Nama kelas harus diisi"),
  gradeLevel: z.string().min(1, "Tingkat harus diisi"),
  homeroomTeacher: z.string().optional(),
  capacity: z.string().min(1, "Kapasitas harus diisi"),
})

const studentEditSchema = z.object({
  fullName: z.string().min(2, "Nama minimal 2 karakter"),
  NISN: z.string().optional(),
  gender: z.enum(['Laki-laki', 'Perempuan']),
})

export default function ClassesPage() {
  const [view, setView] = useState<'grid' | 'students'>('grid')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isAddStudentMode, setIsAddStudentMode] = useState(false)
  const [isEditStudentOpen, setIsEditStudentOpen] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  
  const [editingClass, setEditingClass] = useState<Classroom | null>(null)
  const [selectedClassForStudents, setSelectedClassForStudents] = useState<Classroom | null>(null)
  const [editingStudentData, setEditingStudentData] = useState<Applicant | null>(null)
  
  const [isDirty, setIsDirty] = useState(false)
  const [localClasses, setLocalClasses] = useState<Classroom[]>([])
  const [localApplicants, setLocalApplicants] = useState<Applicant[]>([])
  const [classToDelete, setClassToDelete] = useState<Classroom | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  const [isPromotionDialogOpen, setIsPromotionDialogOpen] = useState(false)
  const [classToPromote, setClassToPromote] = useState<Classroom | null>(null)
  
  const [studentSearch, setStudentSearch] = useState("")
  
  const { toast } = useToast()
  const db = useFirestore()

  const classesQuery = useMemoFirebase(() => db ? query(collection(db, 'classes'), orderBy('name', 'asc')) : null, [db])
  const applicantsQuery = useMemoFirebase(() => db ? query(collection(db, 'applicants')) : null, [db])

  const { data: serverClasses, loading: loadingClasses } = useCollection<Classroom>(classesQuery)
  const { data: serverApplicants } = useCollection<Applicant>(applicantsQuery)

  useEffect(() => {
    if (serverClasses && !isDirty) {
      setLocalClasses(serverClasses)
    }
  }, [serverClasses, isDirty])

  useEffect(() => {
    if (serverApplicants && !isDirty) {
      setLocalApplicants(serverApplicants)
    }
  }, [serverApplicants, isDirty])

  const form = useForm<z.infer<typeof classFormSchema>>({
    resolver: zodResolver(classFormSchema),
    defaultValues: { name: "", gradeLevel: "7", homeroomTeacher: "", capacity: "32" },
  })

  const studentEditForm = useForm<z.infer<typeof studentEditSchema>>({
    resolver: zodResolver(studentEditSchema),
    defaultValues: { fullName: "", NISN: "", gender: "Laki-laki" },
  })

  const onSaveLocal = (values: z.infer<typeof classFormSchema>) => {
    const classData = {
      id: editingClass ? editingClass.id : `temp-${Date.now()}`,
      name: values.name,
      gradeLevel: parseInt(values.gradeLevel),
      homeroomTeacher: values.homeroomTeacher || "",
      capacity: parseInt(values.capacity),
      students: editingClass?.students || [],
      currentEnrollment: editingClass?.currentEnrollment || 0
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
    toast({ title: "Biodata Siswa Diperbarui di Buffer" })
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

  const handlePromoteClassLocal = () => {
    if (!classToPromote) return
    const isGrade9 = classToPromote.gradeLevel >= 9
    const studentIds = classToPromote.students || []

    if (studentIds.length === 0) {
      toast({ variant: "destructive", title: "Gagal", description: "Kelas ini tidak memiliki murid." })
      return
    }

    // 1. Kosongkan murid dari kelas tersebut
    const updatedClass = { ...classToPromote, students: [], currentEnrollment: 0 }
    setLocalClasses(prev => prev.map(c => c.id === classToPromote.id ? updatedClass : c))

    // 2. Jika kelas 9, ubah status pendaftar menjadi 'graduated'
    if (isGrade9) {
      setLocalApplicants(prev => prev.map(a => {
        if (studentIds.includes(a.id)) {
          return { ...a, admissionStatus: 'graduated' as any, updatedAt: new Date().toISOString() }
        }
        return a
      }))
    }
    // Jika kelas 7/8, mereka otomatis jadi 'available' karena sudah tidak punya kelas (status tetap 'accepted')

    setIsDirty(true)
    setIsPromotionDialogOpen(false)
    setClassToPromote(null)
    toast({ 
      title: isGrade9 ? "Proses Kelulusan Berhasil (Buffer)" : "Proses Kenaikan Berhasil (Buffer)",
      description: isGrade9 ? `${studentIds.length} murid ditandai lulus.` : `${studentIds.length} murid siap dipindah ke tingkat berikutnya.`
    })
  }

  const handleSyncToCloud = async () => {
    if (!db || !serverClasses) return
    setIsSyncing(true)
    const batch = writeBatch(db)

    try {
      const toDelete = serverClasses.filter(sc => !localClasses.some(lc => lc.id === sc.id))
      toDelete.forEach(c => batch.delete(doc(db, 'classes', c.id)))

      localClasses.forEach(lc => {
        if (lc.id.startsWith('temp-')) {
          const { id, ...data } = lc
          batch.set(doc(collection(db, 'classes')), data)
        } else {
          const serverVer = serverClasses.find(sc => sc.id === lc.id)
          if (JSON.stringify(serverVer) !== JSON.stringify(lc)) {
            batch.update(doc(db, 'classes', lc.id), lc as any)
          }
        }
      })

      localApplicants.forEach(la => {
        const serverVer = serverApplicants?.find(sa => sa.id === la.id)
        if (serverVer && JSON.stringify(serverVer) !== JSON.stringify(la)) {
          batch.update(doc(db, 'applicants', la.id), la as any)
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

  const currentClassStudents = useMemo(() => {
    if (!selectedClassForStudents || !localApplicants) return []
    return localApplicants
      .filter(a => selectedClassForStudents.students?.includes(a.id))
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
  }, [selectedClassForStudents, localApplicants])

  const availableStudents = useMemo(() => {
    if (!localApplicants || !localClasses) return []
    const assignedIds = new Set(localClasses.flatMap(c => c.students || []))
    return localApplicants.filter(a => a.admissionStatus === 'accepted' && !assignedIds.has(a.id) && !a.isDeleted)
  }, [localApplicants, localClasses])

  const handleAddStudentToClass = (studentId: string) => {
    if (!selectedClassForStudents) return
    const updatedClass = {
      ...selectedClassForStudents,
      students: [...(selectedClassForStudents.students || []), studentId],
      currentEnrollment: (selectedClassForStudents.students?.length || 0) + 1
    }
    setLocalClasses(prev => prev.map(c => c.id === updatedClass.id ? updatedClass : c))
    setSelectedClassForStudents(updatedClass)
    setIsDirty(true)
    toast({ title: "Murid Ditambahkan ke Draf" })
  }

  const handleRemoveStudentFromClass = (studentId: string) => {
    if (!selectedClassForStudents) return
    const updatedClass = {
      ...selectedClassForStudents,
      students: (selectedClassForStudents.students || []).filter(id => id !== studentId),
      currentEnrollment: Math.max(0, (selectedClassForStudents.students?.length || 0) - 1)
    }
    setLocalClasses(prev => prev.map(c => c.id === updatedClass.id ? updatedClass : c))
    setSelectedClassForStudents(updatedClass)
    setIsDirty(true)
    toast({ title: "Murid Dikeluarkan dari Draf" })
  }

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([{ "NAMA": "CONTOH NAMA", "NISN": "0012345678" }])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Template")
    XLSX.writeFile(wb, "Template_Impor_Murid.xlsx")
  }

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedClassForStudents) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      const bstr = evt.target?.result
      const wb = XLSX.read(bstr, { type: 'binary' })
      const wsname = wb.SheetNames[0]
      const ws = wb.Sheets[wsname]
      const data = XLSX.utils.sheet_to_json(ws) as any[]
      let addedCount = 0
      const currentStudents = [...(selectedClassForStudents.students || [])]
      data.forEach(row => {
        const name = String(row.NAMA || "").toLowerCase()
        const nisn = String(row.NISN || "")
        const match = availableStudents.find(a => (a.NISN === nisn && nisn !== "") || (a.fullName.toLowerCase() === name && name !== ""))
        if (match && !currentStudents.includes(match.id)) {
          currentStudents.push(match.id)
          addedCount++
        }
      })
      if (addedCount > 0) {
        const updatedClass = { ...selectedClassForStudents, students: currentStudents, currentEnrollment: currentStudents.length }
        setLocalClasses(prev => prev.map(c => c.id === updatedClass.id ? updatedClass : c))
        setSelectedClassForStudents(updatedClass)
        setIsDirty(true)
        toast({ title: "Impor Berhasil", description: `${addedCount} murid ditambahkan ke draf.` })
      } else {
        toast({ variant: "destructive", title: "Impor Gagal", description: "Tidak ada murid yang cocok atau sudah ada di kelas lain." })
      }
    }
    reader.readAsBinaryString(file)
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
            <Button variant="ghost" size="icon" onClick={() => { setView('grid'); setEditingClass(null); setIsAddStudentMode(false); }} className="rounded-full border"><ArrowLeft className="w-5 h-5" /></Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-headline font-bold">Daftar Murid: Kelas {selectedClassForStudents.name}</h1>
                <Badge variant="outline" className="font-mono">Tingkat {selectedClassForStudents.gradeLevel}</Badge>
              </div>
              <p className="text-muted-foreground text-sm">Manajemen data siswa dalam rombongan belajar ini.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleDownloadTemplate} className="gap-2"><Download className="w-4 h-4" /> Template</Button>
            <label className="cursor-pointer">
               <div className="flex items-center gap-2 border border-green-500/20 text-green-500 bg-green-500/5 hover:bg-green-500/10 h-10 px-4 py-2 rounded-md text-sm font-medium transition-colors">
                  <FileSpreadsheet className="w-4 h-4" /> Impor Excel
               </div>
               <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleImportExcel} />
            </label>
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
              {availableStudents
                .filter(s => s.fullName.toLowerCase().includes(studentSearch.toLowerCase()) || (s.NISN || "").includes(studentSearch))
                .map(s => (
                <div key={s.id} className="flex items-center justify-between p-4 rounded-xl hover:bg-muted/50 border border-border/40 bg-muted/20 transition-all group">
                   <div className="flex flex-col">
                     <span className="text-sm font-bold group-hover:text-primary transition-colors">{s.fullName}</span>
                     <span className="text-[10px] text-muted-foreground font-mono">{s.NISN} | {s.originSchool}</span>
                   </div>
                   <Button size="sm" variant="outline" className="h-8 px-4 text-primary border-primary/20 hover:bg-primary hover:text-white text-[10px] font-bold" onClick={() => handleAddStudentToClass(s.id)}>Pilih <ChevronRight className="w-3 h-3 ml-1" /></Button>
                </div>
              ))}
              {availableStudents.length === 0 && (
                <div className="col-span-full py-20 text-center text-muted-foreground italic flex flex-col items-center gap-4">
                  <Users className="w-12 h-12 opacity-10" />
                  <p>Seluruh pendaftar yang diterima sudah memiliki kelas.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50 border-b">
                  <TableRow>
                    <TableHead className="w-16 text-center font-bold">No</TableHead>
                    <TableHead className="font-bold">Nama Lengkap</TableHead>
                    <TableHead className="font-bold">NISN</TableHead>
                    <TableHead className="font-bold">Status</TableHead>
                    <TableHead className="text-right font-bold pr-8">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentClassStudents.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-32 text-muted-foreground italic flex flex-col items-center gap-4">
                      <GraduationCap className="w-16 h-16 opacity-5" />
                      <p>Belum ada murid di kelas ini. Klik tombol "Tambah Murid" untuk mengisi rombel.</p>
                    </TableCell></TableRow>
                  ) : currentClassStudents.map((s, idx) => (
                    <TableRow key={s.id} className="hover:bg-muted/10 transition-colors h-16">
                      <TableCell className="text-center font-mono text-xs text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="font-bold text-sm text-foreground">{s.fullName}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{s.NISN || "-"}</TableCell>
                      <TableCell>
                        <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-[10px] py-0.5 px-3 font-bold gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                          AKTIF
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" asChild title="Lihat Detail">
                            <Link href={`/dashboard/applicants/${s.id}`}><Eye className="w-4 h-4" /></Link>
                          </Button>
                          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-primary hover:bg-primary/5" onClick={() => handleEditStudent(s)} title="Edit Biodata">
                            <Pencil className="w-4 h-4" />
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

        <div className="bg-primary/5 p-4 rounded-xl border border-primary/20 flex gap-4 mt-8">
           <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
           <div className="text-xs text-muted-foreground leading-relaxed italic">
             Data yang Anda kelola di halaman ini bersifat <strong>Offline Draf</strong>. Pastikan menekan tombol <strong>"Sinkronkan ke Cloud"</strong> di halaman utama manajemen kelas untuk menyimpan perubahan anggota rombel secara permanen.
           </div>
        </div>

        {/* DIALOG EDIT BIODATA SISWA (QUICK EDIT) */}
        <Dialog open={isEditStudentOpen} onOpenChange={setIsEditStudentOpen}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>Edit Biodata Siswa</DialogTitle>
              <DialogDescription>Ubah data dasar murid di draf lokal.</DialogDescription>
            </DialogHeader>
            <Form {...studentEditForm}>
              <form onSubmit={studentEditForm.handleSubmit(onSaveStudentLocal)} className="space-y-4 pt-4">
                <FormField control={studentEditForm.control} name="fullName" render={({ field }) => (
                  <FormItem><FormLabel>Nama Lengkap</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={studentEditForm.control} name="NISN" render={({ field }) => (
                  <FormItem><FormLabel>NISN</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                )} />
                <FormField control={studentEditForm.control} name="gender" render={({ field }) => (
                  <FormItem><FormLabel>Jenis Kelamin</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="Laki-laki">Laki-laki</SelectItem>
                        <SelectItem value="Perempuan">Perempuan</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <DialogFooter className="pt-4"><Button type="submit" className="w-full">Simpan Perubahan Draf</Button></DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
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
             {isDirty ? (
               <Badge className="bg-amber-500/10 text-amber-500 animate-pulse gap-1"><CloudOff className="w-3 h-3" /> Ada Draf Baru</Badge>
             ) : (
               <Badge className="bg-green-500/10 text-green-500 gap-1"><CheckCircle2 className="w-3 h-3" /> Tersinkron</Badge>
             )}
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
                const isGrade9 = cls.gradeLevel >= 9

                return (
                  <Card key={cls.id} className={`border-border/50 relative group transition-all hover:border-primary/50 shadow-sm hover:shadow-md ${isTemp ? 'bg-amber-500/5 border-dashed border-2' : ''}`}>
                    <Button variant="ghost" size="icon" className="absolute top-2 right-2 text-destructive opacity-0 group-hover:opacity-100 hover:bg-destructive/10" onClick={() => handleDeleteTrigger(cls)}><Trash2 className="w-4 h-4" /></Button>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-xl">Kelas {cls.name} {isTemp && <RefreshCw className="w-4 h-4 text-amber-500 animate-spin" />}</CardTitle>
                      <CardDescription className="flex items-center justify-between mt-1">
                        <div className="flex items-center gap-2">
                          <Users className="w-3.5 h-3.5" />
                          <span className="font-bold text-foreground">{cls.currentEnrollment || 0}</span> / {cls.capacity} Murid
                        </div>
                        {cls.currentEnrollment > 0 && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className={`h-7 text-[9px] font-bold uppercase gap-1 ${isGrade9 ? 'text-green-500 border-green-500/20' : 'text-accent border-accent/20'}`}
                            onClick={() => { setClassToPromote(cls); setIsPromotionDialogOpen(true); }}
                          >
                            {isGrade9 ? <CheckCircle2 className="w-3 h-3" /> : <ArrowUpCircle className="w-3 h-3" />}
                            {isGrade9 ? "Lulus" : "Naik"}
                          </Button>
                        )}
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

      <div className="bg-accent/5 p-5 rounded-xl border border-accent/20 flex gap-5">
         <Info className="w-6 h-6 text-accent shrink-0 mt-0.5" />
         <div className="text-xs text-muted-foreground leading-relaxed italic">
           Sistem menggunakan <strong>Mode Offline Buffer</strong>. Anda dapat mengatur kelas dan memindahkan murid antar rombel tanpa biaya database berlebih. Pastikan menekan tombol <strong>Sinkronkan ke Cloud</strong> untuk menyimpan hasil akhir.
         </div>
      </div>

      {/* DIALOG TAMBAH/EDIT KELAS */}
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

      {/* ALERT DIALOG HAPUS ROMBEL */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">Hapus Rombel?</AlertDialogTitle>
            <AlertDialogDescription>Tindakan ini menghapus draf kelas Anda. Murid di dalamnya akan dikeluarkan dari rombel tapi data profil mereka aman.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={executeDeleteLocal} className="bg-destructive text-destructive-foreground">Ya, Hapus Kelas</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ALERT DIALOG KENAIKAN / KELULUSAN */}
      <AlertDialog open={isPromotionDialogOpen} onOpenChange={setIsPromotionDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {classToPromote?.gradeLevel && classToPromote.gradeLevel >= 9 ? <School className="w-5 h-5 text-green-500" /> : <ArrowUpCircle className="w-5 h-5 text-accent" />}
              {classToPromote?.gradeLevel && classToPromote.gradeLevel >= 9 ? "Konfirmasi Kelulusan Massal" : "Konfirmasi Kenaikan Kelas"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {classToPromote?.gradeLevel && classToPromote.gradeLevel >= 9 
                ? `Apakah Anda yakin ingin meluluskan seluruh murid (${classToPromote.currentEnrollment}) dari Kelas ${classToPromote.name}? Status mereka akan diubah menjadi LULUS.`
                : `Murid dari Kelas ${classToPromote?.name} akan dikeluarkan dari rombel ini agar Anda dapat memasukkan mereka ke kelas tingkat berikutnya. Lanjutkan?`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handlePromoteClassLocal} 
              className={classToPromote?.gradeLevel && classToPromote.gradeLevel >= 9 ? "bg-green-600 hover:bg-green-700" : "bg-accent hover:bg-accent/90"}
            >
              Ya, Proses Sekarang
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
