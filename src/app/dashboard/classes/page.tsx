
"use client"

import { useState, useEffect, useMemo } from 'react'
import { 
  Users, Trash2, Plus, Pencil, Eye, FileSpreadsheet, Loader2, CheckCircle2, UserPlus, Search, Upload, Download, CloudUpload, CloudOff, RefreshCw, Info, UserMinus, X, GraduationCap, ExternalLink
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
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isManageStudentsOpen, setIsManageStudentsOpen] = useState(false)
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
  
  const [studentSearch, setStudentSearch] = useState("")
  
  const { toast } = useToast()
  const db = useFirestore()

  const classesQuery = useMemoFirebase(() => db ? query(collection(db, 'classes'), orderBy('name', 'asc')) : null, [db])
  const applicantsQuery = useMemoFirebase(() => db ? collection(db, 'applicants') : null, [db])
  const settingsRef = useMemoFirebase(() => db ? doc(db, 'settings', 'system') : null, [db])

  const { data: serverClasses, loading: loadingClasses } = useCollection<Classroom>(classesQuery)
  const { data: serverApplicants } = useCollection<Applicant>(applicantsQuery)
  const { data: systemSettings } = useDoc<any>(settingsRef)

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

  const handleSyncToCloud = async () => {
    if (!db || !serverClasses) return
    setIsSyncing(true)
    const batch = writeBatch(db)

    try {
      // 1. Sync Classes
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

      // 2. Sync Applicants (Students)
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

  // LOGIKA MANAJEMEN MURID
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
        
        const match = availableStudents.find(a => 
          (a.NISN === nisn && nisn !== "") || 
          (a.fullName.toLowerCase() === name && name !== "")
        )

        if (match && !currentStudents.includes(match.id)) {
          currentStudents.push(match.id)
          addedCount++
        }
      })

      if (addedCount > 0) {
        const updatedClass = {
          ...selectedClassForStudents,
          students: currentStudents,
          currentEnrollment: currentStudents.length
        }
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

  if (loadingClasses && !localClasses.length) return <div className="flex justify-center py-24"><Loader2 className="animate-spin" /></div>

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
            <Button onClick={handleSyncToCloud} disabled={isSyncing} className="bg-green-600 gap-2">
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
                  <Card key={cls.id} className={`border-border/50 relative group ${isTemp ? 'bg-amber-500/5 border-dashed border-2' : ''}`}>
                    <Button variant="ghost" size="icon" className="absolute top-2 right-2 text-destructive opacity-0 group-hover:opacity-100" onClick={() => handleDeleteTrigger(cls)}><Trash2 className="w-4 h-4" /></Button>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">Kelas {cls.name} {isTemp && <RefreshCw className="w-4 h-4 text-amber-500 animate-spin" />}</CardTitle>
                      <CardDescription>{cls.currentEnrollment || 0} / {cls.capacity} Murid</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="bg-muted/30 p-2 rounded text-xs">Wali Kelas: <span className="font-bold">{cls.homeroomTeacher || "-"}</span></div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" className="w-full text-xs gap-1" onClick={() => { setEditingClass(cls); form.reset({...cls, gradeLevel: cls.gradeLevel.toString(), capacity: cls.capacity.toString()}); setIsDialogOpen(true); }}><Pencil className="w-3 h-3" /> Edit</Button>
                        <Button variant="default" className="w-full text-xs gap-1" onClick={() => { setSelectedClassForStudents(cls); setIsManageStudentsOpen(true); setIsAddStudentMode(false); }}><Users className="w-3 h-3" /> Daftar Murid</Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="bg-accent/5 p-4 rounded-xl border border-accent/20 flex gap-4">
         <Info className="w-5 h-5 text-accent shrink-0 mt-0.5" />
         <div className="text-xs text-muted-foreground leading-relaxed italic">
           Sistem menggunakan <strong>Mode Offline Buffer</strong>. Anda dapat mengatur kelas dan memindahkan murid tanpa biaya database. Pastikan menekan tombol <strong>Sinkronkan</strong> untuk menyimpan hasil akhir.
         </div>
      </div>

      {/* DIALOG EDIT KELAS */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader><DialogTitle>{editingClass ? 'Edit Rombel' : 'Tambah Rombel Baru'}</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSaveLocal)} className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>Nama Kelas</FormLabel><FormControl><Input placeholder="7-A" {...field} value={field.value || ""} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="gradeLevel" render={({ field }) => (
                  <FormItem><FormLabel>Tingkat</FormLabel><FormControl><Input type="number" {...field} value={field.value || ""} /></FormControl></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="homeroomTeacher" render={({ field }) => (
                <FormItem><FormLabel>Wali Kelas</FormLabel><FormControl><Input placeholder="Nama Guru" {...field} value={field.value || ""} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="capacity" render={({ field }) => (
                <FormItem><FormLabel>Kapasitas</FormLabel><FormControl><Input type="number" {...field} value={field.value || ""} /></FormControl></FormItem>
              )} />
              <DialogFooter><Button type="submit" className="w-full">Simpan ke Buffer</Button></DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* DIALOG DAFTAR MURID (REFACTORED) */}
      <Dialog open={isManageStudentsOpen} onOpenChange={setIsManageStudentsOpen}>
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-2 border-b bg-muted/5">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <DialogTitle className="text-2xl font-headline">Daftar Murid: Kelas {selectedClassForStudents?.name}</DialogTitle>
                <DialogDescription>Manajemen data siswa dalam rombongan belajar ini.</DialogDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={handleDownloadTemplate} className="text-[10px] h-8 gap-1"><Download className="w-3 h-3" /> Template</Button>
                <label className="cursor-pointer">
                   <Button variant="outline" size="sm" asChild className="text-[10px] h-8 gap-1 border-green-500/20 text-green-500"><div className="flex items-center gap-1"><FileSpreadsheet className="w-3 h-3" /> Impor Excel</div></Button>
                   <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleImportExcel} />
                </label>
                <Button size="sm" onClick={() => setIsAddStudentMode(!isAddStudentMode)} className="text-[10px] h-8 gap-1 bg-primary">
                  {isAddStudentMode ? <X className="w-3 h-3" /> : <UserPlus className="w-3 h-3" />}
                  {isAddStudentMode ? "Batal" : "Tambah Murid"}
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-hidden flex flex-col">
            {isAddStudentMode ? (
              <div className="p-6 flex flex-col h-full bg-accent/5 animate-in slide-in-from-top-2 duration-300">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-xs uppercase text-accent tracking-widest">Pilih Siswa yang Belum Berkelas</h3>
                  <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <Input placeholder="Cari Nama/NISN..." className="pl-8 h-8 text-xs bg-background" value={studentSearch} onChange={e => setStudentSearch(e.target.value)} />
                  </div>
                </div>
                <ScrollArea className="flex-1 border rounded-lg bg-background">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-4">
                    {availableStudents
                      .filter(s => s.fullName.toLowerCase().includes(studentSearch.toLowerCase()) || (s.NISN || "").includes(studentSearch))
                      .map(s => (
                      <div key={s.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 border border-border/40 transition-all">
                         <div className="flex flex-col">
                           <span className="text-sm font-bold">{s.fullName}</span>
                           <span className="text-[10px] text-muted-foreground font-mono">{s.NISN} | {s.originSchool}</span>
                         </div>
                         <Button size="sm" variant="outline" className="h-7 px-3 text-primary border-primary/20 hover:bg-primary/10 text-[10px] font-bold" onClick={() => handleAddStudentToClass(s.id)}>Pilih <Plus className="w-3 h-3 ml-1" /></Button>
                      </div>
                    ))}
                    {availableStudents.length === 0 && (
                      <div className="col-span-2 text-center py-12 text-muted-foreground text-sm italic">Semua murid sudah memiliki kelas.</div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            ) : (
              <div className="p-0 flex flex-col h-full">
                <ScrollArea className="flex-1">
                  <Table>
                    <TableHeader className="bg-muted/20 sticky top-0 z-10">
                      <TableRow>
                        <TableHead className="w-[60px] text-center font-bold">No</TableHead>
                        <TableHead className="font-bold">Nama Lengkap</TableHead>
                        <TableHead className="font-bold">NISN</TableHead>
                        <TableHead className="font-bold">Status</TableHead>
                        <TableHead className="text-right font-bold pr-6">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {currentClassStudents.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="text-center py-20 text-muted-foreground italic">Belum ada murid di kelas ini.</TableCell></TableRow>
                      ) : currentClassStudents.map((s, idx) => (
                        <TableRow key={s.id} className="hover:bg-muted/10 transition-colors">
                          <TableCell className="text-center font-mono text-xs">{idx + 1}</TableCell>
                          <TableCell className="font-bold text-sm">{s.fullName}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{s.NISN || "-"}</TableCell>
                          <TableCell>
                            <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-[9px] py-0 px-2 font-bold">AKTIF</Badge>
                          </TableCell>
                          <TableCell className="text-right pr-4">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" asChild title="Lihat Detail">
                                <Link href={`/dashboard/applicants/${s.id}`}><Eye className="w-3.5 h-3.5" /></Link>
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={() => handleEditStudent(s)} title="Edit Biodata">
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleRemoveStudentFromClass(s.id)} title="Hapus dari Kelas">
                                <UserMinus className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            )}
          </div>
          <DialogFooter className="p-4 bg-muted/20 border-t">
            <Button onClick={() => setIsManageStudentsOpen(false)} className="w-full">Tutup Daftar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG EDIT BIODATA SISWA (QUICK EDIT) */}
      <Dialog open={isEditStudentOpen} onOpenChange={setIsEditStudentOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Edit Biodata Siswa</DialogTitle>
            <DialogDescription>Ubah data dasar murid di buffer lokal.</DialogDescription>
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
                <FormItem><FormLabel>Jenis Kelamin</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="Laki-laki">Laki-laki</SelectItem><SelectItem value="Perempuan">Perempuan</SelectItem></SelectContent></Select></FormItem>
              )} />
              <DialogFooter className="pt-4"><Button type="submit" className="w-full">Simpan Perubahan</Button></DialogFooter>
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
          <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={executeDeleteLocal} className="bg-destructive text-destructive-foreground">Ya, Hapus</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
