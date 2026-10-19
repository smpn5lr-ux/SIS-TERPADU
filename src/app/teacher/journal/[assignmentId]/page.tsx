
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
  ShieldAlert
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
  const [submitting, setSubmitting] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [editingJournalId, setEditingJournalId] = useState<string | null>(null)
  const [studentSearchTerm, setStudentSearchTerm] = useState('')
  
  const [journalToDeleteId, setJournalToDeleteId] = useState<string | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const scannerDivId = "qr-reader-journal"
  const hasAutoStarted = useRef(false)

  const activeSemester = parseInt(searchParams.get('semester') || "1")

  const settingsRef = useMemoFirebase(() => {
    if (!db || !user) return null
    return doc(db, 'settings', 'system')
  }, [db, user])
  
  const { data: config } = useDoc<any>(settingsRef)

  const assignmentRef = useMemoFirebase(() => {
    if (!db || !assignmentId || !user) return null
    return doc(db, 'teacherAssignments', assignmentId as string)
  }, [db, assignmentId, user])
  
  const { data: assignment, loading: loadingA } = useDoc<TeacherAssignment>(assignmentRef)

  const classRef = useMemoFirebase(() => {
    if (!db || !assignment || !user) return null
    return doc(db, 'classes', assignment.classId)
  }, [db, assignment, user])
  
  const { data: classroom } = useDoc<Classroom>(classRef)

  const studentsQuery = useMemoFirebase(() => {
    if (!db || !user) return null 
    return query(collection(db, 'applicants'), where('admissionStatus', '==', 'accepted'))
  }, [db, user])
  const { data: allAcceptedStudents } = useCollection<Applicant>(studentsQuery)

  const students = useMemo(() => {
    if (!allAcceptedStudents || !classroom?.students) return []
    return allAcceptedStudents
      .filter(s => classroom.students.includes(s.id) && !s.isDeleted)
      .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""))
  }, [allAcceptedStudents, classroom])

  const filteredStudentsForAttendance = useMemo(() => {
    return students.filter(s => 
      s.fullName.toLowerCase().includes(studentSearchTerm.toLowerCase()) || 
      (s.NISN || "").includes(studentSearchTerm)
    )
  }, [students, studentSearchTerm])

  const journalQuery = useMemoFirebase(() => {
    if (!db || !assignmentId || !user) return null
    return query(
      collection(db, 'journals'), 
      where('assignmentId', '==', assignmentId)
    )
  }, [db, assignmentId, user])
  
  const { data: rawJournals, loading: loadingJ } = useCollection<Journal>(journalQuery)

  const journals = useMemo(() => {
    if (!rawJournals) return []
    return rawJournals
      .filter(j => j.semester === activeSemester)
      .sort((a, b) => (a.meetingNumber || 0) - (b.meetingNumber || 0))
  }, [rawJournals, activeSemester])

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

  useEffect(() => {
    if (!editingJournalId && journals && journals.length > 0) {
      setNewJournal(prev => ({ ...prev, meetingNumber: journals.length + 1 }))
    }
    
    if (!editingJournalId && students.length > 0 && Object.keys(newJournal.attendanceDetail || {}).length === 0) {
      const initialAttendance: Record<string, any> = {}
      students.forEach(s => {
        initialAttendance[s.id] = 'H'
      })
      setNewJournal(prev => ({ ...prev, attendanceDetail: initialAttendance }))
    }
  }, [journals, students, editingJournalId, newJournal.attendanceDetail])

  useEffect(() => {
    if (searchParams.get('scan') === '1' && !loadingJ && journals && !hasAutoStarted.current) {
      hasAutoStarted.current = true;
      handleAddNew();
      setTimeout(() => {
        startScanner();
      }, 800);
    }
  }, [loadingJ, journals, searchParams]);

  const startScanner = async () => {
    setIsScannerOpen(true)
    setTimeout(() => {
      const html5QrCode = new Html5Qrcode(scannerDivId)
      scannerRef.current = html5QrCode
      
      const config = { fps: 10, qrbox: { width: 250, height: 250 } }
      
      html5QrCode.start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
          handleQrScanned(decodedText)
        },
        () => {} 
      ).catch(err => {
        toast({ variant: "destructive", title: "Kamera Tidak Diakses", description: "Pastikan izin kamera aktif." })
        setIsScannerOpen(false)
      })
    }, 300)
  }

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop()
        scannerRef.current = null
      } catch (e) {}
    }
    setIsScannerOpen(false)
  }

  const handleQrScanned = (studentId: string) => {
    const student = students.find(s => s.id === studentId)
    if (student) {
      handleAttendanceChange(studentId, 'H')
      toast({ 
        title: "Scan Berhasil", 
        description: `Absensi ${student.fullName} tercatat HADIR (H).`,
        className: "bg-green-600 text-white"
      })
      if (window.navigator.vibrate) window.navigator.vibrate(100)
    } else {
      toast({ variant: "destructive", title: "QR Tidak Dikenal", description: "Siswa tidak terdaftar di kelas ini." })
    }
  }

  const handleAttendanceChange = (studentId: string, status: 'H' | 'S' | 'I' | 'A') => {
    setNewJournal(prev => {
      const updatedDetail = { ...prev.attendanceDetail, [studentId]: status }
      const alfas = Object.entries(updatedDetail)
        .filter(([_, val]) => val === 'A')
        .map(([id, _]) => id)
      
      return { 
        ...prev, 
        attendanceDetail: updatedDetail,
        absentStudents: alfas
      }
    })
  }

  const handleScoreChange = (studentId: string, score: string) => {
    const val = parseInt(score) || 0
    setNewJournal(prev => ({
      ...prev,
      taskScores: { ...prev.taskScores, [studentId]: val }
    }))
  }

  const handleRefreshSession = async () => {
    setIsRefreshing(true)
    try {
      if (auth.currentUser) {
        await auth.currentUser.getIdToken(true)
        toast({ title: "Sesi Disegarkan" })
        window.location.reload()
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Gagal" })
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleEditJournal = (journal: Journal) => {
    setEditingJournalId(journal.id)
    setNewJournal({
      ...journal,
      taskScores: journal.taskScores || {},
      attendanceDetail: journal.attendanceDetail || {}
    })
    setIsAddOpen(true)
  }

  const handleAddNew = () => {
    setEditingJournalId(null)
    setNewJournal({
      meetingNumber: journals.length + 1,
      date: new Date().toISOString().split('T')[0],
      jamKe: "1-2",
      jp: 2,
      learningGoal: "",
      material: "",
      kktpAchievement: "",
      attendanceDetail: students.reduce((acc, s) => ({ ...acc, [s.id]: 'H' }), {}),
      absentStudents: [],
      hasTask: false,
      taskType: 'task1',
      taskScores: {},
      notes: ""
    })
    setIsAddOpen(true)
  }

  const saveJournal = async () => {
    if (!db || !assignmentId || !user) return
    setSubmitting(true)
    
    try {
      const journalData: any = {
        ...newJournal,
        assignmentId,
        semester: activeSemester,
        updatedAt: new Date().toISOString()
      }
      
      if (!editingJournalId) {
        journalData.createdAt = new Date().toISOString()
      }
      
      const batch = writeBatch(db)
      const journalRef = editingJournalId ? doc(db, 'journals', editingJournalId) : doc(collection(db, 'journals'))
      
      batch.set(journalRef, journalData, { merge: true })
      
      if (newJournal.hasTask && newJournal.taskType && newJournal.taskScores) {
        Object.entries(newJournal.taskScores).forEach(([sId, score]) => {
          const assessmentId = `${assignmentId}_${sId}_sem${activeSemester}`
          const aRef = doc(db, 'assessments', assessmentId)
          batch.set(aRef, {
            studentId: sId,
            assignmentId,
            semester: activeSemester,
            [newJournal.taskType!]: score,
            updatedAt: new Date().toISOString()
          }, { merge: true })
        })
      }
      
      const currentJournal = { ...journalData, id: journalRef.id }
      const otherJournals = journals.filter(j => j.id !== editingJournalId)
      const allJournalsForCalc = [...otherJournals, currentJournal]
      const totalMeetings = allJournalsForCalc.length
      
      students.forEach(s => {
        const absences = allJournalsForCalc.filter(j => j.absentStudents?.includes(s.id)).length
        const attendancePercent = Math.round(((totalMeetings - absences) / totalMeetings) * 100)
        
        const assessmentId = `${assignmentId}_${s.id}_sem${activeSemester}`
        const aRef = doc(db, 'assessments', assessmentId)
        batch.set(aRef, {
          studentId: s.id,
          assignmentId,
          semester: activeSemester,
          attendance: attendancePercent,
          updatedAt: new Date().toISOString()
        }, { merge: true })
      })

      await batch.commit()
      toast({ title: "Berhasil", description: editingJournalId ? "Jurnal telah diperbarui." : "Jurnal telah disimpan." })
      setIsAddOpen(false)
      setEditingJournalId(null)
    } catch (e) {
      toast({ variant: "destructive", title: "Gagal menyimpan" })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDownloadPDF = async () => {
    if (!assignment || !journals.length) return
    setIsExporting(true)
    try {
      const { default: jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')
      const doc = new jsPDF('l', 'mm', 'a4')
      
      const dinasName = config?.dinasName || "DINAS PENDIDIKAN"
      const schoolName = config?.schoolName || "SIS TERPADU"
      const brandBlue = [67, 97, 238] as [number, number, number]
      
      doc.setFontSize(12).setFont("helvetica", "bold").setTextColor(brandBlue[0], brandBlue[1], brandBlue[2])
      doc.text(dinasName.toUpperCase(), 148.5, 15, { align: "center" })
      doc.text(schoolName.toUpperCase(), 148.5, 22, { align: "center" })
      doc.setDrawColor(brandBlue[0], brandBlue[1], brandBlue[2]).setLineWidth(0.5).line(14, 26, 283, 26)

      doc.setFontSize(14).setTextColor(0).text(`JURNAL MENGAJAR GURU - SEMESTER ${activeSemester}`, 14, 35)
      doc.setFontSize(10).setTextColor(100)
      doc.text(`Mata Pelajaran: ${assignment.subjectName} | Kelas: ${assignment.className}`, 14, 42)
      doc.text(`Guru Pengajar: ${user?.displayName || '-'}`, 14, 48)
      
      const tableData = journals.map((j) => {
        const absents = Object.entries(j.attendanceDetail || {})
          .filter(([_, status]) => status !== 'H')
          .map(([id, status]) => {
            const name = students.find(s => s.id === id)?.fullName || id
            return `${name} (${status})`
          }).join("\n")

        const sCount = Object.values(j.attendanceDetail || {}).filter(v => v === 'S').length
        const iCount = Object.values(j.attendanceDetail || {}).filter(v => v === 'I').length
        const aCount = Object.values(j.attendanceDetail || {}).filter(v => v === 'A').length

        const dateObj = new Date(j.date)
        const hari = dateObj.toLocaleDateString('id-ID', { weekday: 'long' })
        const tgl = dateObj.toLocaleDateString('id-ID')

        return [
          `${hari}, ${tgl}`,
          j.jamKe || '-',
          j.jp || '-',
          j.meetingNumber,
          j.learningGoal || '-',
          j.material || '-',
          j.kktpAchievement || '-',
          absents || 'Hadir Semua',
          sCount, iCount, aCount,
          j.notes || '-'
        ]
      })

      autoTable(doc, {
        head: [
          [
            { content: 'Hari/Tanggal', rowSpan: 2, halign: 'center', valign: 'middle' },
            { content: 'Jam Ke', rowSpan: 2, halign: 'center', valign: 'middle' },
            { content: 'JP', rowSpan: 2, halign: 'center', valign: 'middle' },
            { content: 'Pertemuan Ke', rowSpan: 2, halign: 'center', valign: 'middle' },
            { content: 'Tujuan Pembelajaran', rowSpan: 2, halign: 'center', valign: 'middle' },
            { content: 'Materi Pembelajaran', rowSpan: 2, halign: 'center', valign: 'middle' },
            { content: 'Pencapaian KKTP', rowSpan: 2, halign: 'center', valign: 'middle' },
            { content: 'Absensi', colSpan: 4, halign: 'center' },
            { content: 'Keterangan', rowSpan: 2, halign: 'center', valign: 'middle' }
          ],
          [
            { content: 'Nama', halign: 'center' },
            { content: 'S', halign: 'center' },
            { content: 'I', halign: 'center' },
            { content: 'A', halign: 'center' }
          ]
        ],
        body: tableData,
        startY: 55,
        theme: 'grid',
        headStyles: { fillColor: brandBlue, textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
        styles: { fontSize: 7, cellPadding: 2, valign: 'middle' },
        columnStyles: { 
          0: { cellWidth: 25 }, 
          1: { cellWidth: 12, halign: 'center' },
          2: { cellWidth: 8, halign: 'center' }, 
          3: { cellWidth: 15, halign: 'center' },
          4: { cellWidth: 35 },
          5: { cellWidth: 35 },
          6: { cellWidth: 30 },
          7: { cellWidth: 40 }, 
          8: { cellWidth: 7, halign: 'center' },  
          9: { cellWidth: 7, halign: 'center' },  
          10: { cellWidth: 7, halign: 'center' }, 
          11: { cellWidth: 'auto' }
        }
      })

      doc.save(`Jurnal_${assignment.subjectName}_Kelas_${assignment.className}_Sem${activeSemester}.pdf`)
      toast({ title: "Unduhan Berhasil" })
    } catch (e) {
      toast({ variant: "destructive", title: "Gagal ekspor PDF" })
    } finally {
      setIsExporting(false)
    }
  }

  const handleDeleteTrigger = (id: string) => {
    setJournalToDeleteId(id)
    setIsDeleteDialogOpen(true)
  }

  const executeDeleteJournal = async () => {
    if (!db || !journalToDeleteId) return
    try {
      await deleteDoc(doc(db, 'journals', journalToDeleteId))
      toast({ title: "Jurnal Dihapus" })
      setIsDeleteDialogOpen(false)
      setJournalToDeleteId(null)
    } catch (e) {
      toast({ variant: "destructive", title: "Gagal menghapus" })
    }
  }

  if (userLoading || loadingA) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <Loader2 className="animate-spin text-primary w-8 h-8" />
      <p className="text-sm text-muted-foreground animate-pulse">Menghubungkan ke sistem...</p>
    </div>
  )

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full border"><ArrowLeft className="w-4 h-4" /></Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">Jurnal: {assignment?.subjectName}</h1>
              <Badge variant="outline">Sem {activeSemester}</Badge>
            </div>
            <p className="text-muted-foreground text-sm font-bold text-primary">Kelas {assignment?.className}</p>
          </div>
        </div>
        <div className="flex gap-2">
           <Button variant="outline" onClick={handleDownloadPDF} disabled={isExporting} className="gap-2 text-xs h-9 border-primary/30">
              {isExporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
              Cetak Jurnal
           </Button>
           <Button variant="outline" onClick={handleRefreshSession} className="gap-2 text-xs h-9">
              <RefreshCw className="w-3 h-3" /> Sesi
           </Button>
           <Button onClick={handleAddNew} className="gap-2 shadow-lg shadow-primary/20 h-9">
             <Plus className="w-4 h-4" /> Tambah Jurnal
           </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {loadingJ && !journals.length ? (
          <div className="text-center py-12"><Loader2 className="animate-spin mx-auto text-primary" /></div>
        ) : journals.length === 0 ? (
          <Card className="border-dashed border-2 py-20 flex flex-col items-center justify-center text-muted-foreground">
            <BookOpen className="w-12 h-12 opacity-20 mb-4" />
            <p>Belum ada catatan jurnal untuk semester ini.</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {journals.map((j) => (
              <Card key={j.id} className="border-border/50 overflow-hidden bg-card/30">
                <CardHeader className="bg-muted/10 p-4 border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center font-bold text-primary">
                        {j.meetingNumber}
                      </div>
                      <div>
                        <CardTitle className="text-base font-bold">Pertemuan Ke-{j.meetingNumber}</CardTitle>
                        <CardDescription className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {new Date(j.date).toLocaleDateString('id-ID', { dateStyle: 'full' })} 
                          <span className="mx-2">•</span>
                          <Clock className="w-3 h-3" /> Jam: {j.jamKe} ({j.jp} JP)
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleEditJournal(j)} className="h-8 w-8 hover:text-primary">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteTrigger(j.id)} className="text-destructive h-8 w-8">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <Label className="text-[10px] font-bold uppercase text-primary">Tujuan Pembelajaran:</Label>
                        <p className="text-sm mt-1">{j.learningGoal || "-"}</p>
                      </div>
                      <div>
                        <Label className="text-[10px] font-bold uppercase text-primary">Materi:</Label>
                        <p className="text-sm mt-1">{j.material || "-"}</p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <Label className="text-[10px] font-bold uppercase text-accent">Pencapaian KKTP:</Label>
                        <p className="text-sm mt-1">{j.kktpAchievement || "-"}</p>
                      </div>
                      <div>
                        <Label className="text-[10px] font-bold uppercase text-muted-foreground">Keterangan:</Label>
                        <p className="text-sm mt-1">{j.notes || "-"}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 pt-4 border-t border-border/20">
                    <div className="text-[10px] font-bold uppercase text-muted-foreground w-full mb-1">Absensi:</div>
                    {Object.entries(j.attendanceDetail || {}).filter(([_, v]) => v !== 'H').length === 0 ? (
                      <Badge variant="outline" className="text-green-500 bg-green-500/5">Hadir Semua</Badge>
                    ) : (
                      Object.entries(j.attendanceDetail || {}).filter(([_, v]) => v !== 'H').map(([id, status]) => {
                        const s = students.find(st => st.id === id)
                        return (
                          <Badge key={id} variant="secondary" className="gap-1.5 px-2">
                            {s?.fullName} 
                            <span className={`font-bold ${status === 'A' ? 'text-destructive' : 'text-amber-500'}`}>{status}</span>
                          </Badge>
                        )
                      })
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={isAddOpen} onOpenChange={(val) => { setIsAddOpen(val); if(!val) { setEditingJournalId(null); setStudentSearchTerm(''); stopScanner(); } }}>
        <DialogContent className="sm:max-w-[850px] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingJournalId ? 'Edit Jurnal & Absensi' : 'Input Jurnal & Absensi Lengkap'}</DialogTitle></DialogHeader>
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2"><Label>Pertemuan Ke-</Label><Input type="number" value={newJournal.meetingNumber || 0} onChange={e => setNewJournal({...newJournal, meetingNumber: parseInt(e.target.value) || 0})} /></div>
              <div className="space-y-2"><Label>Tanggal</Label><Input type="date" value={newJournal.date || ""} onChange={e => setNewJournal({...newJournal, date: e.target.value})} /></div>
              <div className="space-y-2"><Label>Jam Ke</Label><Input placeholder="1-2" value={newJournal.jamKe || ""} onChange={e => setNewJournal({...newJournal, jamKe: e.target.value})} /></div>
              <div className="space-y-2"><Label>JP</Label><Input type="number" value={newJournal.jp || 0} onChange={e => setNewJournal({...newJournal, jp: parseInt(e.target.value) || 0})} /></div>
            </div>
            
            <div className="space-y-4">
               <div className="space-y-2"><Label>Tujuan Pembelajaran</Label><Textarea placeholder="Tujuan hari ini..." value={newJournal.learningGoal || ""} onChange={e => setNewJournal({...newJournal, learningGoal: e.target.value})} /></div>
               <div className="space-y-2"><Label>Materi Pembelajaran</Label><Textarea placeholder="Bahasan materi..." value={newJournal.material || ""} onChange={e => setNewJournal({...newJournal, material: e.target.value})} /></div>
               <div className="space-y-2"><Label>Pencapaian KKTP</Label><Input placeholder="Contoh: 80% siswa tuntas" value={newJournal.kktpAchievement || ""} onChange={e => setNewJournal({...newJournal, kktpAchievement: e.target.value})} /></div>
            </div>

            <div className="space-y-4 pt-4 border-t">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-2">
                <div className="flex items-center gap-3">
                  <Label className="font-bold text-lg">Kehadiran & Tugas</Label>
                  <Button 
                    onClick={isScannerOpen ? stopScanner : startScanner}
                    variant={isScannerOpen ? "destructive" : "default"}
                    size="sm"
                    className="gap-2 animate-pulse shadow-md"
                  >
                    {isScannerOpen ? <X className="w-4 h-4" /> : <ScanLine className="w-4 h-4" />}
                    {isScannerOpen ? "Matikan Scanner" : "Absen QR Mandiri"}
                  </Button>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input 
                    placeholder="Cari nama siswa..." 
                    value={studentSearchTerm}
                    onChange={(e) => setStudentSearchTerm(e.target.value)}
                    className="h-8 pl-8 text-xs bg-muted/20"
                  />
                </div>
              </div>

              {isScannerOpen && (
                <div className="bg-black/90 p-4 rounded-xl border border-primary/50 relative overflow-hidden">
                  <div className="absolute top-2 left-2 z-10 flex items-center gap-2 bg-primary/20 backdrop-blur px-2 py-1 rounded border border-primary/30">
                    <Camera className="w-3 h-3 text-primary animate-pulse" />
                    <span className="text-[10px] text-primary font-bold">SCANNER AKTIF</span>
                  </div>
                  <div id={scannerDivId} className="w-full max-w-[400px] mx-auto overflow-hidden rounded-lg"></div>
                  <p className="text-center text-[10px] text-muted-foreground mt-4 italic">Siswa: Tunjukkan QR Code kartu absensi Anda ke kamera.</p>
                </div>
              )}

              <div className="border rounded-lg overflow-hidden bg-card">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>Nama Siswa</TableHead>
                      <TableHead className="w-[180px] text-center">Status Absensi</TableHead>
                      {newJournal.hasTask && <TableHead className="w-24 text-center">Nilai Tugas</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStudentsForAttendance.map(s => (
                      <TableRow key={s.id} className={newJournal.attendanceDetail?.[s.id] === 'H' ? 'bg-green-500/5' : ''}>
                        <TableCell className="text-sm font-medium">
                          <div className="flex items-center gap-2">
                            {newJournal.attendanceDetail?.[s.id] === 'H' && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                            <span>{s.fullName}</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono pl-5">{s.NISN}</div>
                        </TableCell>
                        <TableCell>
                          <RadioGroup 
                            defaultValue="H" 
                            value={newJournal.attendanceDetail?.[s.id] || "H"} 
                            onValueChange={(val: any) => handleAttendanceChange(s.id, val)}
                            className="flex justify-between"
                          >
                            <div className="flex flex-col items-center gap-1">
                              <RadioGroupItem value="H" id={`h-${s.id}`} className="text-green-500" />
                              <Label htmlFor={`h-${s.id}`} className="text-[10px]">H</Label>
                            </div>
                            <div className="flex flex-col items-center gap-1">
                              <RadioGroupItem value="S" id={`s-${s.id}`} className="text-amber-500" />
                              <Label htmlFor={`s-${s.id}`} className="text-[10px]">S</Label>
                            </div>
                            <div className="flex flex-col items-center gap-1">
                              <RadioGroupItem value="I" id={`i-${s.id}`} className="text-blue-500" />
                              <Label htmlFor={`i-${s.id}`} className="text-[10px]">I</Label>
                            </div>
                            <div className="flex flex-col items-center gap-1">
                              <RadioGroupItem value="A" id={`a-${s.id}`} className="text-destructive" />
                              <Label htmlFor={`a-${s.id}`} className="text-[10px]">A</Label>
                            </div>
                          </RadioGroup>
                        </TableCell>
                        {newJournal.hasTask && (
                          <TableCell>
                            <Input 
                              type="number" 
                              className="h-8 text-center" 
                              placeholder="0" 
                              disabled={newJournal.attendanceDetail?.[s.id] !== 'H'} 
                              value={newJournal.taskScores?.[s.id] || ""} 
                              onChange={e => handleScoreChange(s.id, e.target.value)} 
                            />
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t">
               <div className="flex items-center gap-2 mb-4">
                  <Switch checked={newJournal.hasTask} onCheckedChange={v => setNewJournal({...newJournal, hasTask: v})} />
                  <Label>Input Nilai Tugas pada Pertemuan Ini?</Label>
               </div>
               {newJournal.hasTask && (
                  <div className="grid grid-cols-1 gap-4 bg-muted/20 p-4 rounded-xl border border-border/50">
                    <Label className="text-xs uppercase font-bold text-muted-foreground">Pilih Slot Nilai Tugas:</Label>
                    <Select value={newJournal.taskType || "task1"} onValueChange={v => setNewJournal({...newJournal, taskType: v as any})}>
                      <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="task1">Tugas 1</SelectItem>
                        <SelectItem value="task2">Tugas 2</SelectItem>
                        <SelectItem value="task3">Tugas 3</SelectItem>
                        <SelectItem value="groupTask">Ulangan</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
               )}
               <div className="space-y-2"><Label>Keterangan Tambahan (Opsional)</Label><Textarea placeholder="Catatan kelas..." value={newJournal.notes || ""} onChange={e => setNewJournal({...newJournal, notes: e.target.value})} /></div>
            </div>
          </div>
          <DialogFooter><Button onClick={saveJournal} disabled={submitting} className="w-full md:w-auto">{submitting ? 'Menyimpan...' : (editingJournalId ? 'Perbarui Jurnal' : 'Simpan Jurnal & Absensi')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-destructive" /> Hapus Jurnal?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus catatan jurnal pertemuan ini? Data absensi dan tugas yang terhubung dengan pertemuan ini juga akan terpengaruh. Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={executeDeleteJournal} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Ya, Hapus Permanen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default function TeachingJournalPage() {
  return (
    <Suspense fallback={<div className="flex flex-col items-center justify-center py-24 gap-4"><Loader2 className="animate-spin text-primary w-8 h-8" /><p className="text-sm text-muted-foreground animate-pulse">Menghubungkan ke sistem...</p></div>}>
      <TeachingJournalPageContent />
    </Suspense>
  )
}
