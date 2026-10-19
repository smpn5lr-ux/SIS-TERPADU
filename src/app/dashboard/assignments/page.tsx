
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
  Info
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

  const teachers = staff?.filter(s => s.role === 'Guru') || []

  const sortedSubjects = useMemo(() => {
    if (!subjects) return []
    return [...subjects].sort((a, b) => a.name.localeCompare(b.name))
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
    
    const teacher = teachers.find(t => t.id === selectedTeacherId)
    const cls = classes?.find(c => c.id === selectedClassId)
    const subject = subjects?.find(s => s.id === selectedSubjectId)

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
    toast({ title: "Perubahan Disimpan di Buffer", description: "Klik tombol Sinkron untuk mengirim ke database." })
  }

  const handleDeleteLocal = (id: string) => {
    setLocalAssignments(prev => prev.filter(a => a.id !== id))
    setIsDirty(true)
  }

  const handleSyncToCloud = async () => {
    if (!db || !serverAssignments) return
    setIsSyncing(true)
    const batch = writeBatch(db)

    try {
      // 1. Delete assignments that are in server but not in local
      const toDelete = serverAssignments.filter(sa => !localAssignments.some(la => la.id === sa.id))
      toDelete.forEach(a => {
        batch.delete(doc(db, 'teacherAssignments', a.id))
      })

      // 2. Add/Update
      localAssignments.forEach(la => {
        if (la.id.startsWith('temp-')) {
          const newRef = doc(collection(db, 'teacherAssignments'))
          const { id, ...data } = la
          batch.set(newRef, data)
        } else {
          // Find if it was updated locally
          const serverVer = serverAssignments.find(sa => sa.id === la.id)
          if (JSON.stringify(serverVer) !== JSON.stringify(la)) {
            const ref = doc(db, 'teacherAssignments', la.id)
            batch.update(ref, la as any)
          }
        }
      })

      await batch.commit()
      setIsDirty(false)
      toast({ title: "Sinkronisasi Berhasil", description: "Data penugasan guru telah diperbarui di cloud." })
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
              <TableHead className="font-bold text-primary">Detail Penugasan (Mapel & Kelas)</TableHead>
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
                      <span className="font-bold text-sm block">{group.teacherName}</span>
                      <Badge variant="outline" className="text-[9px] uppercase mt-1">{group.list.length} Penugasan</Badge>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pr-4">
                    {group.list.map(asg => {
                      const isTemp = asg.id.startsWith('temp-')
                      return (
                        <div key={asg.id} className={`flex items-center justify-between p-2.5 rounded-xl bg-muted/30 border transition-all group/item hover:border-primary/30 ${isTemp ? 'border-dashed border-amber-500/30' : 'border-border/50'}`}>
                          <div className="flex flex-col gap-1 overflow-hidden">
                             <div className="flex items-center gap-2">
                               <BookMarked className="w-3.5 h-3.5 text-primary shrink-0" />
                               <span className="text-xs font-bold truncate">{asg.subjectName}</span>
                               {isTemp && <RefreshCw className="w-3 h-3 text-amber-500 animate-spin" />}
                             </div>
                             <div className="flex items-center gap-2">
                               <Layers className="w-3.5 h-3.5 text-accent shrink-0" />
                               <span className="text-[10px] font-mono text-muted-foreground uppercase">Kelas {asg.className}</span>
                               <span className="text-[9px] font-bold text-amber-600 bg-amber-500/10 px-1.5 rounded">{asg.totalJP} JP</span>
                             </div>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-primary" onClick={() => handleEditLocal(asg)}><Pencil className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => handleDeleteLocal(asg.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
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
          <strong>Mode Hemat Kuota Aktif:</strong> Perubahan yang Anda lakukan hanya tersimpan sementara di browser. Anda dapat menambah atau menghapus banyak penugasan tanpa biaya database. Pastikan menekan <strong>"Sinkronkan ke Cloud"</strong> untuk menyimpan hasil akhir ke sistem pusat.
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
                <SelectTrigger className="h-11"><SelectValue placeholder="Pilih Guru Pengajar" /></SelectTrigger>
                <SelectContent>{teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.fullName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-muted-foreground tracking-widest flex items-center gap-2">
                <BookOpen className="w-3 h-3" /> Pilih Mata Pelajaran
              </label>
              <Select value={selectedSubjectId} onValueChange={setSelectedSubjectId}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Pilih Mata Pelajaran" /></SelectTrigger>
                <SelectContent>{sortedSubjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name} ({s.code})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-muted-foreground tracking-widest flex items-center gap-2">
                <Users className="w-3 h-3" /> Rombongan Belajar (Kelas)
              </label>
              <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Pilih Kelas" /></SelectTrigger>
                <SelectContent>{classes?.map(c => <SelectItem key={c.id} value={c.id}>Kelas {c.name} (Tingkat {c.gradeLevel})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2 pt-2">
              <label className="text-xs font-bold uppercase text-primary tracking-widest">Beban Jam Pelajaran (JP / Minggu)</label>
              <Input type="number" min="1" value={totalJP} onChange={e => setTotalJP(e.target.value)} className="h-11 font-bold text-lg" placeholder="Contoh: 4" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSaveLocal} className="w-full h-11 shadow-lg shadow-primary/20">
              Simpan ke Draf
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
