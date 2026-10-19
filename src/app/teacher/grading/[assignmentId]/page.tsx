
"use client"

import React, { useState, useMemo, useEffect, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { 
  ArrowLeft, 
  Save, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Users,
  Info,
  Search,
  Calendar,
  BookOpen,
  Download,
  Settings2,
  Check,
  AlertTriangle
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { useUser, useFirestore, useMemoFirebase, useCollection, useDoc } from "@/firebase"
import { collection, query, where, doc, writeBatch, setDoc } from "firebase/firestore"
import { TeacherAssignment, Applicant, Classroom, Assessment, GradingConfig } from "@/lib/types"
import { useToast } from '@/hooks/use-toast'
import Link from 'next/link'
import { ScrollArea } from '@/components/ui/scroll-area'

const GRADE_FIELDS = [
  { id: 'attendance', label: 'Absensi' },
  { id: 'task1', label: 'Tugas 1' },
  { id: 'task2', label: 'Tugas 2' },
  { id: 'task3', label: 'Tugas 3' },
  { id: 'task4', label: 'Tugas 4' },
  { id: 'task5', label: 'Tugas 5' },
  { id: 'quiz1', label: 'Ulangan 1' },
  { id: 'quiz2', label: 'Ulangan 2' },
  { id: 'quiz3', label: 'Ulangan 3' },
  { id: 'groupTask', label: 'Tugas Kelompok' },
  { id: 'midExam', label: 'UTS' },
  { id: 'finalExam', label: 'UAS' },
]

function GradingPageContent() {
  const { assignmentId } = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const db = useFirestore()
  const { user, loading: userLoading } = useUser()
  const { toast } = useToast()
  
  const [isSaving, setIsSaving] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  
  const settingsRef = useMemoFirebase(() => {
    if (!db || userLoading || !user) return null
    return doc(db, 'settings', 'system')
  }, [db, user, userLoading])
  const { data: config } = useDoc<any>(settingsRef)

  const activeSemester = parseInt(searchParams.get('semester') || config?.activeSemester?.toString() || "1")

  const assignmentRef = useMemoFirebase(() => {
    if (!db || !assignmentId || userLoading || !user) return null
    return doc(db, 'teacherAssignments', assignmentId as string)
  }, [db, assignmentId, user, userLoading])
  const { data: assignment, loading: loadingA } = useDoc<TeacherAssignment>(assignmentRef)

  const classRef = useMemoFirebase(() => {
    if (!db || !assignment || userLoading || !user) return null
    return doc(db, 'classes', assignment.classId)
  }, [db, assignment, user, userLoading])
  const { data: classroom, loading: loadingC } = useDoc<Classroom>(classRef)

  const gradingConfigRef = useMemoFirebase(() => {
    if (!db || !assignmentId) return null
    return doc(db, 'gradingConfigs', `${assignmentId}_sem${activeSemester}`)
  }, [db, assignmentId, activeSemester])
  const { data: serverGradingConfig } = useDoc<GradingConfig>(gradingConfigRef)

  const [localConfig, setLocalConfig] = useState<GradingConfig>({
    assignmentId: assignmentId as string,
    semester: activeSemester,
    weights: {
      attendance: 10, task1: 10, task2: 10, task3: 10, midExam: 30, finalExam: 30
    },
    visibility: {
      attendance: true, task1: true, task2: true, task3: true, midExam: true, finalExam: true
    }
  })

  useEffect(() => {
    if (serverGradingConfig) {
      setLocalConfig(serverGradingConfig)
    }
  }, [serverGradingConfig])

  const studentsQuery = useMemoFirebase(() => {
    if (!db || userLoading || !user) return null 
    return query(collection(db, 'applicants'), where('admissionStatus', '==', 'accepted'))
  }, [db, user, userLoading])
  const { data: allAcceptedStudents, loading: loadingS } = useCollection<Applicant>(studentsQuery)

  const students = useMemo(() => {
    if (!allAcceptedStudents || !classroom?.students) return []
    return allAcceptedStudents
      .filter(s => classroom.students.includes(s.id) && !s.isDeleted)
      .filter(s => s.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || (s.NISN || "").includes(searchTerm))
      .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""))
  }, [allAcceptedStudents, classroom, searchTerm])

  const assessmentsQuery = useMemoFirebase(() => {
    if (!db || userLoading || !user || !assignmentId) return null
    return query(
      collection(db, 'assessments'), 
      where('assignmentId', '==', assignmentId)
    )
  }, [db, user, userLoading, assignmentId])
  const { data: rawAssessments } = useCollection<Assessment>(assessmentsQuery)

  const [grades, setGrades] = useState<Record<string, Partial<Assessment>>>({})

  useEffect(() => {
    if (rawAssessments) {
      const gMap: Record<string, Partial<Assessment>> = {}
      rawAssessments.filter(a => a.semester === activeSemester).forEach(a => {
        gMap[a.studentId] = a
      })
      setGrades(gMap)
    }
  }, [rawAssessments, activeSemester])

  const calculateFinalScore = (sGrade: Partial<Assessment>) => {
    let totalScore = 0;
    GRADE_FIELDS.forEach(field => {
      if (localConfig.visibility[field.id]) {
        const score = (sGrade as any)[field.id] || 0;
        const weight = localConfig.weights[field.id] || 0;
        totalScore += (score * weight) / 100;
      }
    });
    return Math.round(totalScore);
  }

  const handleGradeChange = (studentId: string, field: keyof Assessment, value: string) => {
    const numValue = Math.min(100, Math.max(0, parseInt(value) || 0))
    setGrades(prev => {
      const current = prev[studentId] || { studentId, assignmentId: assignmentId as string, semester: activeSemester }
      const updated = { ...current, [field]: numValue }
      updated.finalScore = calculateFinalScore(updated)
      return { ...prev, [studentId]: updated }
    })
  }

  const saveAllGrades = async () => {
    if (!db || !activeSemester || !user) return
    setIsSaving(true)
    const batch = writeBatch(db)
    
    try {
      // Simpan Konfigurasi Grading
      if (gradingConfigRef) {
        batch.set(gradingConfigRef, localConfig, { merge: true })
      }

      // Simpan Nilai Murid
      Object.entries(grades).forEach(([studentId, data]) => {
        const docId = `${assignmentId}_${studentId}_sem${activeSemester}`
        const ref = doc(db, 'assessments', docId)
        batch.set(ref, {
          ...data,
          studentId,
          assignmentId,
          semester: activeSemester,
          finalScore: calculateFinalScore(data),
          updatedAt: new Date().toISOString()
        }, { merge: true })
      })
      
      await batch.commit()
      toast({ title: "Buku Nilai & Konfigurasi Disimpan" })
    } catch (e) {
      toast({ variant: "destructive", title: "Gagal menyimpan" })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDownloadPDF = async () => {
    if (!assignment || !students.length) return
    setIsExporting(true)
    try {
      const { default: jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')
      const doc = new jsPDF('landscape')
      
      const dinasName = config?.dinasName || "DINAS PENDIDIKAN"
      const schoolName = config?.schoolName || "SIS TERPADU"
      
      doc.setFontSize(12).setFont("helvetica", "bold").setTextColor(67, 97, 238)
      doc.text(dinasName.toUpperCase(), 148, 15, { align: "center" })
      doc.text(schoolName.toUpperCase(), 148, 22, { align: "center" })
      doc.setDrawColor(67, 97, 238).setLineWidth(0.5).line(14, 26, 283, 26)

      doc.setFontSize(14).setTextColor(0).text(`LAPORAN NILAI SISWA - SEMESTER ${activeSemester}`, 14, 38)
      doc.setFontSize(10).setTextColor(100)
      doc.text(`Mata Pelajaran: ${assignment.subjectName}`, 14, 45)
      doc.text(`Kelas: ${assignment.className} | Guru: ${user?.displayName || '-'}`, 14, 51)
      
      const visibleFields = GRADE_FIELDS.filter(f => localConfig.visibility[f.id])
      const head = [['No', 'Nama Murid', 'NISN', ...visibleFields.map(f => f.label), 'Total']]
      
      const body = students.map((s, idx) => {
        const g = grades[s.id] || {}
        const row = [idx + 1, s.fullName, s.NISN]
        visibleFields.forEach(f => row.push((g as any)[f.id] || 0))
        row.push(calculateFinalScore(g))
        return row
      })

      autoTable(doc, {
        head: head,
        body: body,
        startY: 58,
        theme: 'striped',
        headStyles: { fillColor: [67, 97, 238], textColor: [255, 255, 255] },
        styles: { fontSize: 8, cellPadding: 2 }
      })

      doc.save(`Nilai_${assignment.subjectName}_Kelas_${assignment.className}_Smt${activeSemester}.pdf`)
      toast({ title: "Berhasil Mengunduh", description: "Buku nilai telah disimpan sebagai PDF." })
    } catch (e) {
      toast({ variant: "destructive", title: "Gagal ekspor PDF" })
    } finally {
      setIsExporting(false)
    }
  }

  const totalWeight = Object.entries(localConfig.weights)
    .filter(([id]) => localConfig.visibility[id])
    .reduce((sum, [_, w]) => sum + w, 0)

  if (userLoading || loadingA || loadingC || loadingS) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <Loader2 className="animate-spin text-primary w-8 h-8" />
      <p className="text-sm text-muted-foreground animate-pulse">Memuat buku nilai...</p>
    </div>
  )

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full border"><ArrowLeft className="w-4 h-4" /></Button>
          <div>
            <div className="flex items-center gap-2">
               <h1 className="text-2xl font-bold">{assignment?.subjectName}</h1>
               <Badge variant="secondary">SEMESTER {activeSemester}</Badge>
            </div>
            <p className="text-muted-foreground text-sm font-bold text-primary">Kelas {assignment?.className}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Cari murid..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-48 bg-muted/20"
            />
          </div>
          <Button variant="outline" onClick={() => setIsConfigOpen(true)} className="gap-2 border-primary/30 text-primary">
            <Settings2 className="w-4 h-4" /> Pengaturan Kolom & Bobot
          </Button>
          <Button variant="outline" onClick={handleDownloadPDF} disabled={isExporting} className="gap-2 border-primary/30">
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Cetak PDF
          </Button>
          <Button onClick={saveAllGrades} disabled={isSaving} className="gap-2 shadow-lg shadow-primary/20">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Simpan Nilai
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <Card className="border-border/50 shadow-md overflow-x-auto bg-card/30">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="min-w-[180px] font-bold text-foreground">Murid</TableHead>
                  {GRADE_FIELDS.map(f => localConfig.visibility[f.id] && (
                    <TableHead key={f.id} className="w-16 text-center text-[10px] uppercase font-bold text-primary">{f.label}</TableHead>
                  ))}
                  <TableHead className="w-24 text-center font-bold text-primary">TOTAL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((s) => {
                  const sGrade = grades[s.id] || {}
                  const finalScore = calculateFinalScore(sGrade)
                  const isBelowKKM = finalScore < 75 && finalScore > 0
                  
                  return (
                    <TableRow key={s.id} className="hover:bg-muted/30">
                      <TableCell>
                        <div className="font-medium text-xs truncate max-w-[150px]">{s.fullName}</div>
                        <div className="text-[9px] text-muted-foreground font-mono">{s.NISN}</div>
                      </TableCell>
                      {GRADE_FIELDS.map(f => localConfig.visibility[f.id] && (
                        <TableCell key={f.id}>
                          <Input 
                            type="number" 
                            value={(sGrade as any)[f.id] || ""} 
                            onChange={e => handleGradeChange(s.id, f.id as any, e.target.value)} 
                            className="h-8 text-center text-[10px] bg-background" 
                          />
                        </TableCell>
                      ))}
                      <TableCell className="text-center">
                        <Badge 
                          variant={!isBelowKKM ? 'default' : 'destructive'} 
                          className={`w-14 justify-center py-1 text-xs font-bold ${!isBelowKKM && finalScore > 0 ? 'bg-green-500' : ''}`}
                        >
                          {finalScore}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Info className="w-4 h-4" /> Bobot Aktif
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-[10px] leading-relaxed">
              {GRADE_FIELDS.map(f => localConfig.visibility[f.id] && (
                <div key={f.id} className="flex justify-between">
                  <span>{f.label}</span>
                  <span className="font-bold">{localConfig.weights[f.id]}%</span>
                </div>
              ))}
              <Separator className="my-2" />
              <div className="flex justify-between font-bold text-primary">
                <span>Total Bobot</span>
                <span>{totalWeight}%</span>
              </div>
              {totalWeight !== 100 && (
                <p className="text-destructive font-bold flex items-center gap-1 mt-2">
                  <AlertTriangle className="w-3 h-3" /> Bobot harus 100%
                </p>
              )}
            </CardContent>
          </Card>
          
          <Card className="border-border/50 bg-card/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Users className="w-4 h-4 text-accent" /> Statistik Kelas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Tuntas (75+)</span>
                <span className="font-bold text-green-500">{students.filter(s => calculateFinalScore(grades[s.id] || {}) >= 75).length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="w-4 h-4" /> <span>Remedial (&lt;75)</span>
                </div>
                <span className="font-bold">{students.filter(s => {
                  const sc = calculateFinalScore(grades[s.id] || {});
                  return sc < 75 && sc > 0;
                }).length}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* DIALOG CONFIGURATION */}
      <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle className="flex items-center gap-2"><Settings2 className="w-5 h-5 text-primary" /> Konfigurasi Buku Nilai</DialogTitle>
            <DialogDescription>Aktifkan kolom penilaian dan tentukan bobot persentasenya.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 px-6">
            <div className="space-y-4 py-4">
              <div className={`p-4 rounded-xl border flex items-center justify-between transition-all ${totalWeight === 100 ? 'bg-green-500/10 border-green-500/20' : 'bg-amber-500/10 border-amber-500/20'}`}>
                <div>
                  <h4 className="text-sm font-bold">Total Bobot Penilaian</h4>
                  <p className="text-xs text-muted-foreground">Pastikan seluruh persentase berjumlah 100%.</p>
                </div>
                <div className={`text-2xl font-black ${totalWeight === 100 ? 'text-green-500' : 'text-amber-500'}`}>
                  {totalWeight}%
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {GRADE_FIELDS.map((f) => (
                  <div key={f.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/20 group hover:bg-muted/30 transition-all">
                    <div className="flex items-center gap-3">
                      <Checkbox 
                        id={`check-${f.id}`}
                        checked={localConfig.visibility[f.id]}
                        onCheckedChange={(checked) => {
                          setLocalConfig(prev => ({
                            ...prev,
                            visibility: { ...prev.visibility, [f.id]: !!checked },
                            weights: { ...prev.weights, [f.id]: checked ? (prev.weights[f.id] || 0) : 0 }
                          }))
                        }}
                      />
                      <Label htmlFor={`check-${f.id}`} className="font-bold cursor-pointer">{f.label}</Label>
                    </div>
                    {localConfig.visibility[f.id] && (
                      <div className="flex items-center gap-2">
                        <Input 
                          type="number" 
                          className="w-20 h-9 text-center font-bold text-primary" 
                          value={localConfig.weights[f.id] || 0}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0
                            setLocalConfig(prev => ({
                              ...prev,
                              weights: { ...prev.weights, [f.id]: val }
                            }))
                          }}
                        />
                        <span className="text-sm font-bold text-muted-foreground">%</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </ScrollArea>
          <DialogFooter className="p-6 pt-2 border-t">
            <Button onClick={() => setIsConfigOpen(false)} className="w-full h-11 gap-2" disabled={totalWeight !== 100}>
              <Check className="w-4 h-4" /> Terapkan Konfigurasi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function GradingPage() {
  return (
    <Suspense fallback={<div className="flex flex-col items-center justify-center py-24 gap-4"><Loader2 className="animate-spin text-primary w-8 h-8" /><p className="text-sm text-muted-foreground animate-pulse">Memuat buku nilai...</p></div>}>
      <GradingPageContent />
    </Suspense>
  )
}
