
"use client"

import { useState, useMemo } from 'react'
import { Plus, UserCheck, Trash2, Loader2, Pencil, BookOpen, AlertCircle, Users, BookMarked, Layers } from "lucide-react"
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
import { collection, addDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore'
import { TeacherAssignment, Staff, Classroom, Subject } from '@/lib/types'
import { useToast } from '@/hooks/use-toast'
import { Badge } from "@/components/ui/badge"
import { Separator } from '@/components/ui/separator'

export default function TeacherAssignmentsPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [editingAssignment, setEditingAssignment] = useState<TeacherAssignment | null>(null)
  const { toast } = useToast()
  const db = useFirestore()

  const [selectedTeacherId, setSelectedTeacherId] = useState("")
  const [selectedClassId, setSelectedClassId] = useState("")
  const [selectedSubjectId, setSelectedSubjectId] = useState("")
  const [totalJP, setTotalJP] = useState("2")

  const assignmentsQuery = useMemoFirebase(() => db ? collection(db, 'teacherAssignments') : null, [db])
  const staffQuery = useMemoFirebase(() => db ? collection(db, 'staff') : null, [db])
  const classesQuery = useMemoFirebase(() => db ? collection(db, 'classes') : null, [db])
  const subjectsQuery = useMemoFirebase(() => db ? collection(db, 'subjects') : null, [db])

  const { data: assignments, loading: loadingA } = useCollection<TeacherAssignment>(assignmentsQuery)
  const { data: staff, loading: loadingS } = useCollection<Staff>(staffQuery)
  const { data: classes, loading: loadingC } = useCollection<Classroom>(classesQuery)
  const { data: subjects, loading: loadingSub } = useCollection<Subject>(subjectsQuery)

  const teachers = staff?.filter(s => s.role === 'Guru') || []

  // Logika pengelompokan data per guru
  const groupedAssignments = useMemo(() => {
    if (!assignments) return []
    
    const map = new Map<string, { 
      teacherId: string, 
      teacherName: string, 
      list: TeacherAssignment[], 
      totalJP: number 
    }>()

    assignments.forEach(a => {
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
  }, [assignments])

  const handleOpenAdd = () => {
    setEditingAssignment(null)
    setSelectedTeacherId("")
    setSelectedClassId("")
    setSelectedSubjectId("")
    setTotalJP("2")
    setIsDialogOpen(true)
  }

  const handleEdit = (a: TeacherAssignment) => {
    setEditingAssignment(a)
    setSelectedTeacherId(a.teacherId)
    setSelectedClassId(a.classId)
    setSelectedSubjectId(a.subjectId)
    setTotalJP(a.totalJP?.toString() || "2")
    setIsDialogOpen(true)
  }

  const handleSave = async () => {
    if (!db || !selectedTeacherId || !selectedClassId || !selectedSubjectId) {
      toast({ variant: "destructive", title: "Mohon isi semua data" })
      return
    }
    setSubmitting(true)
    
    const teacher = teachers.find(t => t.id === selectedTeacherId)
    const cls = classes?.find(c => c.id === selectedClassId)
    const subject = subjects?.find(s => s.id === selectedSubjectId)

    const payload = {
      teacherId: selectedTeacherId,
      teacherName: teacher?.fullName,
      classId: selectedClassId,
      className: cls?.name,
      subjectId: selectedSubjectId,
      subjectName: subject?.name,
      totalJP: parseInt(totalJP) || 0
    }

    try {
      if (editingAssignment) {
        await updateDoc(doc(db, 'teacherAssignments', editingAssignment.id), payload)
        toast({ title: "Penugasan Diperbarui" })
      } else {
        await addDoc(collection(db, 'teacherAssignments'), payload)
        toast({ title: "Penugasan Berhasil" })
      }
      setIsDialogOpen(false)
    } catch (e) {
      toast({ variant: "destructive", title: "Gagal menyimpan" })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!db) return
    await deleteDoc(doc(db, 'teacherAssignments', id))
    toast({ title: "Penugasan Dicabut" })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Penugasan Guru</h1>
          <p className="text-muted-foreground">Hubungkan Guru dengan Mapel, Kelas, dan Beban Jam (JP) Dapodik.</p>
        </div>
        <Button onClick={handleOpenAdd} className="gap-2 shadow-lg shadow-primary/20">
          <Plus className="w-4 h-4" /> Tambah Penugasan
        </Button>
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
                      <Badge variant="outline" className="text-[9px] uppercase mt-1">{group.list.length} Mata Pelajaran</Badge>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pr-4">
                    {group.list.map(asg => (
                      <div key={asg.id} className="flex items-center justify-between p-2.5 rounded-xl bg-muted/30 border border-border/50 group/item hover:border-primary/30 transition-all">
                        <div className="flex flex-col gap-1 overflow-hidden">
                           <div className="flex items-center gap-2">
                             <BookMarked className="w-3.5 h-3.5 text-primary shrink-0" />
                             <span className="text-xs font-bold truncate">{asg.subjectName}</span>
                           </div>
                           <div className="flex items-center gap-2">
                             <Layers className="w-3.5 h-3.5 text-accent shrink-0" />
                             <span className="text-[10px] font-mono text-muted-foreground">KELAS {asg.className}</span>
                             <span className="text-[9px] font-bold text-amber-600 bg-amber-500/10 px-1.5 rounded">{asg.totalJP} JP</span>
                           </div>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-primary" onClick={() => handleEdit(asg)}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => handleDelete(asg.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </div>
                    ))}
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

      <div className="bg-primary/5 p-4 rounded-xl border border-primary/20 flex gap-4">
         <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
         <div className="text-xs text-muted-foreground leading-relaxed">
           <p className="font-bold text-primary mb-1 uppercase tracking-wider">Navigasi Pengecekan:</p>
           Setiap baris kini mewakili satu guru. Anda dapat melihat seluruh distribusi mengajar guru tersebut dalam satu baris. Gunakan ikon **Pensil** untuk mengubah rincian jam pelajaran (JP) atau mata pelajaran secara spesifik.
         </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>{editingAssignment ? 'Edit Penugasan Guru' : 'Plotting Guru & Beban JP'}</DialogTitle>
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
                <BookOpen className="w-3 h-3" /> Mata Pelajaran
              </label>
              <Select value={selectedSubjectId} onValueChange={setSelectedSubjectId}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Pilih Mata Pelajaran" /></SelectTrigger>
                <SelectContent>{subjects?.map(s => <SelectItem key={s.id} value={s.id}>{s.name} (G-{s.grade})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-muted-foreground tracking-widest flex items-center gap-2">
                <Users className="w-3 h-3" /> Rombongan Belajar
              </label>
              <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Pilih Kelas" /></SelectTrigger>
                <SelectContent>{classes?.map(c => <SelectItem key={c.id} value={c.id}>Kelas {c.name} (G-{c.gradeLevel})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2 pt-2">
              <label className="text-xs font-bold uppercase text-primary tracking-widest">Beban Jam Pelajaran (Total JP Per Minggu)</label>
              <Input type="number" min="1" value={totalJP} onChange={e => setTotalJP(e.target.value)} className="h-11 font-bold text-lg" placeholder="Contoh: 4" />
              <p className="text-[10px] text-muted-foreground italic">Target jam yang harus terpenuhi di jadwal mingguan Dapodik.</p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={submitting} className="w-full h-11">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {editingAssignment ? 'Simpan Perubahan' : 'Simpan Penugasan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
