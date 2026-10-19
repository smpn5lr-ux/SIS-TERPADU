
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
  Info,
  Check
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
import { Label } from "@/components/ui/label"
import { useUser, useFirestore, useMemoFirebase, useCollection, useDoc } from "@/firebase"
import { collection, query, where, doc, writeBatch } from "firebase/firestore"
import { TeacherAssignment, Applicant, Classroom, Journal } from "@/lib/types"
import { useToast } from '@/hooks/use-toast'
import { Html5Qrcode } from 'html5-qrcode'

function TeachingJournalPageContent() {
  const { assignmentId } = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const db = useFirestore()
  const { user, loading: userLoading } = useUser()
  const { toast } = useToast()
  
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [editingJournalId, setEditingJournalId] = useState<string | null>(null)
  
  const [localJournals, setLocalJournals] = useState<Journal[]>([])
  const [isDirty, setIsDirty] = useState(false)

  const [journalToDeleteId, setJournalToDeleteId] = useState<string | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const scannerDivId = "qr-reader-journal"

  const activeSemester = parseInt(searchParams.get('semester') || "1")
  const autoScan = searchParams.get('scan') === '1'

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
  const { data: serverJournals } = useCollection<Journal>(journalQuery)

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
    attendanceDetail: {},
    absentStudents: [],
    hasTask: false,
    taskType: 'task1',
    taskScores: {},
    notes: ""
  })

  // Handle auto-open scanner from dashboard
  useEffect(() => {
    if (autoScan && !loadingA && assignment) {
      handleOpenScanner();
    }
  }, [autoScan, loadingA, assignment]);

  const handleOpenScanner = () => {
    // If we are creating a new journal, just open scanner
    // Otherwise, find the journal for today or last meeting
    const today = new Date().toISOString().split('T')[0];
    const existingToday = localJournals.find(j => j.date === today);
    
    if (existingToday) {
      setEditingJournalId(existingToday.id);
      setNewJournal(existingToday);
    } else {
      setEditingJournalId(null);
      const nextMeeting = localJournals.length > 0 ? Math.max(...localJournals.map(j => j.meetingNumber)) + 1 : 1;
      setNewJournal({
        meetingNumber: nextMeeting,
        date: today,
        jamKe: "1-2",
        jp: 2,
        attendanceDetail: {},
        absentStudents: [],
        taskScores: {}
      });
    }
    
    setIsScannerOpen(true);
    setTimeout(() => startScanner(), 300);
  };

  const startScanner = async () => {
    if (!scannerRef.current) {
      scannerRef.current = new Html5Qrcode(scannerDivId);
    }
    
    try {
      await scannerRef.current.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          handleScanSuccess(decodedText);
        },
        () => {}
      );
    } catch (err) {
      console.error("Scanner error", err);
      toast({ variant: "destructive", title: "Gagal Kamera", description: "Pastikan izin kamera diaktifkan." });
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      await scannerRef.current.stop();
    }
    setIsScannerOpen(false);
  };

  const handleScanSuccess = (studentId: string) => {
    const student = students.find(s => s.id === studentId);
    if (!student) {
      toast({ variant: "destructive", title: "Siswa Tidak Dikenali", description: "QR bukan milik siswa kelas ini." });
      return;
    }

    setNewJournal(prev => {
      const detail = { ...(prev.attendanceDetail || {}) };
      if (detail[studentId] === 'H') {
        toast({ title: "Sudah Hadir", description: `${student.fullName} sudah diproses.` });
        return prev;
      }
      
      detail[studentId] = 'H';
      toast({ 
        title: "Scan Berhasil", 
        description: `${student.fullName} hadir.`,
        className: "bg-green-600 text-white" 
      });

      return { ...prev, attendanceDetail: detail };
    });
  };

  const onSaveLocal = () => {
    const journalData = {
      ...newJournal,
      id: editingJournalId || `temp-${Date.now()}`,
      assignmentId: assignmentId as string,
      semester: activeSemester,
      updatedAt: new Date().toISOString(),
      createdAt: editingJournalId ? localJournals.find(j => j.id === editingJournalId)?.createdAt : new Date().toISOString(),
      // Recalculate absent students for logic consistency
      absentStudents: students.filter(s => newJournal.attendanceDetail?.[s.id] !== 'H').map(s => s.id)
    } as Journal

    if (editingJournalId) {
      setLocalJournals(prev => prev.map(j => j.id === editingJournalId ? journalData : j))
    } else {
      setLocalJournals(prev => [...prev, journalData])
    }
    
    setIsDirty(true)
    setIsAddOpen(false)
    setEditingJournalId(null)
    toast({ title: "Jurnal Disimpan di Buffer" })
  }

  const handleSyncToCloud = async () => {
    if (!db || !assignmentId || !serverJournals) return
    setIsSyncing(true)
    const batch = writeBatch(db)
    
    try {
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

      // Recalculate Attendance & Task Scores for Assessments
      students.forEach(s => {
        const totalMeetings = localJournals.length
        const attendances = localJournals.filter(j => j.attendanceDetail?.[s.id] === 'H').length
        const attendancePercent = totalMeetings > 0 ? Math.round((attendances / totalMeetings) * 100) : 100
        
        const assessmentId = `${assignmentId}_${s.id}_sem${activeSemester}`
        const aRef = doc(db, 'assessments', assessmentId)
        
        const baseUpdate: any = {
          studentId: s.id,
          assignmentId,
          semester: activeSemester,
          attendance: attendancePercent,
          updatedAt: new Date().toISOString()
        }

        localJournals.forEach(lj => {
          if (lj.hasTask && lj.taskType && lj.taskScores?.[s.id] !== undefined) {
            baseUpdate[lj.taskType] = lj.taskScores[s.id]
          }
        })

        batch.set(aRef, baseUpdate, { merge: true })
      })

      await batch.commit()
      setIsDirty(false)
      toast({ title: "Data Berhasil Sinkron" })
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
                 <Badge className="bg-amber-500/10 text-amber-500 animate-pulse gap-1"><CloudOff className="w-3 h-3" /> Ada Draf Baru</Badge>
               ) : (
                 <Badge className="bg-green-500/10 text-green-500 gap-1"><CheckCircle2 className="w-3 h-3" /> Tersinkron</Badge>
               )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isDirty && (
            <Button onClick={handleSyncToCloud} disabled={isSyncing} className="bg-green-600 shadow-lg shadow-green-500/20 gap-2">
              {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
              Simpan Cloud
            </Button>
          )}
          <Button variant="outline" onClick={handleOpenScanner} className="gap-2 border-primary/30 text-primary">
            <ScanLine className="w-4 h-4" /> Absen QR
          </Button>
          <Button onClick={() => { setEditingJournalId(null); setIsAddOpen(true); }} className="gap-2 shadow-lg shadow-primary/20"><Plus className="w-4 h-4" /> Input Jurnal</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {journals.length === 0 ? (
          <Card className="border-dashed border-2 py-20 flex flex-col items-center justify-center text-muted-foreground">
            <BookOpen className="w-12 h-12 opacity-20 mb-4" />
            <p>Belum ada catatan jurnal mengajar.</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {journals.map((j) => {
              const isTemp = j.id.startsWith('temp-')
              const attendCount = Object.values(j.attendanceDetail || {}).filter(v => v === 'H').length;
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
                  <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <Label className="text-[10px] uppercase font-bold text-primary">Materi Pembelajaran:</Label>
                      <p className="mt-1 font-medium">{j.material || "-"}</p>
                    </div>
                    <div className="flex items-center justify-between bg-muted/20 p-3 rounded-lg border">
                       <div>
                         <Label className="text-[10px] uppercase font-bold text-accent">Kehadiran Siswa:</Label>
                         <p className="text-lg font-bold">{attendCount} / {students.length}</p>
                       </div>
                       <Badge variant="outline" className="bg-background">{Math.round((attendCount/students.length)*100)}% Hadir</Badge>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* DIALOG SCANNER QR */}
      <Dialog open={isScannerOpen} onOpenChange={(v) => { if(!v) stopScanner(); setIsScannerOpen(v); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ScanLine className="w-5 h-5 text-primary" /> Pemindai Absensi QR</DialogTitle>
            <DialogDescription>Arahkan kamera ke kartu QR siswa untuk mencatat kehadiran.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
             <div id={scannerDivId} className="w-full aspect-square bg-black rounded-xl overflow-hidden shadow-inner border-4 border-muted/50"></div>
             
             <div className="bg-primary/5 p-4 rounded-xl border border-primary/20">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-[10px] font-bold uppercase text-primary">Siswa Terdeteksi:</Label>
                  <Badge variant="secondary" className="text-[10px]">{Object.keys(newJournal.attendanceDetail || {}).length} Siswa</Badge>
                </div>
                <div className="max-h-[150px] overflow-y-auto space-y-1">
                   {Object.entries(newJournal.attendanceDetail || {}).filter(([_,v]) => v === 'H').reverse().map(([id]) => {
                     const s = students.find(x => x.id === id);
                     return (
                       <div key={id} className="flex items-center justify-between text-xs p-2 bg-background rounded-md border border-border/50 animate-in fade-in slide-in-from-right-4">
                          <span className="font-bold">{s?.fullName}</span>
                          <Check className="w-3 h-3 text-green-500" />
                       </div>
                     )
                   })}
                   {Object.keys(newJournal.attendanceDetail || {}).length === 0 && (
                     <p className="text-center text-[10px] text-muted-foreground italic py-4">Belum ada scan masuk...</p>
                   )}
                </div>
             </div>
          </div>
          <DialogFooter className="grid grid-cols-2 gap-2">
            <Button variant="ghost" onClick={stopScanner}>Tutup & Batal</Button>
            <Button onClick={() => { stopScanner(); onSaveLocal(); }} className="bg-primary shadow-lg shadow-primary/20">Simpan Kehadiran</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG INPUT JURNAL */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[850px] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingJournalId ? 'Edit Catatan Mengajar' : 'Input Jurnal Baru'}</DialogTitle></DialogHeader>
          <div className="space-y-8 py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-muted/20 p-4 rounded-xl border">
              <div className="space-y-2"><Label className="text-[10px] font-bold uppercase">Pertemuan Ke-</Label><Input type="number" value={newJournal.meetingNumber || 0} onChange={e => setNewJournal({...newJournal, meetingNumber: parseInt(e.target.value) || 0})} /></div>
              <div className="space-y-2"><Label className="text-[10px] font-bold uppercase">Tanggal</Label><Input type="date" value={newJournal.date || ""} onChange={e => setNewJournal({...newJournal, date: e.target.value})} /></div>
              <div className="space-y-2"><Label className="text-[10px] font-bold uppercase">Jam Ke</Label><Input placeholder="1-2" value={newJournal.jamKe || ""} onChange={e => setNewJournal({...newJournal, jamKe: e.target.value})} /></div>
              <div className="space-y-2"><Label className="text-[10px] font-bold uppercase">Durasi (JP)</Label><Input type="number" value={newJournal.jp || 0} onChange={e => setNewJournal({...newJournal, jp: parseInt(e.target.value) || 0})} /></div>
            </div>
            
            <div className="space-y-2"><Label className="text-[10px] font-bold uppercase text-primary">Materi Pembelajaran</Label><Textarea placeholder="Tuliskan pokok bahasan atau materi yang diajarkan..." value={newJournal.material || ""} onChange={e => setNewJournal({...newJournal, material: e.target.value})} className="h-24" /></div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-bold uppercase text-accent">Daftar Kehadiran & Partisipasi</Label>
                <Button variant="outline" size="sm" onClick={() => {
                  const allH: any = {};
                  students.forEach(s => allH[s.id] = 'H');
                  setNewJournal({...newJournal, attendanceDetail: allH});
                }} className="h-7 text-[9px] font-bold">SET SEMUA HADIR</Button>
              </div>
              <div className="border rounded-xl overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/50"><TableRow><TableHead>Nama Siswa</TableHead><TableHead className="text-center w-40">Status Absensi</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {students.map(s => (
                      <TableRow key={s.id} className="h-12">
                        <TableCell className="text-xs font-bold">{s.fullName}</TableCell>
                        <TableCell>
                          <div className="flex justify-center gap-1">
                            {['H', 'S', 'I', 'A'].map(v => (
                              <button
                                key={v}
                                onClick={() => {
                                  const detail = { ...(newJournal.attendanceDetail || {}) };
                                  detail[s.id] = v as any;
                                  setNewJournal({...newJournal, attendanceDetail: detail});
                                }}
                                className={`w-8 h-8 rounded-md text-[10px] font-bold transition-all border ${
                                  newJournal.attendanceDetail?.[s.id] === v 
                                    ? 'bg-primary text-white border-primary shadow-md' 
                                    : 'bg-background hover:bg-muted text-muted-foreground'
                                }`}
                              >
                                {v}
                              </button>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
          <DialogFooter className="border-t pt-4">
            <Button onClick={onSaveLocal} className="w-full h-11 bg-primary">Simpan ke Buffer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-destructive" /> Hapus Jurnal?</AlertDialogTitle>
            <AlertDialogDescription>Data akan dihapus dari draf. Klik Sinkron setelahnya untuk menghapus permanen dari cloud.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={executeDeleteLocal} className="bg-destructive text-destructive-foreground">Ya, Hapus Jurnal</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default function TeachingJournalPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-24"><Loader2 className="animate-spin text-primary" /></div>}>
      <TeachingJournalPageContent />
    </Suspense>
  )
}
