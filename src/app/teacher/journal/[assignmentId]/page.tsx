
"use client"

import React, { useState, useMemo, useEffect, Suspense, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { 
  ArrowLeft, 
  Save, 
  Loader2, 
  Plus,
  Calendar,
  BookOpen,
  Users,
  CheckCircle2,
  Trash2,
  AlertCircle,
  RefreshCw,
  Download,
  Clock,
  Target,
  FileText,
  Pencil,
  Search,
  QrCode,
  ScanLine,
  X,
  Camera,
  ShieldAlert,
  CloudUpload,
  CloudOff,
  Info
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
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
  DialogDescription,
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
import { Switch } from "@/components/ui/switch"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { useUser, useFirestore, useMemoFirebase, useCollection, useDoc, useAuth } from "@/firebase"
import { collection, query, where, doc, writeBatch, deleteDoc, updateDoc } from "firebase/firestore"
import { TeacherAssignment, Applicant, Classroom, Journal } from "@/lib/types"
import { useToast } from '@/hooks/use-toast'
import { Html5Qrcode } from 'html5-qrcode'

function TeachingJournalPageContent() {
  const { assignmentId } = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const db = useFirestore()
  const auth = useAuth()
  const { user, loading: userLoading } = useUser()
  const { toast } = useToast()
  
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [editingJournalId, setEditingJournalId] = useState<string | null>(null)
  const [studentSearchTerm, setStudentSearchTerm] = useState('')
  
  const [localJournals, setLocalJournals] = useState<Journal[]>([])
  const [isDirty, setIsDirty] = useState(false)

  const [journalToDeleteId, setJournalToDeleteId] = useState<string | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const scannerDivId = "qr-reader-journal"

  const activeSemester = parseInt(searchParams.get('semester') || "1")

  const assignmentRef = useMemoFirebase(() => db && assignmentId ? doc(db, 'teacherAssignments', assignmentId as string) : null, [db, assignmentId])
  const { data: assignment, loading: loadingA } = useDoc<TeacherAssignment>(assignmentRef)

  const classRef = useMemoFirebase(() => db && assignment ? doc(db, 'classes', assignment.classId) : null, [db, assignment])
  const { data: classroom } = useDoc<Classroom>(classRef)

  const studentsQuery = useMemoFirebase(() => db ? query(collection(db, 'applicants'), where('admissionStatus', '==', 'accepted')) : null, [db])
  const { data: allAcceptedStudents } = useCollection<Applicant>(studentsQuery)

  const students = useMemo(() => {
    if (!allAcceptedStudents || !classroom?.students) return []
    return allAcceptedStudents
      .filter(s => classroom.students.includes(s.id) && !s.isDeleted)
      .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""))
  }, [allAcceptedStudents, classroom])

  const journalQuery = useMemoFirebase(() => db && assignmentId ? query(collection(db, 'journals'), where('assignmentId', '==', assignmentId)) : null, [db, assignmentId])
  const { data: serverJournals, loading: loadingJ } = useCollection<Journal>(journalQuery)

  useEffect(() => {
    if (serverJournals && !isDirty) {
      setLocalJournals(serverJournals.filter(j => j.semester === activeSemester))
    }
  }, [serverJournals, isDirty, activeSemester])

  const journals = useMemo(() => {
    return [...localJournals].sort((a, b) => (a.meetingNumber || 0) - (b.meetingNumber || 0))
  }, [localJournals])

  const [newJournal, setNewJournal] = useState<Partial<Journal>>({
    meetingNumber: 1,
    date: new Date().toISOString().split('T')[0],
    jamKe: "1-2",
    jp: 2,
    learningGoal: "",
    material: "",
    kktpAchievement: "",
    attendanceDetail: {},
    absentStudents: [],
    hasTask: false,
    taskType: 'task1',
    taskScores: {},
    notes: ""
  })

  const onSaveLocal = () => {
    const journalData = {
      ...newJournal,
      id: editingJournalId || `temp-${Date.now()}`,
      assignmentId: assignmentId as string,
      semester: activeSemester,
      updatedAt: new Date().toISOString(),
      createdAt: editingJournalId ? localJournals.find(j => j.id === editingJournalId)?.createdAt : new Date().toISOString()
    } as Journal

    if (editingJournalId) {
      setLocalJournals(prev => prev.map(j => j.id === editingJournalId ? journalData : j))
    } else {
      setLocalJournals(prev => [...prev, journalData])
    }
    
    setIsDirty(true)
    setIsAddOpen(false)
    setEditingJournalId(null)
    toast({ title: "Jurnal Disimpan di Buffer", description: "Klik Sinkronkan untuk mengirim ke database." })
  }

  const handleSyncToCloud = async () => {
    if (!db || !assignmentId || !serverJournals) return
    setIsSyncing(true)
    const batch = writeBatch(db)
    
    try {
      // 1. Manage Journals
      const currentSemesterServerJournals = serverJournals.filter(j => j.semester === activeSemester)
      const toDelete = currentSemesterServerJournals.filter(sj => !localJournals.some(lj => lj.id === sj.id))
      toDelete.forEach(j => batch.delete(doc(db, 'journals', j.id)))

      localJournals.forEach(lj => {
        if (lj.id.startsWith('temp-')) {
          const { id, ...data } = lj
          batch.set(doc(collection(db, 'journals')), data)
        } else {
          const serverVer = serverJournals.find(sj => sj.id === lj.id)
          if (JSON.stringify(serverVer) !== JSON.stringify(lj)) {
            batch.update(doc(db, 'journals', lj.id), lj as any)
          }
        }
      })

      // 2. Recalculate Attendance & Task Scores for Assessments
      students.forEach(s => {
        const absences = localJournals.filter(j => j.absentStudents?.includes(s.id)).length
        const totalMeetings = localJournals.length
        const attendancePercent = totalMeetings > 0 ? Math.round(((totalMeetings - absences) / totalMeetings) * 100) : 100
        
        const assessmentId = `${assignmentId}_${s.id}_sem${activeSemester}`
        const aRef = doc(db, 'assessments', assessmentId)
        
        // Base assessment data
        const baseUpdate: any = {
          studentId: s.id,
          assignmentId,
          semester: activeSemester,
          attendance: attendancePercent,
          updatedAt: new Date().toISOString()
        }

        // Add task scores from local journals
        localJournals.forEach(lj => {
          if (lj.hasTask && lj.taskType && lj.taskScores?.[s.id] !== undefined) {
            baseUpdate[lj.taskType] = lj.taskScores[s.id]
          }
        })

        batch.set(aRef, baseUpdate, { merge: true })
      })

      await batch.commit()
      setIsDirty(false)
      toast({ title: "Jurnal & Nilai Berhasil Tersinkron" })
    } catch (e) {
      toast({ variant: "destructive", title: "Gagal Sinkronisasi" })
    } finally {
      setIsSyncing(false)
    }
  }

  const handleDeleteTrigger = (id: string) => {
    setJournalToDeleteId(id)
    setIsDeleteDialogOpen(true)
  }

  const executeDeleteLocal = () => {
    if (!journalToDeleteId) return
    setLocalJournals(prev => prev.filter(j => j.id !== journalToDeleteId))
    setIsDirty(true)
    setIsDeleteDialogOpen(false)
    setJournalToDeleteId(null)
    toast({ title: "Dihapus dari draf" })
  }

  if (userLoading || loadingA) return <div className="flex justify-center py-24"><Loader2 className="animate-spin" /></div>

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full border"><ArrowLeft className="w-4 h-4" /></Button>
          <div>
            <h1 className="text-2xl font-bold">Jurnal: {assignment?.subjectName}</h1>
            <div className="flex items-center gap-2 mt-1">
               <Badge variant="outline">Kelas {assignment?.className}</Badge>
               {isDirty ? (
                 <Badge className="bg-amber-500/10 text-amber-500 animate-pulse gap-1"><CloudOff className="w-3 h-3" /> Perubahan Belum Sinkron</Badge>
               ) : (
                 <Badge className="bg-green-500/10 text-green-500 gap-1"><CheckCircle2 className="w-3 h-3" /> Tersinkron</Badge>
               )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {isDirty && (
            <Button onClick={handleSyncToCloud} disabled={isSyncing} className="bg-green-600 shadow-lg shadow-green-500/20 gap-2">
              {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
              Simpan Permanen ke Cloud
            </Button>
          )}
          <Button onClick={() => { setEditingJournalId(null); setIsAddOpen(true); }} className="gap-2 shadow-lg shadow-primary/20"><Plus className="w-4 h-4" /> Tambah Jurnal</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {journals.length === 0 ? (
          <Card className="border-dashed border-2 py-20 flex flex-col items-center justify-center text-muted-foreground">
            <BookOpen className="w-12 h-12 opacity-20 mb-4" />
            <p>Belum ada catatan jurnal. Klik tombol tambah di atas.</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {journals.map((j) => {
              const isTemp = j.id.startsWith('temp-')
              return (
                <Card key={j.id} className={`border-border/50 overflow-hidden bg-card/30 ${isTemp ? 'border-dashed border-2 border-amber-500/30' : ''}`}>
                  <CardHeader className="bg-muted/10 p-4 border-b">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center font-bold text-primary">{j.meetingNumber}</div>
                        <div>
                          <CardTitle className="text-base font-bold flex items-center gap-2">Pertemuan Ke-{j.meetingNumber} {isTemp && <RefreshCw className="w-3 h-3 text-amber-500 animate-spin" />}</CardTitle>
                          <CardDescription className="text-xs">{new Date(j.date).toLocaleDateString('id-ID', { dateStyle: 'full' })}</CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" onClick={() => { setEditingJournalId(j.id); setNewJournal(j); setIsAddOpen(true); }} className="h-8 w-8 hover:text-primary"><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteTrigger(j.id)} className="text-destructive h-8 w-8"><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div><Label className="text-[10px] uppercase font-bold text-primary">Materi:</Label><p>{j.material || "-"}</p></div>
                      <div><Label className="text-[10px] uppercase font-bold text-accent">Status Absensi:</Label><p className="text-xs">{Object.values(j.attendanceDetail || {}).filter(v => v !== 'H').length} Siswa Tidak Hadir</p></div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <div className="bg-accent/5 p-4 rounded-xl border border-accent/20 flex gap-4 mt-8">
         <Info className="w-5 h-5 text-accent shrink-0 mt-0.5" />
         <div className="text-xs text-muted-foreground leading-relaxed italic">
           <strong>Offline Mode Aktif:</strong> Anda dapat mengisi jurnal & absensi tanpa koneksi internet yang stabil. Seluruh data yang Anda masukkan disimpan di memori browser. Jangan lupa menekan tombol <strong>"Simpan Permanen"</strong> saat sudah mendapatkan sinyal WiFi/Internet agar nilai terhitung ke sistem raport.
         </div>
      </div>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[850px] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingJournalId ? 'Edit Jurnal (Draft)' : 'Input Jurnal Baru (Draft)'}</DialogTitle></DialogHeader>
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2"><Label>Pertemuan Ke-</Label><Input type="number" value={newJournal.meetingNumber || 0} onChange={e => setNewJournal({...newJournal, meetingNumber: parseInt(e.target.value) || 0})} /></div>
              <div className="space-y-2"><Label>Tanggal</Label><Input type="date" value={newJournal.date || ""} onChange={e => setNewJournal({...newJournal, date: e.target.value})} /></div>
              <div className="space-y-2"><Label>Jam Ke</Label><Input placeholder="1-2" value={newJournal.jamKe || ""} onChange={e => setNewJournal({...newJournal, jamKe: e.target.value})} /></div>
              <div className="space-y-2"><Label>JP</Label><Input type="number" value={newJournal.jp || 0} onChange={e => setNewJournal({...newJournal, jp: parseInt(e.target.value) || 0})} /></div>
            </div>
            <div className="space-y-2"><Label>Materi Pembelajaran</Label><Textarea placeholder="Bahasan materi..." value={newJournal.material || ""} onChange={e => setNewJournal({...newJournal, material: e.target.value})} /></div>
          </div>
          <DialogFooter><Button onClick={onSaveLocal} className="w-full">Simpan ke Buffer</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-destructive" /> Hapus Jurnal?</AlertDialogTitle>
            <AlertDialogDescription>Tindakan ini menghapus jurnal dari draf Anda. Pastikan Sinkron setelahnya agar data di server benar-benar terhapus.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={executeDeleteLocal} className="bg-destructive text-destructive-foreground">Ya, Hapus</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default function TeachingJournalPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-24"><Loader2 className="animate-spin" /></div>}>
      <TeachingJournalPageContent />
    </Suspense>
  )
}
