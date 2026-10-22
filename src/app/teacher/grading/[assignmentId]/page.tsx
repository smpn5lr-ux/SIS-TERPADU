
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
  AlertTriangle,
  ChevronLeft,
  LayoutGrid
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
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { useUser, useFirestore, useMemoFirebase, useCollection, useDoc } from "@/firebase"
import { collection, query, where, doc, writeBatch } from "firebase/firestore"
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
  { id: 'midExam', label: 'STS' },
  { id: 'finalExam', label: 'SAS' },
]

type GradingView = 'table' | 'config'

function GradingPageContent() {
  const { assignmentId } = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const db = useFirestore()
  const { user, loading: userLoading } = useUser()
  const { toast } = useToast()
  
  const [activeView, setActiveView] = useState<GradingView>('table')
  const [isSaving, setIsSaving] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  
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

  const balanceWeights = (weights: Record<string, number>, changedField: string, newVal: number, visibility: Record<string, boolean>) => {
    const visibleIds = GRADE_FIELDS.filter(f => visibility[f.id]).map(f => f.id);
    if (visibleIds.length <= 1) {
      return { ...weights, [changedField]: 100 };
    }

    const others = visibleIds.filter(id => id !== changedField);
    const newValClamped = Math.min(100, Math.max(0, newVal));
    const remaining = 100 - newValClamped;
    
    const sumOthers = others.reduce((s, id) => s + (weights[id] || 0), 0);
    const newWeights = { ...weights, [changedField]: newValClamped };

    if (sumOthers > 0) {
      others.forEach(id => {
        const ratio = (weights[id] || 0) / sumOthers;
        newWeights[id] = Math.round(ratio * remaining);
      });
    } else {
      others.forEach(id => {
        newWeights[id] = Math.round(remaining / others.length);
      });
    }

    const currentTotal = visibleIds.reduce((s, id) => s + (newWeights[id] || 0), 0);
    if (currentTotal !== 100 && others.length > 0) {
      const diff = 100 - currentTotal;
      newWeights[others[0]] += diff;
    }

    return newWeights;
  };

  const handleToggleVisibility = (fieldId: string, checked: boolean) => {
    setLocalConfig(prev => {
      const newVisibility = { ...prev.visibility, [fieldId]: checked };
      const visibleIds = GRADE_FIELDS.filter(f => newVisibility[f.id]).map(f => f.id);
      
      let newWeights = { ...prev.weights };
      if (!checked) {
        const removedWeight = prev.weights[fieldId] || 0;
        newWeights[fieldId] = 0;
        if (visibleIds.length > 0) {
          const sumVisible = visibleIds.reduce((s, id) => s + (newWeights[id] || 0), 0);
          if (sumVisible > 0) {
            visibleIds.forEach(id => {
              newWeights[id] += Math.round((newWeights[id] / sumVisible) * removedWeight);
            });
          } else {
            visibleIds.forEach(id => {
              newWeights[id] = Math.round(100 / visibleIds.length);
            });
          }
        }
      } else {
        const initialShare = Math.round(100 / visibleIds.length);
        newWeights = balanceWeights(prev.weights, fieldId, initialShare, newVisibility);
      }

      const finalTotal = visibleIds.reduce((s, id) => s + (newWeights[id] || 0), 0);
      if (finalTotal !== 100 && visibleIds.length > 0) {
        newWeights[visibleIds[0]] += (100 - finalTotal);
      }

      return { ...prev, visibility: newVisibility, weights: newWeights };
    });
  };

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
      if (gradingConfigRef) {
        batch.set(gradingConfigRef, localConfig, { merge: true })
      }

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
      if (activeView === 'config') setActiveView('table')
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
      
      const govName = (config?.govName || "PEMERINTAH KABUPATEN MANGGARAI").toUpperCase();
      let dinasName = (config?.dinasName || "DINAS PENDIDIKAN").toUpperCase();
      if (dinasName.startsWith(govName)) dinasName = dinasName.replace(govName, "").trim();
      const schoolName = (config?.schoolName || "SIS TERPADU").toUpperCase();
      const schoolAddress = config?.schoolAddress || "Alamat Sekolah";
      const academicYear = config?.academicYear || "-";
      const headmasterName = config?.headmasterName || "-";
      const headmasterNIP = config?.headmasterNIP || "-";
      const teacherName = user?.displayName || "-";
      
      // Kop Surat
      doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(0);
      doc.text(govName, 148, 12, { align: "center" });
      doc.text(dinasName, 148, 17, { align: "center" });
      doc.setFontSize(12).text(schoolName, 148, 23, { align: "center" });
      doc.setFont("helvetica", "normal").setFontSize(8).text(schoolAddress, 148, 28, { align: "center" });
      doc.setLineWidth(0.6).line(14, 31, 283, 31);
      doc.setLineWidth(0.1).line(14, 32, 283, 32);

      doc.setFontSize(11).setFont("helvetica", "bold").text(`DAFTAR NILAI SISWA - SEMESTER ${activeSemester}`, 148, 42, { align: "center" });
      doc.setFontSize(9).text(`TAHUN PELAJARAN ${academicYear}`, 148, 47, { align: "center" });

      doc.setFontSize(9).text(`MATA PELAJARAN: ${assignment.subjectName.toUpperCase()}`, 14, 56);
      doc.text(`KELAS: ${assignment.className.toUpperCase()}`, 283, 56, { align: "right" });
      doc.text(`GURU PENGAMPU: ${teacherName.toUpperCase()}`, 14, 61);
      
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
        startY: 65,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2, textColor: [0,0,0], lineColor: [0,0,0] },
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineWidth: 0.1, fontStyle: 'bold' },
        margin: { bottom: 40 }
      })

      // Tanda Tangan
      const finalY = (doc as any).lastAutoTable.finalY + 15;
      const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      const location = schoolAddress.split(',')[1]?.trim() || "Mando";

      doc.setFontSize(9).setFont("helvetica", "normal");
      doc.text(`Mengetahui,`, 40, finalY);
      doc.text(`Kepala Sekolah,`, 40, finalY + 5);
      
      doc.text(`${location}, ${today}`, 250, finalY, { align: "center" });
      doc.text(`Guru Mata Pelajaran,`, 250, finalY + 5, { align: "center" });

      doc.setFont("helvetica", "bold").text(headmasterName, 40, finalY + 25);
      doc.setFont("helvetica", "normal").text(`NIP. ${headmasterNIP}`, 40, finalY + 29);

      doc.setFont("helvetica", "bold").text(teacherName, 250, finalY + 25, { align: "center" });
      doc.setFont("helvetica", "normal").text(`NIP. -`, 250, finalY + 29, { align: "center" });

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

  if (activeView === 'config') {
    return (
      <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setActiveView('table')} className="rounded-full border"><ArrowLeft className="w-4 h-4" /></Button>
            <div>
               <h1 className="text-2xl font-bold">Konfigurasi Buku Nilai</h1>
               <p className="text-muted-foreground text-xs uppercase font-bold text-primary tracking-widest">{assignment?.subjectName} • KELAS {assignment?.className}</p>
            </div>
          </div>
          <Button onClick={saveAllGrades} disabled={isSaving || totalWeight !== 100} className="gap-2 shadow-lg shadow-primary/20 h-11 px-8">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Terapkan & Simpan
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
           <div className="lg:col-span-2">
              <Card className="border-border/50 shadow-md flex flex-col h-[calc(100vh-12rem)]">
                <CardHeader className="bg-muted/10 border-b shrink-0">
                   <CardTitle className="text-base flex items-center gap-2"><LayoutGrid className="w-4 h-4 text-primary" /> Pilih Komponen Nilai</CardTitle>
                   <CardDescription>Ceklis komponen dan isi bobot. Bobot lain akan menyesuaikan agar total tetap 100%.</CardDescription>
                </CardHeader>
                <ScrollArea className="flex-1">
                   <div className="divide-y divide-border/30">
                     {GRADE_FIELDS.map((f) => (
                       <div key={f.id} className="flex items-center justify-between p-4 px-6 hover:bg-muted/5 transition-colors">
                         <div className="flex items-center gap-4">
                           <Checkbox 
                             id={`check-${f.id}`}
                             checked={localConfig.visibility[f.id]}
                             onCheckedChange={(checked) => handleToggleVisibility(f.id, !!checked)}
                             className="h-5 w-5"
                           />
                           <Label htmlFor={`check-${f.id}`} className="font-bold text-sm cursor-pointer">{f.label}</Label>
                         </div>
                         {localConfig.visibility[f.id] && (
                           <div className="flex items-center gap-3">
                             <Input 
                               type="number" 
                               className="w-24 h-10 text-center font-bold text-lg bg-background border-primary/20 focus:border-primary transition-all" 
                               value={localConfig.weights[f.id] || 0}
                               onChange={(e) => {
                                 const val = parseInt(e.target.value) || 0;
                                 const updated = balanceWeights(localConfig.weights, f.id, val, localConfig.visibility);
                                 setLocalConfig(prev => ({ ...prev, weights: updated }));
                               }}
                             />
                             <span className="text-sm font-bold text-muted-foreground">%</span>
                           </div>
                         )}
                       </div>
                     ))}
                   </div>
                </ScrollArea>
              </Card>
           </div>

           <div className="space-y-6">
              <Card className={`border-2 transition-all shadow-xl sticky top-24 ${totalWeight === 100 ? 'bg-green-500/5 border-green-500/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
                <CardHeader className="pb-2">
                   <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                     <Info className="w-4 h-4" /> Ringkasan Bobot
                   </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                   <div className="flex flex-col items-center justify-center py-6">
                      <span className={`text-6xl font-black ${totalWeight === 100 ? 'text-green-500' : 'text-amber-500'}`}>
                        {totalWeight}%
                      </span>
                      <p className="text-[10px] mt-2 font-bold uppercase tracking-widest text-muted-foreground">Total Persentase</p>
                   </div>
                   
                   <Separator className="opacity-30" />

                   <div className="space-y-3">
                      {totalWeight === 100 ? (
                        <div className="flex items-start gap-3 p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-600">
                           <CheckCircle2 className="w-5 h-5 shrink-0" />
                           <p className="text-xs font-medium leading-relaxed">Bobot sudah seimbang (100%). Anda dapat menyimpan konfigurasi sekarang.</p>
                        </div>
                      ) : (
                        <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600">
                           <AlertTriangle className="w-5 h-5 shrink-0" />
                           <p className="text-xs font-medium leading-relaxed">Total bobot harus tepat 100% agar nilai akhir dapat dihitung secara valid.</p>
                        </div>
                      )}
                   </div>

                   <Button onClick={saveAllGrades} disabled={isSaving || totalWeight !== 100} className="w-full h-12 shadow-lg">
                      {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                      Simpan Permanen
                   </Button>
                </CardContent>
              </Card>
           </div>
        </div>
      </div>
    )
  }

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
          <Button variant="outline" onClick={() => setActiveView('config')} className="gap-2 border-primary/30 text-primary hover:bg-primary/5">
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
