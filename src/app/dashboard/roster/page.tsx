
"use client"

import React, { useState, useMemo, useEffect } from 'react'
import { 
  CalendarClock, 
  Plus, 
  Settings2, 
  Save, 
  Trash2, 
  AlertTriangle, 
  Loader2, 
  Clock, 
  Users, 
  BookOpen,
  CheckCircle2,
  Timer,
  Trash,
  Coffee,
  Sparkles,
  Info,
  Check,
  Zap,
  LayoutGrid,
  Download,
  ChevronDown,
  RefreshCw,
  Layers,
  CloudUpload,
  CloudOff,
  AlertCircle,
  ChevronLeft,
  ShieldAlert
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Progress } from "@/components/ui/progress"
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
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { useCollection, useFirestore, useMemoFirebase, useDoc } from '@/firebase'
import { collection, query, doc, setDoc, addDoc, deleteDoc, writeBatch } from 'firebase/firestore'
import { RosterEntry, Staff, Classroom, Subject, TeacherAssignment, RosterConfig } from '@/lib/types'
import { useToast } from '@/hooks/use-toast'
import { addMinutes, format, parse } from 'date-fns'

const DAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"]
const MAX_PERIODS = 10 

const PALETTE = [
  [173, 216, 230], [255, 182, 193], [144, 238, 144], [255, 255, 224],
  [255, 218, 185], [221, 160, 221], [175, 238, 238], [240, 230, 140],
  [250, 128, 114], [152, 251, 152], [219, 112, 147], [176, 196, 222],
  [255, 160, 122], [102, 205, 170], [123, 104, 238], [244, 164, 96],
];

export default function RosterManagementPage() {
  const db = useFirestore()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState("builder")
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isSavingConfig, setIsSavingConfig] = useState(false)
  const [isSyncingToCloud, setIsSyncingToCloud] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  
  const [localEntries, setLocalEntries] = useState<RosterEntry[]>([])
  const [isDirty, setIsDirty] = useState(false)

  const [newEntry, setNewEntry] = useState<Partial<RosterEntry>>({
    day: "Senin",
    period: 1,
    teacherId: "",
    classId: "",
    subjectId: "",
    isActivity: false,
    activityName: ""
  })

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [entryToDeleteId, setEntryToDeleteId] = useState<string | null>(null)

  const rosterQuery = useMemoFirebase(() => db ? collection(db, 'rosterEntries') : null, [db])
  const assignmentsQuery = useMemoFirebase(() => db ? collection(db, 'teacherAssignments') : null, [db])
  const staffQuery = useMemoFirebase(() => db ? collection(db, 'staff') : null, [db])
  const classesQuery = useMemoFirebase(() => db ? collection(db, 'classes') : null, [db])
  const subjectsQuery = useMemoFirebase(() => db ? collection(db, 'subjects') : null, [db])
  const configRef = useMemoFirebase(() => db ? doc(db, 'settings', 'roster') : null, [db])
  const systemSettingsRef = useMemoFirebase(() => db ? doc(db, 'settings', 'system') : null, [db])

  const { data: serverEntries, loading: loadingR } = useCollection<RosterEntry>(rosterQuery)
  const { data: assignments } = useCollection<TeacherAssignment>(assignmentsQuery)
  const { data: staff } = useCollection<Staff>(staffQuery)
  const { data: classes, loading: loadingClasses } = useCollection<Classroom>(classesQuery)
  const { data: subjects } = useCollection<Subject>(subjectsQuery)
  const { data: rosterConfig, loading: loadingConfigDoc } = useDoc<RosterConfig>(configRef)
  const { data: systemSettings } = useDoc<any>(systemSettingsRef)

  useEffect(() => {
    if (serverEntries && !isDirty) {
      setLocalEntries(serverEntries)
    }
  }, [serverEntries, isDirty])

  const teachers = staff?.filter(s => s.role === 'Guru') || []

  const sortedClasses = useMemo(() => {
    if (!classes) return []
    return [...classes].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  }, [classes])

  const config = useMemo(() => ({
    entryTime: rosterConfig?.entryTime || "07:00",
    jpDuration: rosterConfig?.jpDuration ?? 40,
    break1Active: rosterConfig?.break1Active ?? true,
    break1Period: rosterConfig?.break1Period ?? 4,
    break1Duration: rosterConfig?.break1Duration ?? 30,
    break2Active: rosterConfig?.break2Active ?? false,
    break2Period: rosterConfig?.break2Period ?? 6,
    break2Duration: rosterConfig?.break2Duration ?? 15
  }), [rosterConfig])

  const getTimeForPeriod = (period: number) => {
    let current = parse(config.entryTime, 'HH:mm', new Date())
    for (let i = 1; i < period; i++) {
      let duration = config.jpDuration
      if (config.break1Active && i === config.break1Period) duration = config.break1Duration
      if (config.break2Active && i === config.break2Period) duration = config.break2Duration
      current = addMinutes(current, duration)
    }
    let currentDuration = config.jpDuration
    if (config.break1Active && period === config.break1Period) currentDuration = config.break1Duration
    if (config.break2Active && period === config.break2Period) currentDuration = config.break2Duration
    
    const end = addMinutes(current, currentDuration)
    return `${format(current, 'HH:mm')} - ${format(end, 'HH:mm')}`
  }

  const workloadStats = useMemo(() => {
    if (!assignments || !classes) return []
    return assignments.map(a => {
      const cls = classes.find(c => c.id === a.classId)
      const displayClassName = cls ? cls.name : a.className

      const scheduledCount = localEntries.filter(e => 
        e.teacherId === a.teacherId && 
        e.subjectId === a.subjectId && 
        e.classId === a.classId
      ).length
      return {
        ...a,
        className: displayClassName,
        scheduled: scheduledCount,
        isMet: scheduledCount >= (a.totalJP || 0),
        percent: Math.min(100, Math.round((scheduledCount / (a.totalJP || 1)) * 100))
      }
    })
  }, [assignments, localEntries, classes])

  const teacherCoding = useMemo(() => {
    if (!assignments) return { teacherMap: new Map(), subjectColors: new Map() };
    const teacherMap = new Map();
    const subjectColors = new Map();
    const uniqueTeacherIds = Array.from(new Set(assignments.map(a => a.teacherId))).sort((a, b) => {
        const nameA = assignments.find(x => x.teacherId === a)?.teacherName || "";
        const nameB = assignments.find(x => x.teacherId === b)?.teacherName || "";
        return nameA.localeCompare(nameB);
      });
    uniqueTeacherIds.forEach((id, idx) => { teacherMap.set(id, idx + 1); });
    const sortedAssignments = [...assignments].sort((a, b) => {
      const tComp = (a.teacherName || "").localeCompare(b.teacherName || "");
      if (tComp !== 0) return tComp;
      return (a.subjectName || "").localeCompare(b.subjectName || "");
    });
    sortedAssignments.forEach((asg, idx) => {
      const key = `${asg.teacherId}_${asg.subjectId}`;
      if (!subjectColors.has(key)) { subjectColors.set(key, PALETTE[idx % PALETTE.length]); }
    });
    return { teacherMap, subjectColors };
  }, [assignments]);

  const handleAddEntryLocal = () => {
    const isGlobalBreak = (config.break1Active && newEntry.period === config.break1Period) || (config.break2Active && newEntry.period === config.break2Period);
    if (isGlobalBreak && !newEntry.isActivity) {
      toast({ variant: "destructive", title: "Jam Istirahat Global", description: "Jam ini sudah disetel untuk istirahat seluruh kelas." });
      return;
    }

    const t = teachers.find(t => t.id === newEntry.teacherId)
    const c = classes?.find(c => c.id === newEntry.classId)
    const s = subjects?.find(s => s.id === newEntry.subjectId)

    const entry: RosterEntry = {
      id: `temp-${Date.now()}`,
      day: newEntry.day || "Senin",
      period: newEntry.period || 1,
      classId: newEntry.classId || "",
      className: c?.name || "",
      teacherId: newEntry.isActivity ? "" : newEntry.teacherId,
      teacherName: newEntry.isActivity ? "" : t?.fullName || "",
      subjectId: newEntry.isActivity ? "" : newEntry.subjectId,
      subjectName: newEntry.isActivity ? "" : s?.name || "",
      isActivity: !!newEntry.isActivity,
      activityName: newEntry.isActivity ? newEntry.activityName : ""
    }

    setLocalEntries([...localEntries, entry])
    setIsDirty(true)
    setIsAddOpen(false)
    toast({ title: "Ditambahkan ke Buffer" })
  }

  const handleDeleteEntryLocal = (id: string) => {
    setEntryToDeleteId(id)
    setIsDeleteDialogOpen(true)
  }

  const confirmDeleteLocal = () => {
    if (!entryToDeleteId) return
    setLocalEntries(localEntries.filter(e => e.id !== entryToDeleteId))
    setIsDirty(true)
    setIsDeleteDialogOpen(false)
    setEntryToDeleteId(null)
  }

  const handleSyncGlobalBlocksLocal = () => {
    if (!classes) return
    const newBlocks: RosterEntry[] = []
    classes.forEach(cls => {
      DAYS.forEach(day => {
        if (config.break1Active) {
          const exists = localEntries.some(e => e.classId === cls.id && e.day === day && e.period === config.break1Period)
          if (!exists) {
            newBlocks.push({
              id: `temp-b1-${cls.id}-${day}`,
              day, period: config.break1Period, classId: cls.id, className: cls.name,
              isActivity: true, activityName: "ISTIRAHAT 1"
            })
          }
        }
        if (config.break2Active) {
          const exists = localEntries.some(e => e.classId === cls.id && e.day === day && e.period === config.break2Period)
          if (!exists) {
            newBlocks.push({
              id: `temp-b2-${cls.id}-${day}`,
              day, period: config.break2Period, classId: cls.id, className: cls.name,
              isActivity: true, activityName: "ISTIRAHAT 2"
            })
          }
        }
      })
    })
    if (newBlocks.length > 0) {
      setLocalEntries([...localEntries, ...newBlocks])
      setIsDirty(true)
      toast({ title: "Blok Istirahat Ditambahkan" })
    }
  }

  const handleAutoGenerateLocal = () => {
    if (!assignments || !classes) return
    const pool = [...localEntries]
    let filledCount = 0
    const unfinished = workloadStats.filter(w => !w.isMet).sort(() => Math.random() - 0.5)
    for (const job of unfinished) {
      let remaining = (job.totalJP || 0) - (pool.filter(e => e.teacherId === job.teacherId && e.subjectId === job.subjectId && e.classId === job.classId).length)
      if (remaining <= 0) continue
      const targetClass = classes.find(c => c.id === job.classId)
      if (!targetClass) continue
      for (const day of DAYS) {
        for (let p = 1; p <= MAX_PERIODS; p++) {
          if (remaining <= 0) break
          const isBreak = (config.break1Active && p === config.break1Period) || (config.break2Active && p === config.break2Period)
          if (isBreak) continue
          const isSlotTaken = pool.some(e => e.day === day && e.period === p && e.classId === targetClass.id)
          if (isSlotTaken) continue
          const isTeacherBusy = pool.some(e => e.day === day && e.period === p && e.teacherId === job.teacherId)
          if (isTeacherBusy) continue
          let batchSize = 1
          if (remaining >= 2 && p % 2 !== 0 && p < MAX_PERIODS) {
            const nextP = p + 1
            const nextIsBreak = (config.break1Active && nextP === config.break1Period) || (config.break2Active && nextP === config.break2Period)
            const nextIsTaken = pool.some(e => e.day === day && e.period === nextP && e.classId === targetClass.id)
            const nextIsBusy = pool.some(e => e.day === day && e.period === nextP && e.teacherId === job.teacherId)
            if (!nextIsBreak && !nextIsTaken && !nextIsBusy) batchSize = 2
          }
          for (let i = 0; i < batchSize; i++) {
            const currentP = p + i
            const entry: RosterEntry = {
              id: `temp-auto-${Date.now()}-${filledCount}`,
              day, period: currentP, classId: targetClass.id, className: targetClass.name,
              teacherId: job.teacherId, teacherName: job.teacherName,
              subjectId: job.subjectId, subjectName: job.subjectName,
              isActivity: false
            }
            pool.push(entry)
            filledCount++
            remaining--
          }
          if (batchSize > 1) p++
        }
        if (remaining <= 0) break
      }
    }
    if (filledCount > 0) {
      setLocalEntries(pool)
      setIsDirty(true)
      toast({ title: "Generate Selesai", description: `${filledCount} slot ditambahkan.` })
    }
  }

  const handleSyncToCloud = async () => {
    if (!db || !serverEntries) return
    setIsSyncingToCloud(true)
    const batch = writeBatch(db)
    try {
      const toDelete = serverEntries.filter(se => !localEntries.some(le => le.id === se.id))
      toDelete.forEach(e => { batch.delete(doc(db, 'rosterEntries', e.id)) })
      const toAdd = localEntries.filter(le => le.id.startsWith('temp-'))
      toAdd.forEach(e => {
        const newRef = doc(collection(db, 'rosterEntries'))
        const { id, ...data } = e
        batch.set(newRef, { ...data, createdAt: new Date().toISOString() })
      })
      await batch.commit()
      setIsDirty(false)
      toast({ title: "Sinkronisasi Berhasil" })
    } catch (e) {
      toast({ variant: "destructive", title: "Gagal Sinkronisasi" })
    } finally {
      setIsSyncingToCloud(false)
    }
  }

  const handleSaveConfig = async () => {
    if (!configRef) return
    setIsSavingConfig(true)
    try {
      await setDoc(configRef, config, { merge: true })
      toast({ title: "Konfigurasi Disimpan" })
    } catch (e) {
      toast({ variant: "destructive", title: "Gagal menyimpan" })
    } finally {
      setIsSavingConfig(false)
    }
  }

  const getEntry = (day: string, period: number, classId: string) => {
    return localEntries.find(e => e.day === day && e.period === period && e.classId === classId)
  }

  const handleDownloadUnified = async () => {
    if (!localEntries || !classes || !assignments) return;
    setIsExporting(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF('l', 'mm', 'a4');
      const { teacherMap, subjectColors } = teacherCoding;

      const govName = (systemSettings?.govName || "PEMERINTAH KABUPATEN MANGGARAI").toUpperCase();
      let dinasName = (systemSettings?.dinasName || "DINAS PENDIDIKAN").toUpperCase();
      if (dinasName.startsWith(govName)) dinasName = dinasName.replace(govName, "").trim();
      const schoolName = (systemSettings?.schoolName || "SIS TERPADU").toUpperCase();
      const schoolAddress = systemSettings?.schoolAddress || "Alamat Sekolah";

      doc.setFontSize(10).setFont("helvetica", "bold").setTextColor(0);
      doc.text(govName, 148.5, 12, { align: "center" });
      doc.text(dinasName, 148.5, 17, { align: "center" });
      doc.setFontSize(12).text(schoolName, 148.5, 23, { align: "center" });
      doc.setFont("helvetica", "normal").setFontSize(8).text(schoolAddress, 148.5, 28, { align: "center" });
      doc.setLineWidth(0.6).line(14, 31, 283, 31);
      
      doc.setFont("helvetica", "bold").setFontSize(11).text("MATRIKS JADWAL PELAJARAN TERPADU", 148.5, 40, { align: "center" });
      
      const sorted = [...classes].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      const tableHead = [['HARI', 'JAM', 'WAKTU', ...sorted.map(c => c.name)]];
      
      const tableBody: any[] = [];
      DAYS.forEach(day => {
        for (let p = 1; p <= MAX_PERIODS; p++) {
          const isGBreak = (config.break1Active && p === config.break1Period) || (config.break2Active && p === config.break2Period);
          const row: any[] = [];
          row.push(p === 1 ? day : ""); 
          row.push(p);
          row.push(getTimeForPeriod(p));
          
          if (isGBreak) {
            const breakLabel = (config.break1Active && p === config.break1Period) ? "ISTIRAHAT 1" : "ISTIRAHAT 2";
            sorted.forEach(() => row.push(breakLabel));
          } else {
            sorted.forEach(cls => {
              const entry = getEntry(day, p, cls.id);
              if (entry) {
                if (entry.isActivity) row.push(entry.activityName || "REHAT");
                else row.push(teacherMap.get(entry.teacherId) || "?");
              } else row.push("");
            });
          }
          tableBody.push(row);
        }
      });

      autoTable(doc, {
        head: tableHead,
        body: tableBody,
        startY: 45,
        theme: 'grid',
        styles: { fontSize: 6, cellPadding: 1, halign: 'center', valign: 'middle', textColor: [0,0,0], lineColor: [0,0,0] },
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontSize: 7, fontStyle: 'bold', lineWidth: 0.1 },
        columnStyles: { 0: { cellWidth: 15 }, 1: { cellWidth: 8 }, 2: { cellWidth: 15 } },
        didParseCell: (data) => {
          if (data.section === 'body') {
            if (data.column.index === 0) {
              const isFirstRowOfDay = (data.row.index % MAX_PERIODS) === 0;
              if (isFirstRowOfDay) {
                data.cell.rowSpan = MAX_PERIODS;
                data.cell.styles.fontStyle = 'bold';
              }
            }
            const period = (data.row.index % MAX_PERIODS) + 1;
            const isG = (config.break1Active && period === config.break1Period) || (config.break2Active && period === config.break2Period);
            
            if (isG && data.column.index >= 3) {
              data.cell.styles.fillColor = [240, 240, 240];
              data.cell.styles.fontStyle = 'bold';
            } else if (data.column.index >= 3) {
              const currentDayIdx = Math.floor(data.row.index / MAX_PERIODS);
              const day = DAYS[currentDayIdx];
              const cls = sorted[data.column.index - 3];
              const entry = getEntry(day, period, cls.id);
              if (entry && !entry.isActivity) {
                const color = subjectColors.get(`${entry.teacherId}_${entry.subjectId}`);
                if (color) data.cell.styles.fillColor = color;
              }
            }
          }
        },
      });

      doc.addPage();
      doc.setFontSize(14).setFont("helvetica", "bold").text("LEGENDA GURU & MATA PELAJARAN", 14, 20);
      const uniqueTeachers = Array.from(new Set(assignments.map(a => a.teacherId)))
        .map(id => {
          const tAsgs = assignments.filter(a => a.teacherId === id);
          const distinctSubjects = Array.from(new Set(tAsgs.map(a => a.subjectName)));
          const distinctSubjectIds = distinctSubjects.map(name => tAsgs.find(a => a.subjectName === name)?.subjectId).filter(Boolean) as string[];
          return { id, name: tAsgs[0].teacherName, subjects: distinctSubjects, subjectIds: distinctSubjectIds, code: teacherMap.get(id) };
        }).sort((a, b) => (a.name || "").localeCompare(b.name || ""));

      autoTable(doc, {
        head: [['KODE', 'NAMA GURU', 'MATA PELAJARAN']],
        body: uniqueTeachers.map(t => ["", t.name, t.subjects.join(", ")]),
        startY: 30,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 4, minCellHeight: 12, valign: 'middle' },
        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], halign: 'center' },
        columnStyles: { 0: { cellWidth: 15, halign: 'center' }, 1: { cellWidth: 80 } },
        didDrawCell: (data) => {
          if (data.section === 'body' && data.column.index === 0) {
            const t = uniqueTeachers[data.row.index];
            const size = data.cell.width - 3;
            const x = data.cell.x + 1.5;
            const y = data.cell.y + (data.cell.height - size) / 2;
            if (t.subjectIds.length >= 2) {
              const c1 = subjectColors.get(`${t.id}_${t.subjectIds[0]}`);
              const c2 = subjectColors.get(`${t.id}_${t.subjectIds[1]}`);
              if (c1) { doc.setFillColor(c1[0], c1[1], c1[2]); doc.triangle(x, y, x + size, y, x, y + size, 'F'); }
              if (c2) { doc.setFillColor(c2[0], c2[1], c2[2]); doc.triangle(x + size, y, x + size, y + size, x, y + size, 'F'); }
            } else {
              const color = subjectColors.get(`${t.id}_${t.subjectIds[0]}`);
              if (color) { doc.setFillColor(color[0], color[1], color[2]); doc.rect(x, y, size, size, 'F'); }
            }
            doc.setDrawColor(0).rect(x, y, size, size);
            doc.setTextColor(0).setFontSize(9).text((t.code || "").toString(), x + size / 2, y + size / 2 + 1, { align: 'center', baseline: 'middle' });
          }
        }
      });
      doc.save(`Roster_Matriks_Terpadu_${schoolName.replace(/\s+/g, '_')}.pdf`);
    } catch (e) {
      toast({ variant: "destructive", title: "Gagal unduh" });
    } finally {
      setIsExporting(false);
    }
  };

  if (loadingR || loadingConfigDoc || loadingClasses) return <div className="flex justify-center py-24"><Loader2 className="animate-spin text-primary" /></div>

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Manajemen Roster</h1>
          <div className="flex items-center gap-2 mt-1">
             <p className="text-muted-foreground">Plotting jadwal mengajar sesuai beban JP Dapodik.</p>
             {isDirty ? (
               <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse gap-1"><CloudOff className="w-3 h-3" /> Ada Perubahan Belum Sinkron</Badge>
             ) : (
               <Badge className="bg-green-500/10 text-green-500 border-green-500/20 gap-1"><CheckCircle2 className="w-3 h-3" /> Terhubung Cloud</Badge>
             )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isDirty && (
            <Button onClick={handleSyncToCloud} disabled={isSyncingToCloud} className="bg-green-600 hover:bg-green-700 shadow-lg shadow-green-500/20 gap-2">
              {isSyncingToCloud ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
              Sinkronkan ke Cloud
            </Button>
          )}
          <Button variant="outline" onClick={handleSyncGlobalBlocksLocal} className="gap-2 border-primary/30 text-primary hover:bg-primary/5">
            <Layers className="w-4 h-4" /> Blok Global
          </Button>
          <Button variant="outline" onClick={handleAutoGenerateLocal} className="gap-2 border-accent/30 text-accent hover:bg-accent/5">
            <Zap className="w-4 h-4" /> Auto-Fill
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 border-primary/30"><Download className="w-4 h-4" /> Unduh <ChevronDown className="w-3 h-3" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={handleDownloadUnified}>Format Matriks Terpadu</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={() => setIsAddOpen(true)} className="gap-2 shadow-lg shadow-primary/20"><Plus className="w-4 h-4" /> Plot Manual</Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50 border p-1 mb-6">
          <TabsTrigger value="builder" className="gap-2"><LayoutGrid className="w-4 h-4" /> Jadwal Mingguan (Matriks)</TabsTrigger>
          <TabsTrigger value="settings" className="gap-2"><Settings2 className="w-4 h-4" /> Konfigurasi Waktu</TabsTrigger>
        </TabsList>

        <TabsContent value="builder" className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <Card className="border-border/50 bg-primary/5">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-bold flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-primary" /> Beban JP Dapodik</CardTitle></CardHeader>
              <CardContent className="space-y-4 pt-2">
                <div className="max-h-[600px] overflow-y-auto space-y-4 pr-2">
                  {workloadStats.map((w, idx) => (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex justify-between items-end">
                        <div className="flex flex-col"><span className="text-[10px] font-bold text-primary truncate max-w-[120px]">{w.teacherName}</span><span className="text-[9px] text-muted-foreground">{w.subjectName} ({w.className})</span></div>
                        <span className="text-[10px] font-bold">{w.scheduled} / {w.totalJP || 0} JP</span>
                      </div>
                      <Progress value={w.percent} className={`h-1.5 ${w.isMet ? 'bg-green-500/20' : 'bg-amber-500/20'}`} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            
            <div className="bg-accent/5 p-4 rounded-xl border border-accent/20 flex gap-3">
              <Info className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              <p className="text-[10px] text-muted-foreground italic">
                Sistem saat ini dalam mode <strong>Offline Buffer</strong>. Klik tombol hijau di atas untuk mengirim perubahan ke server.
              </p>
            </div>
          </div>

          <div className="lg:col-span-3">
             <Card className="border-border/50 shadow-md overflow-hidden bg-card/30">
               <div className="overflow-x-auto">
                 <Table className="border-collapse">
                   <TableHeader>
                     <TableRow className="bg-muted/30 hover:bg-muted/30">
                       <TableHead className="w-20 border-r font-bold text-center text-primary text-[10px] uppercase tracking-wider">HARI</TableHead>
                       <TableHead className="w-12 border-r font-bold text-center text-primary text-[10px] uppercase tracking-wider">JAM</TableHead>
                       <TableHead className="w-24 border-r font-bold text-center text-primary text-[10px] uppercase tracking-wider">WAKTU</TableHead>
                       {sortedClasses.map(cls => (
                         <TableHead key={cls.id} className="text-center min-w-[140px] font-bold border-r last:border-r-0 text-foreground text-[11px] uppercase py-3">
                           {cls.name}
                         </TableHead>
                       ))}
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {DAYS.map((day) => (
                       <React.Fragment key={day}>
                         {Array.from({ length: MAX_PERIODS }).map((_, i) => {
                           const period = i + 1;
                           const isGlobalBreak = (config.break1Active && period === config.break1Period) || (config.break2Active && period === config.break2Period);
                           const breakName = (config.break1Active && period === config.break1Period) ? "ISTIRAHAT 1" : "ISTIRAHAT 2";
                           
                           return (
                             <TableRow key={`${day}-${period}`} className={`hover:bg-transparent ${isGlobalBreak ? "bg-muted/10" : ""}`}>
                               {period === 1 && (
                                 <TableCell rowSpan={MAX_PERIODS} className="border-r font-bold text-center bg-muted/5 p-0">
                                   <div className="rotate-[-90deg] whitespace-nowrap text-xs text-primary font-black uppercase tracking-[0.2em]">{day}</div>
                                 </TableCell>
                               )}
                               <TableCell className="border-r font-bold text-[10px] text-center p-2">
                                 <div className={isGlobalBreak ? 'text-accent' : 'text-foreground'}>{period}</div>
                               </TableCell>
                               <TableCell className="border-r text-[9px] text-center p-1 text-muted-foreground whitespace-nowrap">
                                 {getTimeForPeriod(period)}
                               </TableCell>
                               
                               {isGlobalBreak ? (
                                 <TableCell colSpan={sortedClasses.length} className="p-0 border-r last:border-r-0 border-y border-accent/20">
                                    <div className="h-10 flex items-center justify-center bg-accent/5 text-accent font-black text-[9px] tracking-[0.4em] uppercase">
                                       {breakName}
                                    </div>
                                 </TableCell>
                               ) : (
                                 sortedClasses.map(cls => {
                                   const entry = getEntry(day, period, cls.id);
                                   const isTemp = entry?.id.startsWith('temp-');
                                   return (
                                     <TableCell key={cls.id} className="p-1 border-r last:border-r-0 h-24 group relative">
                                       {entry ? (
                                         <div className={`h-full border rounded-lg p-2.5 flex flex-col justify-center transition-all shadow-sm ${entry.isActivity ? 'bg-accent/10 border-accent/20' : 'bg-primary/10 border-primary/20'} ${isTemp ? 'border-dashed border-2 border-amber-500/30' : ''}`}>
                                           <div className="text-[9px] font-black truncate uppercase text-foreground leading-tight">
                                             {entry.isActivity ? (entry.activityName || "REHAT") : entry.subjectName}
                                           </div>
                                           {!entry.isActivity && <div className="text-[8px] text-muted-foreground truncate mt-1 italic font-medium">{entry.teacherName}</div>}
                                           {isTemp && <div className="absolute bottom-1 right-1"><RefreshCw className="w-2.5 h-2.5 text-amber-500 animate-spin" /></div>}
                                           <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive hover:bg-destructive/10 rounded-full" onClick={() => handleDeleteEntryLocal(entry.id)}>
                                             <Trash2 className="w-3.5 h-3.5" />
                                           </Button>
                                         </div>
                                       ) : (
                                         <div className="h-full flex flex-col items-center justify-center border border-dashed border-border/20 rounded-lg group-hover:border-primary/40 cursor-pointer bg-muted/2 transition-colors" 
                                              onClick={() => { setNewEntry({...newEntry, day, period, classId: cls.id}); setIsAddOpen(true); }}>
                                           <Plus className="w-4 h-4 text-muted-foreground opacity-10 group-hover:opacity-30" />
                                         </div>
                                       )}
                                     </TableCell>
                                   );
                                 })
                               )}
                             </TableRow>
                           );
                         })}
                       </React.Fragment>
                     ))}
                   </TableBody>
                 </Table>
               </div>
             </Card>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-border/50">
              <CardHeader className="border-b bg-muted/5"><CardTitle className="text-lg flex items-center gap-2"><Clock className="w-5 h-5 text-primary" /> Dasar Waktu Pelajaran</CardTitle></CardHeader>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <Label>Jam Masuk Sekolah</Label>
                  <input type="time" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={config.entryTime || "07:00"} onChange={e => {
                    const newTime = e.target.value || "07:00"
                    if (configRef) setDoc(configRef, { ...config, entryTime: newTime }, { merge: true }).catch(() => {})
                  }} />
                </div>
                <div className="space-y-2">
                  <Label>Durasi 1 JP (Menit)</Label>
                  <Input type="number" value={config.jpDuration || 0} onChange={e => {
                    const newDur = parseInt(e.target.value) || 0
                    if (configRef) setDoc(configRef, { ...config, jpDuration: newDur }, { merge: true }).catch(() => {})
                  }} />
                </div>
                <Button onClick={handleSaveConfig} disabled={isSavingConfig} className="w-full gap-2">
                  {isSavingConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Simpan Konfigurasi
                </Button>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader className="border-b bg-muted/5"><CardTitle className="text-lg flex items-center gap-2"><Coffee className="w-5 h-5 text-accent" /> Konfigurasi Istirahat</CardTitle></CardHeader>
              <CardContent className="pt-6 space-y-8">
                <div className="p-4 rounded-xl border border-border/50 space-y-4 bg-accent/5">
                  <div className="flex items-center justify-between"><Label className="font-bold">Istirahat Pertama</Label><Switch checked={config.break1Active} onCheckedChange={v => {
                    if (configRef) setDoc(configRef, { ...config, break1Active: v }, { merge: true }).catch(() => {})
                  }} /></div>
                  {config.break1Active && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-[10px] uppercase">Setelah Jam Ke-</Label>
                        <Select value={config.break1Period?.toString() || "4"} onValueChange={v => {
                           if (configRef) setDoc(configRef, { ...config, break1Period: parseInt(v) }, { merge: true }).catch(() => {})
                        }}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="2">Jam Ke-2</SelectItem><SelectItem value="4">Jam Ke-4</SelectItem><SelectItem value="6">Jam Ke-6</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2"><Label className="text-[10px] uppercase">Durasi (Menit)</Label><Input type="number" value={config.break1Duration || 0} onChange={e => {
                        const newDur = parseInt(e.target.value) || 0
                        if (configRef) setDoc(configRef, { ...config, break1Duration: newDur }, { merge: true }).catch(() => {})
                      }} /></div>
                    </div>
                  )}
                </div>
                <div className="p-4 rounded-xl border border-border/50 space-y-4 bg-accent/5">
                  <div className="flex items-center justify-between"><Label className="font-bold">Istirahat Kedua</Label><Switch checked={config.break2Active} onCheckedChange={v => {
                    if (configRef) setDoc(configRef, { ...config, break2Active: v }, { merge: true }).catch(() => {})
                  }} /></div>
                  {config.break2Active && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-[10px] uppercase">Setelah Jam Ke-</Label>
                        <Select value={config.break2Period?.toString() || "6"} onValueChange={v => {
                           if (configRef) setDoc(configRef, { ...config, break2Period: parseInt(v) }, { merge: true }).catch(() => {})
                        }}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="6">Jam Ke-6</SelectItem><SelectItem value="8">Jam Ke-8</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2"><Label className="text-[10px] uppercase">Durasi (Menit)</Label><Input type="number" value={config.break2Duration || 0} onChange={e => {
                        const newDur = parseInt(e.target.value) || 0
                        if (configRef) setDoc(configRef, { ...config, break2Duration: newDur }, { merge: true }).catch(() => {})
                      }} /></div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={isAddOpen} onOpenChange={(v) => { setIsAddOpen(v); if(!v) setNewEntry({...newEntry, activityName: ""}); }}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader><DialogTitle>Plot Jadwal Manual</DialogTitle></DialogHeader>
          <div className="space-y-6 py-4">
            <div className="flex items-center justify-between p-3 bg-accent/5 border border-accent/20 rounded-xl">
               <div><Label className="font-bold">Mode Kegiatan Sekolah</Label><p className="text-[10px] text-muted-foreground italic">Agenda non-KBM (Upacara/Istirahat)</p></div>
               <Switch checked={newEntry.isActivity} onCheckedChange={v => setNewEntry({...newEntry, isActivity: v})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2"><Label>Hari</Label><Select value={newEntry.day || "Senin"} onValueChange={v => setNewEntry({...newEntry, day: v})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{DAYS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select></div>
               <div className="space-y-2"><Label>Jam Ke-</Label><Select value={newEntry.period?.toString() || "1"} onValueChange={v => setNewEntry({...newEntry, period: parseInt(v)})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Array.from({length: MAX_PERIODS}).map((_, i) => <SelectItem key={i+1} value={(i+1).toString()}>{i+1}</SelectItem>)}</SelectContent></Select></div>
            </div>
            {newEntry.isActivity ? (
               <div className="space-y-2"><Label>Nama Kegiatan</Label><Input value={newEntry.activityName || ""} onChange={e => setNewEntry({...newEntry, activityName: e.target.value})} placeholder="Contoh: ISTIRAHAT" /></div>
            ) : (
               <div className="space-y-2">
                 <Label>Pilih Penugasan Guru</Label>
                 <Select value={newEntry.teacherId && newEntry.subjectId ? `${newEntry.teacherId}|${newEntry.subjectId}` : ""} onValueChange={v => { const [tId, sId] = v.split('|'); setNewEntry({...newEntry, teacherId: tId, subjectId: sId}); }}>
                   <SelectTrigger><SelectValue placeholder="Pilih Guru & Mapel" /></SelectTrigger>
                   <SelectContent>
                     {assignments?.filter(a => a.classId === newEntry.classId).map(a => (
                       <SelectItem key={a.id} value={`${a.teacherId}|${a.subjectId}`}>{a.teacherName} - {a.subjectName}</SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
               </div>
            )}
          </div>
          <DialogFooter><Button onClick={handleAddEntryLocal} className="w-full">Tambahkan ke Buffer</Button></DialogFooter>
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
            <AlertDialogAction onClick={confirmDeleteLocal} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Ya, Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
