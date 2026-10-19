
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
  Check,
  ChevronLeft
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
import { useToast } from "@/hooks/use-toast"
import { Html5Qrcode } from 'html5-qrcode'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

type PageView = 'list' | 'form' | 'scanner'

function TeachingJournalPageContent() {
  const { assignmentId } = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const db = useFirestore()
  const { user, loading: userLoading } = useUser()
  const { toast } = useToast()
  
  const [activeView, setActiveView] = useState<PageView>('list')
  const [isSyncing, setIsSyncing] = useState(false)
  const [editingJournalId, setEditingJournalId] = useState<string | null>(null)
  
  const [localJournals, setLocalJournals] = useState<Journal[]>([])
  const [isDirty, setIsDirty] = useState(false)

  const [journalToDeleteId, setJournalToDeleteId] = useState<string | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const scannerDivId = "qr-reader-journal-full"

  const activeSemester = parseInt(searchParams.get('semester') || "1")
  const autoScan = searchParams.get('scan') === '1'

  const assignmentRef = useMemoFirebase(() => db && assignmentId ? doc(db, 'teacherAssignments', assignmentId as string) : null, [db, assignmentId])
  const { data: assignment, loading: loadingA } = useDoc<TeacherAssignment>(assignmentRef)

  const classRef = useMemoFirebase(() => db && assignment ? doc(db, 'classes', assignment.classId) : null, [db, assignment])
  const { data: classroom } = useDoc<Classroom>(classRef)

  // Memperluas kueri untuk menyertakan 'graduated' agar pencarian lebih robust
  const studentsQuery = useMemoFirebase(() => db ? query(collection(db, 'applicants'), where('admissionStatus', 'in', ['accepted', 'graduated'])) : null, [db])
  const { data: allAcceptedStudents } = useCollection<Applicant>(studentsQuery)

  const students = useMemo(() => {
    if (!allAcceptedStudents || !classroom?.students) return []
    return allAcceptedStudents
      .filter(s => classroom.students.includes(s.id) && !s.isDeleted)
      .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""))
  }, [allAcceptedStudents, classroom])

  // PENTING: Gunakan Ref untuk menghindari closure stale di callback scanner
  const studentsRef = useRef<Applicant[]>([])
  useEffect(() => {
    studentsRef.current = students
  }, [students])

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

  useEffect(() => {
    if (autoScan && !loadingA && assignment) {
      handleOpenScanner();
    }
  }, [autoScan, loadingA, assignment]);

  const handleOpenScanner = () => {
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
    
    setActiveView('scanner');
    setTimeout(() => startScanner(), 500);
  };

  const startScanner = async () => {
    if (!scannerRef.current) {
      scannerRef.current = new Html5Qrcode(scannerDivId);
    }
    
    try {
      if (!scannerRef.current.isScanning) {
        await scannerRef.current.start(
          { facingMode: "environment" },
          { fps: 15, qrbox: (width, height) => { return { width: width, height: height } } },
          (decodedText) => {
            handleScanSuccess(decodedText);
          },
          () => {}
        );
      }
    } catch (err) {
      console.error("Scanner error", err);
      toast({ variant: "destructive", title: "Gagal Kamera", description: "Pastikan izin kamera diaktifkan." });
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      await scannerRef.current.stop();
    }
    setActiveView('list');
  };

  const handleScanSuccess = (studentId: string) => {
    // Baca dari Ref agar selalu mendapatkan data terbaru meskipun callback terkunci (closure)
    const currentStudents = studentsRef.current;
    const student = currentStudents.find(s => s.id === studentId);
    
    if (!student) {
      toast({ 
        variant: "destructive", 
        title: "Siswa Tidak Dikenali", 
        description: "QR ini tidak terdaftar sebagai murid di kelas ini." 
      });
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
      absentStudents: students.filter(s => newJournal.attendanceDetail?.[s.id] !== 'H').map(s => s.id)
    } as Journal

    if (editingJournalId) {
      setLocalJournals(prev => prev.map(j => j.id === editingJournalId ? journalData : j))
    } else {
      setLocalJournals(prev => [...prev, journalData])
    }
    
    setIsDirty(true)
    setActiveView('list')
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

  if (userLoading || loadingA) return <div className="flex justify-center py-24"><Loader2 className="animate-spin text-primary" /></div>

  // --- VIEW: SCANNER QR ---
  if (activeView === 'scanner') {
    const scanCount = Object.values(newJournal.attendanceDetail || {}).filter(v => v === 'H').length;
    return (
      <div className="flex flex-col h-[calc(100vh-4rem)] animate-in fade-in duration-300 overflow-hidden">
        <style dangerouslySetInnerHTML={{ __html: `
          #qr-reader-journal-full video {
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
          }
          #qr-reader-journal-full {
            border: none !important;
          }
          @keyframes scanLineAnim {
            0% { top: 0%; }
            100% { top: 100%; }
          }
          .custom-scan-line {
            position: absolute;
            left: 0;
            width: 100%;
            height: 3px;
            background: linear-gradient(to right, transparent, #4361ee, transparent);
            box-shadow: 0 0 15px #4361ee;
            animation: scanLineAnim 3s linear infinite;
            z-index: 25;
          }
        ` }} />
        
        <div className="bg-card border-b p-4 sm:p-5 flex items-center justify-between sticky top-0 z-50">
          <div className="flex items-center gap-4">
             <Button variant="ghost" size="icon" onClick={stopScanner} className="h-10 w-10 border hover:bg-muted rounded-full"><ChevronLeft className="w-6 h-6" /></Button>
             <div>
               <h1 className="font-bold text-lg leading-tight">Absensi QR</h1>
               <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">{assignment?.subjectName} • KELAS {assignment?.className}</p>
             </div>
          </div>
          <Button onClick={() => { stopScanner(); onSaveLocal(); }} className="bg-primary h-11 px-6 gap-2 shadow-xl shadow-primary/20 font-bold">
            <CheckCircle2 className="w-4 h-4" /> Simpan {scanCount} Murid
          </Button>
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 overflow-hidden bg-black">
           {/* SCANNER AREA */}
           <div className="relative flex flex-col items-center justify-center overflow-hidden">
              {/* Reference Style Text Overlay */}
              <div className="absolute top-10 left-0 right-0 z-40 text-center text-white pointer-events-none drop-shadow-lg px-4">
                <h2 className="text-xl sm:text-2xl font-bold uppercase tracking-[0.1em]">Scan Qr Code</h2>
                <p className="text-[10px] sm:text-xs mt-2 font-medium opacity-80 uppercase tracking-[0.2em] max-w-[280px] mx-auto">TEMPATKAN KAMERA TEPAT DI DEPAN QR CODE</p>
              </div>

              <div className="w-full h-full relative bg-slate-950">
                 <div id={scannerDivId} className="absolute inset-0 z-10"></div>
                 
                 {/* Full View Scanning Line */}
                 <div className="custom-scan-line"></div>
              </div>
           </div>

           {/* LIST AREA */}
           <div className="bg-background flex flex-col overflow-hidden border-l border-border/50">
              <div className="p-4 sm:p-5 border-b bg-muted/20 flex items-center justify-between">
                 <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                    <h3 className="text-xs font-bold uppercase text-foreground tracking-widest">Siswa Terdeteksi</h3>
                 </div>
                 <Badge className="bg-primary text-white font-mono px-3 py-1 text-sm">{scanCount} / {students.length}</Badge>
              </div>
              <ScrollArea className="flex-1">
                 <div className="p-4 sm:p-6 space-y-3">
                    {Object.entries(newJournal.attendanceDetail || {}).filter(([_,v]) => v === 'H').reverse().map(([id]) => {
                       const s = students.find(x => x.id === id);
                       return (
                         <div key={id} className="flex items-center justify-between p-4 bg-card border border-border/50 rounded-2xl animate-in slide-in-from-right-4 shadow-sm group hover:border-primary/30 transition-all">
                            <div className="flex items-center gap-4">
                               <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                                  {s?.fullName?.charAt(0)}
                               </div>
                               <div className="flex flex-col">
                                 <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{s?.fullName}</span>
                                 <span className="text-[10px] text-muted-foreground font-mono mt-0.5">{s?.NISN}</span>
                               </div>
                            </div>
                            <div className="bg-green-500/10 p-2 rounded-full border border-green-500/20">
                               <Check className="w-4 h-4 text-green-500" />
                            </div>
                         </div>
                       )
                    })}
                    {scanCount === 0 && (
                      <div className="flex flex-col items-center justify-center py-32 text-center text-muted-foreground/40">
                        <QrCode className="w-16 h-16 opacity-10 mb-4" />
                        <p className="text-xs font-medium tracking-wide uppercase">Menunggu Pemindaian...</p>
                      </div>
                    )}
                 </div>
              </ScrollArea>
           </div>
        </div>
      </div>
    )
  }

  // --- VIEW: FORM JURNAL ---
  if (activeView === 'form') {
    return (
      <div className="flex flex-col h-full space-y-6 animate-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setActiveView('list')} className="rounded-full border"><ArrowLeft className="w-4 h-4" /></Button>
            <div>
              <h1 className="text-2xl font-bold">{editingJournalId ? 'Edit Jurnal' : 'Input Jurnal Baru'}</h1>
              <p className="text-muted-foreground text-xs uppercase font-bold text-primary tracking-widest">{assignment?.subjectName}</p>
            </div>
          </div>
          <Button onClick={onSaveLocal} className="gap-2 bg-primary shadow-lg shadow-primary/20 h-11 px-8">
            <Save className="w-4 h-4" /> Simpan ke Buffer
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-20">
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-border/50 shadow-md">
              <CardHeader className="bg-muted/10 border-b">
                <CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4 text-primary" /> Informasi Utama</CardTitle>
                <CardDescription>Rangkuman materi dan detail waktu pertemuan.</CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                 <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                       <Label className="text-[10px] font-bold uppercase text-muted-foreground">Pertemuan Ke-</Label>
                       <Input type="number" value={newJournal.meetingNumber || 0} onChange={e => setNewJournal({...newJournal, meetingNumber: parseInt(e.target.value) || 0})} />
                    </div>
                    <div className="space-y-2">
                       <Label className="text-[10px] font-bold uppercase text-muted-foreground">Tanggal</Label>
                       <Input type="date" value={newJournal.date || ""} onChange={e => setNewJournal({...newJournal, date: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                       <Label className="text-[10px] font-bold uppercase text-muted-foreground">Jam Ke</Label>
                       <Input placeholder="1-2" value={newJournal.jamKe || ""} onChange={e => setNewJournal({...newJournal, jamKe: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                       <Label className="text-[10px] font-bold uppercase text-muted-foreground">Durasi (JP)</Label>
                       <Input type="number" value={newJournal.jp || 0} onChange={e => setNewJournal({...newJournal, jp: parseInt(e.target.value) || 0})} />
                    </div>
                 </div>
                 
                 <div className="space-y-2">
                    <Label className="text-[10px] font-bold uppercase text-primary">Materi Pembelajaran</Label>
                    <Textarea 
                      placeholder="Tuliskan pokok bahasan atau materi yang diajarkan..." 
                      value={newJournal.material || ""} 
                      onChange={e => setNewJournal({...newJournal, material: e.target.value})} 
                      className="min-h-[120px] bg-muted/5 focus:bg-background transition-all"
                    />
                 </div>
              </CardContent>
            </Card>

            <Card className="border-border/50 shadow-md">
              <CardHeader className="bg-muted/10 border-b flex flex-row items-center justify-between">
                <div>
                   <CardTitle className="text-base flex items-center gap-2"><Users className="w-4 h-4 text-accent" /> Kehadiran Siswa</CardTitle>
                   <CardDescription>Status kehadiran murid di kelas ini.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => {
                  const allH: any = {};
                  students.forEach(s => allH[s.id] = 'H');
                  setNewJournal({...newJournal, attendanceDetail: allH});
                }} className="h-8 text-[10px] font-bold border-accent/20 text-accent">SET SEMUA HADIR</Button>
              </CardHeader>
              <CardContent className="p-0">
                 <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-muted/20">
                        <TableRow>
                          <TableHead className="font-bold text-xs">Nama Siswa</TableHead>
                          <TableHead className="text-center w-48 font-bold text-xs uppercase tracking-tighter">Status (H/S/I/A)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {students.map(s => (
                          <TableRow key={s.id} className="h-14 hover:bg-muted/5 transition-colors">
                            <TableCell>
                               <div className="flex flex-col">
                                 <span className="text-sm font-bold">{s.fullName}</span>
                                 <span className="text-[9px] text-muted-foreground font-mono">{s.NISN}</span>
                               </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-center gap-1.5">
                                {['H', 'S', 'I', 'A'].map(v => (
                                  <button
                                    key={v}
                                    type="button"
                                    onClick={() => {
                                      const detail = { ...(newJournal.attendanceDetail || {}) };
                                      detail[s.id] = v as any;
                                      setNewJournal({...newJournal, attendanceDetail: detail});
                                    }}
                                    className={`w-9 h-9 rounded-lg text-[11px] font-bold transition-all border shadow-sm ${
                                      newJournal.attendanceDetail?.[s.id] === v 
                                        ? 'bg-primary text-white border-primary scale-110' 
                                        : 'bg-background hover:bg-muted text-muted-foreground border-border/50'
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
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
             <Card className="border-primary/20 bg-primary/5">
                <CardHeader className="pb-2">
                   <CardTitle className="text-sm font-bold flex items-center gap-2"><Target className="w-4 h-4" /> KKTp Pembelajaran</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-2">
                   <p className="text-[10px] text-muted-foreground italic leading-relaxed">
                     Catatan ini akan otomatis masuk ke draf nilai tugas harian jika Anda mengisi nilai pada kolom tugas.
                   </p>
                   <Separator className="opacity-30" />
                   <div className="space-y-2">
                     <Label className="text-[10px] font-bold uppercase">Catatan Guru (Opsional):</Label>
                     <Textarea value={newJournal.notes || ""} onChange={e => setNewJournal({...newJournal, notes: e.target.value})} placeholder="Catatan kelas, hambatan, dll..." className="text-xs h-32" />
                   </div>
                </CardContent>
             </Card>

             <div className="bg-amber-500/5 p-4 rounded-xl border border-amber-500/20 flex gap-4">
                <Info className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[10px] text-muted-foreground leading-relaxed italic">
                  Data yang diinput belum tersimpan di server pusat. Klik <strong>"Simpan ke Buffer"</strong> untuk mengamankan draf di browser Anda, lalu lakukan <strong>"Simpan Cloud"</strong> di halaman utama jurnal.
                </p>
             </div>
          </div>
        </div>
      </div>
    )
  }

  // --- VIEW: LIST JURNAL (DEFAULT) ---
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full border h-10 w-10"><ArrowLeft className="w-5 h-5" /></Button>
          <div>
            <h1 className="text-3xl font-headline font-bold">Jurnal: {assignment?.subjectName}</h1>
            <div className="flex items-center gap-2 mt-1">
               <Badge variant="outline" className="font-mono bg-muted/20">Kelas {assignment?.className}</Badge>
               {isDirty ? (
                 <Badge className="bg-amber-500/10 text-amber-500 animate-pulse gap-1 border-amber-500/20"><CloudOff className="w-3 h-3" /> Ada Draf Baru</Badge>
               ) : (
                 <Badge className="bg-green-500/10 text-green-500 border-green-500/20 gap-1"><CheckCircle2 className="w-3 h-3" /> Tersinkron</Badge>
               )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isDirty && (
            <Button onClick={handleSyncToCloud} disabled={isSyncing} className="bg-green-600 hover:bg-green-700 shadow-lg shadow-green-500/20 gap-2">
              {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
              Simpan Cloud
            </Button>
          )}
          <Button variant="outline" onClick={handleOpenScanner} className="gap-2 border-primary/30 text-primary hover:bg-primary/5">
            <ScanLine className="w-4 h-4" /> Absen QR
          </Button>
          <Button onClick={() => { setEditingJournalId(null); setNewJournal({...newJournal, attendanceDetail: {}}); setActiveView('form'); }} className="gap-2 shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4" /> Input Jurnal
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {journals.length === 0 ? (
          <div className="border-2 border-dashed border-border/50 py-32 rounded-2xl flex flex-col items-center justify-center text-muted-foreground bg-muted/5">
            <BookOpen className="w-16 h-16 opacity-10 mb-4" />
            <h3 className="font-bold text-lg">Belum Ada Jurnal</h3>
            <p className="text-sm max-w-xs text-center mt-2 opacity-60">Catat kegiatan mengajar dan absensi siswa untuk setiap pertemuan di sini.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {journals.map((j) => {
              const isTemp = j.id.startsWith('temp-')
              const attendCount = Object.values(j.attendanceDetail || {}).filter(v => v === 'H').length;
              return (
                <Card key={j.id} className={`border-border/50 overflow-hidden bg-card/40 backdrop-blur-sm group hover:border-primary/50 transition-all ${isTemp ? 'border-dashed border-2 border-amber-500/30 bg-amber-500/5' : ''}`}>
                  <CardHeader className="bg-muted/10 p-4 border-b">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center font-bold text-primary shadow-inner">{j.meetingNumber}</div>
                        <div>
                          <CardTitle className="text-sm font-bold flex items-center gap-2">Pertemuan {j.meetingNumber} {isTemp && <RefreshCw className="w-3 h-3 text-amber-500 animate-spin" />}</CardTitle>
                          <CardDescription className="text-[10px] uppercase font-bold tracking-widest">{new Date(j.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" onClick={() => { setEditingJournalId(j.id); setNewJournal(j); setActiveView('form'); }} className="h-8 w-8 hover:text-primary"><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteTrigger(j.id)} className="text-destructive h-8 w-8 hover:bg-destructive/10"><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    <div>
                      <Label className="text-[9px] uppercase font-bold text-muted-foreground tracking-widest">Materi Diajarkan:</Label>
                      <p className="mt-1 text-xs font-medium line-clamp-2 leading-relaxed h-8">{j.material || "-"}</p>
                    </div>
                    <div className="flex items-center justify-between bg-background/50 p-2.5 rounded-xl border border-border/50">
                       <div className="flex items-center gap-2">
                         <div className="p-1.5 bg-accent/10 rounded-lg"><Users className="w-3.5 h-3.5 text-accent" /></div>
                         <div className="flex flex-col">
                           <span className="text-xs font-bold">{attendCount} / {students.length}</span>
                           <span className="text-[8px] text-muted-foreground uppercase font-bold">Hadir</span>
                         </div>
                       </div>
                       <Badge variant="secondary" className="text-[10px] font-mono">{Math.round((attendCount/students.length)*100)}%</Badge>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <div className="bg-primary/5 p-4 rounded-2xl border border-primary/20 flex gap-4 mt-8 shadow-sm">
         <div className="p-3 bg-primary/10 rounded-xl shrink-0 h-fit"><Info className="w-5 h-5 text-primary" /></div>
         <div className="text-xs text-muted-foreground leading-relaxed">
           <p className="font-bold text-primary mb-1 uppercase tracking-widest text-[10px]">Pusat Kendali Jurnal Mengajar</p>
           Setiap data absensi yang diproses melalui **Absen QR** akan otomatis menghitung persentase kehadiran siswa.
         </div>
      </div>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-destructive" /> Hapus Jurnal?</AlertDialogTitle>
            <AlertDialogDescription>Data akan dihapus dari draf sementara. Pastikan untuk menekan **Simpan Cloud** setelah ini agar perubahan terhapus permanen dari server.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={executeDeleteLocal} className="bg-destructive text-destructive-foreground">Ya, Hapus Sekarang</AlertDialogAction></AlertDialogFooter>
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
