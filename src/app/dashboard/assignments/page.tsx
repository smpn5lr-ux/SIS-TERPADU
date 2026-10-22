
"use client"

import { useState, useMemo, useEffect } from 'react'
import { 
  Plus, 
  UserCheck, 
  Trash2, 
  Loader2, 
  Pencil, 
  BookOpen, 
  AlertCircle, 
  Users, 
  BookMarked, 
  Layers,
  CloudUpload,
  CloudOff,
  CheckCircle2,
  RefreshCw,
  Info,
  ShieldAlert
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase'
import { collection, addDoc, doc, deleteDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { TeacherAssignment, Staff, Classroom, Subject } from '@/lib/types'
import { useToast } from '@/hooks/use-toast'
import { Badge } from "@/components/ui/badge"
import { Separator } from '@/components/ui/separator'

export default function TeacherAssignmentsPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [editingAssignment, setEditingAssignment] = useState<TeacherAssignment | null>(null)
  
  const [assignmentToDeleteId, setAssignmentToDeleteId] = useState<string | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  const { toast } = useToast()
  const db = useFirestore()

  const [localAssignments, setLocalAssignments] = useState<TeacherAssignment[]>([])
  const [isDirty, setIsDirty] = useState(false)

  const [selectedTeacherId, setSelectedTeacherId] = useState("")
  const [selectedClassId, setSelectedClassId] = useState("")
  const [selectedSubjectId, setSelectedSubjectId] = useState("")
  const [totalJP, setTotalJP] = useState("2")

  const assignmentsQuery = useMemoFirebase(() => db ? collection(db, 'teacherAssignments') : null, [db])
  const staffQuery = useMemoFirebase(() => db ? collection(db, 'staff') : null, [db])
  const classesQuery = useMemoFirebase(() => db ? collection(db, 'classes') : null, [db])
  const subjectsQuery = useMemoFirebase(() => db ? collection(db, 'subjects') : null, [db])

  const { data: serverAssignments, loading: loadingA } = useCollection<TeacherAssignment>(assignmentsQuery)
  const { data: staff } = useCollection<Staff>(staffQuery)
  const { data: classes } = useCollection<Classroom>(classesQuery)
  const { data: subjects } = useCollection<Subject>(subjectsQuery)

  useEffect(() => {
    if (serverAssignments && !isDirty) {
      setLocalAssignments(serverAssignments)
    }
  }, [serverAssignments, isDirty])

  // PENGURUTAN CERDAS UNTUK PEMILIHAN (DROPDOWN)
  const sortedTeachers = useMemo(() => {
    if (!staff) return []
    return staff
      .filter(s => s.role === 'Guru')
      .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""))
  }, [staff])

  const sortedClasses = useMemo(() => {
    if (!classes) return []
    return [...classes].sort((a, b) => {
      if (a.gradeLevel !== b.gradeLevel) return a.gradeLevel - b.gradeLevel
      return (a.name || "").localeCompare(b.name || "", undefined, { numeric: true, sensitivity: 'base' })
    })
  }, [classes])

  const sortedSubjects = useMemo(() => {
    if (!subjects) return []
    return [...subjects].sort((a, b) => (a.name || "").localeCompare(b.name || ""))
  }, [subjects])

  const groupedAssignments = useMemo(() => {
    const map = new Map<string, { 
      teacherId: string, 
      teacherName: string, 
      list: TeacherAssignment[], 
      totalJP: number 
    }>()

    localAssignments.forEach(a => {
      const existing = map.get(a.teacherId) || { 
        teacherId: a.teacherId, 
        teacherName: a.teacherName, 
        list: [], 
        totalJP: 0 
      }
      existing.list.push(a)
      existing.totalJP += (a.totalJP || 0)
      map.set(a.teacherId, existing)
    })

    map.forEach(group => {
      group.list.sort((a, b) => a.className.localeCompare(b.className, undefined, { numeric: true, sensitivity: 'base' }))
    })

    return Array.from(map.values()).sort((a, b) => a.teacherName.localeCompare(b.teacherName))
  }, [localAssignments])

  const handleOpenAdd = () => {
    setEditingAssignment(null)
    setSelectedTeacherId("")
    setSelectedClassId("")
    setSelectedSubjectId("")
    setTotalJP("2")
    setIsDialogOpen(true)
  }

  const handleEditLocal = (a: TeacherAssignment) => {
    setEditingAssignment(a)
    setSelectedTeacherId(a.teacherId)
    setSelectedClassId(a.classId)
    setSelectedSubjectId(a.subjectId)
    setTotalJP(a.totalJP?.toString() || "2")
    setIsDialogOpen(true)
  }

  const handleSaveLocal = () => {
    if (!selectedTeacherId || !selectedClassId || !selectedSubjectId) {
      toast({ variant: "destructive", title: "Mohon isi semua data" })
      return
    }
    
    const teacher = sortedTeachers.find(t => t.id === selectedTeacherId)
    const cls = sortedClasses.find(c => c.id === selectedClassId)
    const subject = sortedSubjects.find(s => s.id === selectedSubjectId)

    const payload = {
      id: editingAssignment ? editingAssignment.id : `temp-${Date.now()}`,
      teacherId: selectedTeacherId,
      teacherName: teacher?.fullName || "",
      classId: selectedClassId,
      className: cls?.name || "",
      subjectId: selectedSubjectId,
      subjectName: subject?.name || "",
      totalJP: parseInt(totalJP) || 0
    } as TeacherAssignment

    if (editingAssignment) {
      setLocalAssignments(prev => prev.map(a => a.id === editingAssignment.id ? payload : a))
    } else {
      setLocalAssignments(prev => [...prev, payload])
    }
    
    setIsDirty(true)
    setIsDialogOpen(false)
    toast({ title: "Perubahan Disimpan di Buffer" })
  }

  const handleDeleteTrigger = (id: string) => {
    setAssignmentToDeleteId(id)
    setIsDeleteDialogOpen(true)
  }

  const executeDeleteLocal = () => {
    if (!assignmentToDeleteId) return
    setLocalAssignments(prev => prev.filter(a => a.id !== assignmentToDeleteId))
    setIsDirty(true)
    setIsDeleteDialogOpen(false)
    setAssignmentToDeleteId(null)
  }

  const handleSyncToCloud = async () => {
    if (!db || !serverAssignments) return
    setIsSyncing(true)
    const batch = writeBatch(db)

    try {
      const toDelete = serverAssignments.filter(sa => !localAssignments.some(la => la.id === sa.id))
      toDelete.forEach(a => batch.delete(doc(db, 'teacherAssignments', a.id)))

      localAssignments.forEach(la => {
        if (la.id.startsWith('temp-')) {
          const newRef = doc(collection(db, 'teacherAssignments'))
          const { id, ...data } = la
          batch.set(newRef, data)
        } else {
          const serverVer = serverAssignments.find(sa => sa.id === la.id)
          if (JSON.stringify(serverVer) !== JSON.stringify(la)) {
            batch.update(doc(db, 'teacherAssignments', la.id), la as any)
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
          <h1 className="text-3xl font-headline font-bold">Penugasan Guru</h1>
          <div className="flex items-center gap-2 mt-1">
             <p className="text-muted-foreground text-sm">Hubungkan Guru dengan Mapel, Kelas, dan Beban Jam (JP).</p>
             {isDirty ? (
               <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse gap-1"><CloudOff className="w-3 h-3" /> Perbaikan Belum Sinkron</Badge>
             ) : (
               <Badge className="bg-green-500/10 text-green-500 border-green-500/20 gap-1"><CheckCircle2 className="w-3 h-3" /> Tersinkron</Badge>
             )}
          </div>
        </div>
        <div className="flex gap-2">
          {isDirty && (
            <Button onClick={handleSyncToCloud} disabled={isSyncing} className="bg-green-600 hover:bg-green-700 shadow-lg shadow-green-500/20 gap-2">
              {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
              Sinkronkan ke Cloud
            </Button>
          )}
          <Button onClick={handleOpenAdd} className="gap-2 shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4" /> Tambah Penugasan
          </Button>
        </div>
      </div>

      <Card className="border-border/50 overflow-hidden shadow-sm">
        <Table>
          <TableHeader className="bg-primary/5">
            <TableRow>
              <TableHead className="font-bold text-primary w-[250px]">Guru Pengajar</TableHead>
              <TableHead className="font-bold text-primary">Daftar Penugasan</TableHead>
              <TableHead className="font-bold text-primary text-center w-[120px]">Total JP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingA ? (
              <TableRow><TableCell colSpan={3} className="text-center py-12"><Loader2 className="animate-spin mx-auto text-primary" /></TableCell></TableRow>
            ) : groupedAssignments.length === 0 ? (
              <TableRow><TableCell colSpan={3} className="text-center py-12 text-muted-foreground italic">Belum ada penugasan guru.</TableCell></TableRow>
            ) : groupedAssignments.map(group => (
              <TableRow key={group.teacherId} className="hover:bg-muted/5 transition-colors align-top">
                <TableCell className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20 font-bold">
                      {group.teacherName.charAt(0)}
                    </div>
                    <div>
                      <span className="font-bold text-sm block leading-tight">{group.teacherName}</span>
                      <Badge variant="outline" className="text-[9px] uppercase mt-1.5">{group.list.length} Rombel</Badge>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="pt-6">
                  <div className="space-y-1.5 pr-6">
                    <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider bg-muted/20 rounded-t-lg">
                       <div className="col-span-5 flex items-center gap-1.5"><BookMarked className="w-3 h-3" /> Mata Pelajaran</div>
                       <div className="col-span-4 flex items-center gap-1.5"><Users className="w-3 h-3" /> Kelas</div>
                       <div className="col-span-1 text-center">JP</div>
                       <div className="col-span-2 text-right">Aksi</div>
                    </div>
                    {group.list.map((asg, idx) => {
                      const isTemp = asg.id.startsWith('temp-')
                      return (
                        <div key={asg.id} className={`grid grid-cols-12 gap-2 items-center px-3 py-2.5 rounded-lg border transition-all group/item ${idx % 2 === 1 ? 'bg-muted/10' : 'bg-transparent'} ${isTemp ? 'border-dashed border-amber-500/30' : 'border-border/40'} hover:border-primary/40`}>
                           <div className="col-span-5 text-xs font-bold flex items-center gap-2 truncate">
                             {asg.subjectName}
                             {isTemp && <RefreshCw className="w-2.5 h-2.5 text-amber-500 animate-spin" />}
                           </div>
                           <div className="col-span-4">
                             <Badge variant="secondary" className="text-[10px] font-mono font-bold py-0 h-5 px-2 bg-accent/10 text-accent border-accent/20">
                               KELAS {asg.className}
                             </Badge>
                           </div>
                           <div className="col-span-1 text-center text-xs font-bold text-primary">{asg.totalJP}</div>
                           <div className="col-span-2 flex justify-end gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-primary hover:bg-primary/10" onClick={() => handleEditLocal(asg)}><Pencil className="w-3.5 h-3.5" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => handleDeleteTrigger(asg.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                           </div>
                        </div>
                      )
                    })}
                  </div>
                </TableCell>
                <TableCell className="text-center pt-6">
                  <div className="flex flex-col items-center">
                    <Badge className="bg-amber-500 text-white border-none font-bold py-1 px-3 shadow-sm shadow-amber-500/20">{group.totalJP} JP</Badge>
                    <span className="text-[9px] text-muted-foreground mt-1 uppercase font-bold tracking-tighter">Beban Total</span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="bg-accent/5 p-4 rounded-xl border border-accent/20 flex gap-3">
        <Info className="w-4 h-4 text-accent shrink-0 mt-0.5" />
        <div className="text-[10px] text-muted-foreground leading-relaxed italic">
          <strong>Tips Pengelolaan:</strong> Daftar kelas untuk setiap guru kini diurutkan secara alfabetis. Kolom mata pelajaran dan kelas dipisahkan agar Anda dapat dengan mudah memverifikasi distribusi jam mengajar sesuai beban kerja guru.
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>{editingAssignment ? 'Edit Penugasan' : 'Plotting Guru & Beban JP'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-muted-foreground tracking-widest flex items-center gap-2">
                <UserCheck className="w-3 h-3" /> Pilih Guru
              </label>
              <Select value={selectedTeacherId} onValueChange={setSelectedTeacherId}>
                <SelectTrigger className="h-11 focus:ring-primary transition-all"><SelectValue placeholder="Pilih Guru Pengajar" /></SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {sortedTeachers.map(t => (
                    <SelectItem key={t.id} value={t.id} className="cursor-pointer hover:bg-primary/10 focus:bg-primary/10 transition-colors py-2.5">
                      {t.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-muted-foreground tracking-widest flex items-center gap-2">
                <BookOpen className="w-3 h-3" /> Pilih Mata Pelajaran
              </label>
              <Select value={selectedSubjectId} onValueChange={setSelectedSubjectId}>
                <SelectTrigger className="h-11 focus:ring-primary transition-all"><SelectValue placeholder="Pilih Mata Pelajaran" /></SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {sortedSubjects.map(s => (
                    <SelectItem key={s.id} value={s.id} className="cursor-pointer hover:bg-primary/10 focus:bg-primary/10 transition-colors py-2.5">
                      {s.name} ({s.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-muted-foreground tracking-widest flex items-center gap-2">
                <Users className="w-3 h-3" /> Rombongan Belajar (Kelas)
              </label>
              <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                <SelectTrigger className="h-11 focus:ring-primary transition-all"><SelectValue placeholder="Pilih Kelas" /></SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {sortedClasses.map(c => (
                    <SelectItem key={c.id} value={c.id} className="cursor-pointer hover:bg-primary/10 focus:bg-primary/10 transition-colors py-2.5">
                      <div className="flex items-center justify-between w-full gap-4">
                        <span>Kelas {c.name}</span>
                        <span className="text-[10px] text-muted-foreground font-bold uppercase">Tingkat {c.gradeLevel}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 pt-2">
              <label className="text-xs font-bold uppercase text-primary tracking-widest">Beban Jam Pelajaran (JP / Minggu)</label>
              <Input type="text" inputMode="numeric" value={totalJP} onChange={e => setTotalJP(e.target.value.replace(/[^0-9]/g, ''))} className="h-11 font-bold text-lg" placeholder="Contoh: 4" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSaveLocal} className="w-full h-11 shadow-lg shadow-primary/20">
              Simpan ke Draf
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-destructive" /> Hapus Penugasan?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini akan menghapus draf penugasan guru dari daftar sementara Anda. Anda tetap harus menekan tombol Sinkron untuk menyimpan perubahan ini ke cloud.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={executeDeleteLocal} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Ya, Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
