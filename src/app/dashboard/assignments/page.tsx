
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
  ShieldAlert,
  Eye
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
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase'
import { collection, addDoc, doc, deleteDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { TeacherAssignment, Staff, Classroom, Subject } from '@/lib/types'
import { useToast } from '@/hooks/use-toast'
import { Badge } from "@/components/ui/badge"
import { Separator } from '@/components/ui/separator'

export default function TeacherAssignmentsPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [editingAssignment, setEditingAssignment] = useState<TeacherAssignment | null>(null)
  
  const [assignmentToDeleteId, setAssignmentToDeleteId] = useState<string | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  const { toast } = useToast()
  const db = useFirestore()

  const [localAssignments, setLocalAssignments] = useState<TeacherAssignment[]>([])
  const [isDirty, setIsDirty] = useState(false)

  const [selectedTeacherId, setSelectedTeacherId] = useState("")
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([])
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

  const groupedClassesByLevel = useMemo(() => {
    const groups: Record<number, Classroom[]> = {}
    sortedClasses.forEach(c => {
      if (!groups[c.gradeLevel]) groups[c.gradeLevel] = []
      groups[c.gradeLevel].push(c)
    })
    return groups
  }, [sortedClasses])

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
      const cls = classes?.find(c => c.id === a.classId)
      const displayClassName = cls ? cls.name : a.className
      const assignmentWithLatestName = { ...a, className: displayClassName }

      const existing = map.get(a.teacherId) || { 
        teacherId: a.teacherId, 
        teacherName: a.teacherName, 
        list: [], 
        totalJP: 0 
      }
      existing.list.push(assignmentWithLatestName)
      existing.totalJP += (a.totalJP || 0)
      map.set(a.teacherId, existing)
    })

    map.forEach(group => {
      group.list.sort((a, b) => a.className.localeCompare(b.className, undefined, { numeric: true, sensitivity: 'base' }))
    })

    return Array.from(map.values()).sort((a, b) => a.teacherName.localeCompare(b.teacherName))
  }, [localAssignments, classes])

  const handleOpenAdd = () => {
    setEditingAssignment(null)
    setSelectedTeacherId("")
    setSelectedClassIds([])
    setSelectedSubjectId("")
    setTotalJP("2")
    setIsDialogOpen(true)
  }

  const handleEditLocal = (a: TeacherAssignment) => {
    setEditingAssignment(a)
    setSelectedTeacherId(a.teacherId)
    setSelectedClassIds([a.classId])
    setSelectedSubjectId(a.subjectId)
    setTotalJP(a.totalJP?.toString() || "2")
    setIsDialogOpen(true)
  }

  const toggleClassSelection = (classId: string) => {
    setSelectedClassIds(prev => 
      prev.includes(classId) 
        ? prev.filter(id => id !== classId) 
        : [...prev, classId]
    )
  }

  const handleSaveLocal = () => {
    if (!selectedTeacherId || selectedClassIds.length === 0 || !selectedSubjectId) {
      toast({ variant: "destructive", title: "Mohon isi semua data", description: "Pilih guru, mapel, dan minimal satu kelas." })
      return
    }
    
    const teacher = sortedTeachers.find(t => t.id === selectedTeacherId)
    const subject = sortedSubjects.find(s => s.id === selectedSubjectId)
    const jpNum = parseInt(totalJP) || 0

    if (editingAssignment) {
      const cls = sortedClasses.find(c => c.id === selectedClassIds[0])
      const payload = {
        ...editingAssignment,
        teacherId: selectedTeacherId,
        teacherName: teacher?.fullName || "",
        classId: selectedClassIds[0],
        className: cls?.name || "",
        subjectId: selectedSubjectId,
        subjectName: subject?.name || "",
        totalJP: jpNum
      } as TeacherAssignment

      setLocalAssignments(prev => prev.map(a => a.id === editingAssignment.id ? payload : a))
    } else {
      const newAssignments: TeacherAssignment[] = selectedClassIds.map(cid => {
        const cls = sortedClasses.find(c => c.id === cid)
        return {
          id: `temp-${Date.now()}-${cid}`,
          teacherId: selectedTeacherId,
          teacherName: teacher?.fullName || "",
          classId: cid,
          className: cls?.name || "",
          subjectId: selectedSubjectId,
          subjectName: subject?.name || "",
          totalJP: jpNum
        } as TeacherAssignment
      })

      setLocalAssignments(prev => [...prev, ...newAssignments])
    }
    
    setIsDirty(true)
    setIsDialogOpen(false)
    toast({ title: editingAssignment ? "Perubahan Disimpan" : `${selectedClassIds.length} Penugasan Ditambahkan` })
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
        const cls = classes?.find(c => c.id === la.classId)
        const updatedLa = { ...la, className: cls ? cls.name : la.className }

        if (la.id.startsWith('temp-')) {
          const newRef = doc(collection(db, 'teacherAssignments'))
          const { id, ...data } = updatedLa
          batch.set(newRef, data)
        } else {
          const serverVer = serverAssignments.find(sa => sa.id === la.id)
          if (JSON.stringify(serverVer) !== JSON.stringify(updatedLa)) {
            batch.update(doc(db, 'teacherAssignments', la.id), updatedLa as any)
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
          <h1 className="text-2xl md:text-3xl font-headline font-bold">Penugasan Guru</h1>
          <div className="flex items-center gap-2 mt-1">
             <p className="text-muted-foreground text-sm">Hubungkan Guru dengan Mapel, Kelas, dan Beban Jam (JP).</p>
             {isDirty ? (
               <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse gap-1 text-[10px]"><CloudOff className="w-3 h-3" /> Belum Sinkron</Badge>
             ) : (
               <Badge className="bg-green-500/10 text-green-500 border-green-500/20 gap-1 text-[10px]"><CheckCircle2 className="w-3 h-3" /> Tersinkron</Badge>
             )}
          </div>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          {isDirty && (
            <Button onClick={handleSyncToCloud} disabled={isSyncing} className="flex-1 md:flex-none bg-green-600 hover:bg-green-700 gap-2">
              {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
              Sinkron
            </Button>
          )}
          <Button onClick={handleOpenAdd} className="flex-1 md:flex-none gap-2 shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4" /> Tambah
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {loadingA ? (
          <div className="text-center py-12"><Loader2 className="animate-spin mx-auto text-primary" /></div>
        ) : groupedAssignments.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground italic bg-card border rounded-xl">Belum ada penugasan guru.</div>
        ) : (
          groupedAssignments.map(group => (
            <Card key={group.teacherId} className="border-border/50 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <div className="flex flex-col md:flex-row">
                <div className="p-4 md:w-[250px] border-b md:border-b-0 md:border-r bg-primary/5 shrink-0">
                  <div className="flex items-center md:flex-col md:items-start gap-3 md:gap-4">
                    <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary border-2 border-primary/20 font-bold text-xl md:text-2xl shadow-inner">
                      {group.teacherName.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <span className="font-bold text-base md:text-lg block leading-tight text-foreground">{group.teacherName}</span>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <Badge variant="outline" className="text-[9px] md:text-[10px] uppercase font-bold tracking-wider">
                          {group.list.length} Rombel
                        </Badge>
                        <Badge className="bg-amber-500 text-white border-none font-bold text-[9px] md:text-[10px] py-0.5 px-2">
                          {group.totalJP} JP
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="flex-1 p-4 md:p-6 bg-card/50">
                  <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-3 text-[10px] font-black text-muted-foreground uppercase tracking-widest bg-muted/20 rounded-t-xl border-x border-t">
                    <div className="col-span-5 flex items-center gap-2"><BookMarked className="w-3.5 h-3.5" /> Mata Pelajaran</div>
                    <div className="col-span-4 flex items-center gap-2"><Users className="w-3.5 h-3.5" /> Kelas</div>
                    <div className="col-span-1 text-center">JP</div>
                    <div className="col-span-2 text-right pr-2">Aksi</div>
                  </div>
                  
                  <div className="space-y-3 md:space-y-0 md:divide-y md:border">
                    {group.list.map((asg, idx) => {
                      const isTemp = asg.id.startsWith('temp-')
                      return (
                        <div key={asg.id} className={`flex flex-col gap-3 p-4 md:p-0 md:grid md:grid-cols-12 md:gap-4 md:items-center md:px-4 md:py-3 rounded-xl md:rounded-none transition-all group/item ${idx % 2 === 1 ? 'md:bg-muted/5' : 'md:bg-transparent'} ${isTemp ? 'border-dashed border-2 border-amber-500/30 bg-amber-500/5' : 'border md:border-0 bg-card md:bg-transparent'} hover:bg-primary/[0.02] md:hover:bg-primary/[0.03]`}>
                          <div className="md:col-span-5">
                             <div className="flex items-center justify-between md:justify-start gap-3">
                               <div className="flex items-center gap-2 overflow-hidden">
                                  <div className="md:hidden p-2 bg-primary/10 rounded-lg"><BookMarked className="w-4 h-4 text-primary" /></div>
                                  <span className="text-sm md:text-[13px] font-bold text-foreground truncate">{asg.subjectName}</span>
                               </div>
                               <div className="flex items-center gap-2">
                                 {isTemp && <RefreshCw className="w-3 h-3 text-amber-500 animate-spin" />}
                                 <div className="md:hidden flex items-center gap-1.5">
                                   <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg border-primary/20 text-primary" onClick={() => handleEditLocal(asg)}><Pencil className="w-4 h-4" /></Button>
                                   <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg border-destructive/20 text-destructive" onClick={() => handleDeleteTrigger(asg.id)}><Trash2 className="w-4 h-4" /></Button>
                                 </div>
                               </div>
                             </div>
                          </div>
                          
                          <div className="flex items-center justify-between md:contents pt-2 md:pt-0 border-t md:border-0">
                             <div className="md:col-span-4">
                                <div className="flex items-center gap-2">
                                   <div className="md:hidden text-[10px] font-bold text-muted-foreground uppercase">Kelas:</div>
                                   <Badge variant="secondary" className="text-[10px] font-mono font-bold py-0.5 h-6 px-3 bg-accent/10 text-accent border-accent/20">
                                     {asg.className}
                                   </Badge>
                                </div>
                             </div>
                             <div className="md:col-span-1 text-right md:text-center">
                                <div className="flex flex-col md:block">
                                   <span className="md:hidden text-[9px] font-bold text-muted-foreground uppercase leading-none">Beban</span>
                                   <span className="text-sm md:text-[13px] font-black text-primary">{asg.totalJP} JP</span>
                                </div>
                             </div>
                          </div>

                          <div className="hidden md:flex md:col-span-2 justify-end gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                             <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:bg-primary/10 rounded-full" onClick={() => handleEditLocal(asg)}><Pencil className="w-4 h-4" /></Button>
                             <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 rounded-full" onClick={() => handleDeleteTrigger(asg.id)}><Trash2 className="w-4 h-4" /></Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[480px] max-h-[90vh] flex flex-col p-0 overflow-hidden shadow-2xl">
          <DialogHeader className="p-6 pb-2 border-b bg-muted/10 shrink-0">
            <DialogTitle>{editingAssignment ? 'Edit Penugasan' : 'Plotting Guru & Beban JP'}</DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 p-6 pt-4 overflow-y-auto scrollbar-thin">
            <div className="space-y-6 pb-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest flex items-center gap-2">
                  <UserCheck className="w-3 h-3" /> Pilih Guru
                </label>
                <Select value={selectedTeacherId} onValueChange={setSelectedTeacherId}>
                  <SelectTrigger className="h-11 focus:ring-primary transition-all"><SelectValue placeholder="Pilih Guru Pengajar" /></SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {sortedTeachers.map(t => (
                      <SelectItem key={t.id} value={t.id} className="cursor-pointer py-2.5">
                        {t.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest flex items-center gap-2">
                  <BookOpen className="w-3 h-3" /> Pilih Mata Pelajaran
                </label>
                <Select value={selectedSubjectId} onValueChange={setSelectedSubjectId}>
                  <SelectTrigger className="h-11 focus:ring-primary transition-all"><SelectValue placeholder="Pilih Mata Pelajaran" /></SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {sortedSubjects.map(s => (
                      <SelectItem key={s.id} value={s.id} className="cursor-pointer py-2.5">
                        {s.name} ({s.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest flex items-center gap-2">
                  <Users className="w-3 h-3" /> Pilih Rombongan Belajar (Kelas)
                </label>
                
                <div className="space-y-4 bg-muted/20 p-4 rounded-xl border border-border/50">
                  {Object.entries(groupedClassesByLevel).sort(([a],[b]) => parseInt(a)-parseInt(b)).map(([level, clsList]) => (
                    <div key={level} className="space-y-2">
                      <div className="flex items-center gap-2">
                         <Badge variant="outline" className="text-[9px] font-bold">TINGKAT {level}</Badge>
                         <div className="h-px bg-border flex-1"></div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {clsList.map(c => (
                          <div 
                            key={c.id} 
                            className={`flex items-center space-x-2 p-2.5 rounded-lg border transition-all cursor-pointer hover:bg-background ${selectedClassIds.includes(c.id) ? 'bg-primary/10 border-primary/40 ring-1 ring-primary/20' : 'bg-background/50 border-transparent'}`}
                            onClick={() => toggleClassSelection(c.id)}
                          >
                            <Checkbox 
                              id={`class-${c.id}`} 
                              checked={selectedClassIds.includes(c.id)}
                              className="h-4 w-4 pointer-events-none"
                            />
                            <Label className="text-xs font-bold cursor-pointer select-none pointer-events-none">
                              {c.name}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {sortedClasses.length === 0 && (
                    <p className="text-center text-xs text-muted-foreground italic py-4">Belum ada data kelas.</p>
                  )}
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <label className="text-[10px] font-bold uppercase text-primary tracking-widest">Beban Jam Pelajaran (JP / Minggu)</label>
                <Input type="text" inputMode="numeric" value={totalJP} onChange={e => setTotalJP(e.target.value.replace(/[^0-9]/g, ''))} className="h-11 font-bold text-lg" placeholder="Contoh: 4" />
              </div>
            </div>
          </div>
          
          <DialogFooter className="p-6 border-t bg-muted/5 shrink-0">
            <Button onClick={handleSaveLocal} className="w-full h-12 shadow-xl shadow-primary/20 font-bold text-md">
              {editingAssignment ? 'Simpan Perubahan' : `Simpan ${selectedClassIds.length > 0 ? selectedClassIds.length : ''} Penugasan ke Draf`}
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
              Tindakan ini akan menghapus draf penugasan guru dari daftar sementara Anda.
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
