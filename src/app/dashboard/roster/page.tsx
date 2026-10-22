"use client"

import React, { useState, useMemo, useEffect } from 'react'
import { 
  Plus, 
  Settings2, 
  Trash2, 
  AlertTriangle, 
  Loader2, 
  Clock, 
  CheckCircle2,
  Coffee,
  LayoutGrid,
  Download,
  RefreshCw,
  CloudUpload,
  CloudOff,
  Info,
  ChevronLeft,
  ShieldAlert,
  Printer,
  Zap,
  BookOpen,
  UserCheck,
  CalendarDays,
  X,
  LogOut
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { useCollection, useFirestore, useMemoFirebase, useDoc } from '@/firebase'
import { collection, query, doc, setDoc, writeBatch } from 'firebase/firestore'
import { RosterEntry, Staff, Classroom, Subject, TeacherAssignment, RosterConfig } from '@/lib/types'
import { useToast } from '@/hooks/use-toast'
import { addMinutes, format, parse, differenceInMinutes } from 'date-fns'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

const DAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"]

const COLOR_PALETTE = [
  { bg: 'bg-blue-100', border: 'border-blue-300', text: 'text-blue-800', rgb: [219, 234, 254] },
  { bg: 'bg-green-100', border: 'border-green-300', text: 'text-green-800', rgb: [220, 252, 231] },
  { bg: 'bg-purple-100', border: 'border-purple-300', text: 'text-purple-800', rgb: [243, 232, 255] },
  { bg: 'bg-pink-100', border: 'border-pink-300', text: 'text-pink-800', rgb: [252, 231, 243] },
  { bg: 'bg-orange-100', border: 'border-orange-300', text: 'text-orange-800', rgb: [255, 237, 213] },
  { bg: 'bg-teal-100', border: 'border-teal-300', text: 'text-teal-800', rgb: [204, 251, 241] },
  { bg: 'bg-indigo-100', border: 'border-indigo-300', text: 'text-indigo-800', rgb: [224, 231, 255] },
  { bg: 'bg-rose-100', border: 'border-rose-300', text: 'text-rose-800', rgb: [255, 228, 230] },
  { bg: 'bg-amber-100', border: 'border-amber-300', text: 'text-amber-800', rgb: [254, 243, 199] },
  { bg: 'bg-emerald-100', border: 'border-emerald-300', text: 'text-emerald-800', rgb: [209, 250, 229] },
];

const getEntryColor = (subjectName: string) => {
  if (!subjectName) return COLOR_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < subjectName.length; i++) {
    hash = subjectName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % COLOR_PALETTE.length;
  return COLOR_PALETTE[index];
};

export default function RosterManagementPage() {
  const db = useFirestore()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState("builder")
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isSyncingToCloud, setIsSyncingToCloud] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  
  const [localEntries, setLocalEntries] = useState<RosterEntry[]>([])
  const [isDirty, setIsDirty] = useState(false)

  const [newEntry, setNewEntry] = useState<Partial<RosterEntry>>({
    day: "Senin",
    period: 1,
    teacherId: "",
    classId: "",
    subjectId: ""
  })

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [entryToDeleteId, setEntryToDeleteId] = useState<string | null>(null)

  const rosterQuery = useMemoFirebase(() => db ? collection(db, 'rosterEntries') : null, [db])
  const assignmentsQuery = useMemoFirebase(() => db ? collection(db, 'teacherAssignments') : null, [db])
  const classesQuery = useMemoFirebase(() => db ? collection(db, 'classes') : null, [db])
  const subjectsQuery = useMemoFirebase(() => db ? collection(db, 'subjects') : null, [db])
  const staffQuery = useMemoFirebase(() => db ? collection(db, 'staff') : null, [db])
  const configRef = useMemoFirebase(() => db ? doc(db, 'settings', 'roster') : null, [db])
  const systemSettingsRef = useMemoFirebase(() => db ? doc(db, 'settings', 'system') : null, [db])

  const { data: serverEntries, loading: loadingR } = useCollection<RosterEntry>(rosterQuery)
  const { data: assignments } = useCollection<TeacherAssignment>(assignmentsQuery)
  const { data: staff } = useCollection<Staff>(staffQuery)
  const { data: classes, loading: loadingClasses } = useCollection<Classroom>(classesQuery)
  const { data: subjects } = useCollection<Subject>(subjectsQuery)
  const { data: rosterConfig, loading: loadingConfigDoc } = useDoc<any>(configRef)
  const { data: systemSettings } = useDoc<any>(systemSettingsRef)

  useEffect(() => {
    if (serverEntries && !isDirty) {
      setLocalEntries(serverEntries)
    }
  }, [serverEntries, isDirty])

  const sortedClasses = useMemo(() => {
    if (!classes) return []
    return [...classes].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  }, [classes])

  const config = useMemo(() => {
    const dailyDismissals: Record<string, string> = {};
    DAYS.forEach(d => {
      dailyDismissals[d] = rosterConfig?.dailyDismissalTimes?.[d] || rosterConfig?.dismissalTime || "13:00";
    });

    return {
      entryTime: rosterConfig?.entryTime || "07:00",
      dismissalTime: rosterConfig?.dismissalTime || "13:00", // Fallback
      dailyDismissalTimes: dailyDismissals,
      jpDuration: Number(rosterConfig?.jpDuration) || 40,
      maxPeriods: Number(rosterConfig?.maxPeriods) || 8,
      break1Active: rosterConfig?.break1Active ?? true,
      break1Period: rosterConfig?.break1Period ?? 4,
      break1Duration: Number(rosterConfig?.break1Duration) || 30,
      break2Active: rosterConfig?.break2Active ?? false,
      break2Period: rosterConfig?.break2Period ?? 6,
      break2Duration: Number(rosterConfig?.break2Duration) || 15,
      globalActivities: (rosterConfig?.globalActivities || []) as { id: string, name: string, day: string, period: number, duration: number }[]
    };
  }, [rosterConfig])

  // Fungsi simulasi untuk menghitung jumlah JP berdasarkan jam pulang yang diinginkan (per hari)
  const calculateNewMaxJP = (entry: string, dailyDismissals: Record<string, string>, jpDur: number, currentConfig: any) => {
    const start = parse(entry, 'HH:mm', new Date());
    let overallMax = 0;
    
    DAYS.forEach(day => {
      const end = parse(dailyDismissals[day], 'HH:mm', new Date());
      let current = start;
      let period = 0;
      
      while (period < 20) { // Safety limit 20 jam
        const nextP = period + 1;
        
        // Cek Kegiatan rutin untuk periode ini
        const acts = (currentConfig.globalActivities || []).filter((a: any) => a.day === day && a.period === nextP);
        acts.forEach((a: any) => current = addMinutes(current, a.duration));
        
        // Cek apakah sisa waktu cukup untuk 1 JP pelajaran
        const lessonEnd = addMinutes(current, jpDur);
        if (lessonEnd > end) break;
        
        current = lessonEnd;
        period = nextP;
        
        // Cek Istirahat
        if (currentConfig.break1Active && period === currentConfig.break1Period) current = addMinutes(current, currentConfig.break1Duration);
        if (currentConfig.break2Active && period === currentConfig.break2Period) current = addMinutes(current, currentConfig.break2Duration);
        
        if (current >= end) break;
      }
      if (period > overallMax) overallMax = period;
    });
    
    return overallMax || 1;
  };

  const handleUpdateConfig = (updates: any) => {
    if (!configRef) return;
    
    let finalUpdates = { ...config, ...updates };
    
    // Jika jam masuk, jam pulang harian, atau durasi JP berubah, hitung ulang Max JP
    if (updates.dailyDismissalTimes || updates.entryTime || updates.jpDuration) {
      const newMax = calculateNewMaxJP(
        updates.entryTime || config.entryTime,
        updates.dailyDismissalTimes || config.dailyDismissalTimes,
        updates.jpDuration || config.jpDuration,
        finalUpdates
      );
      finalUpdates.maxPeriods = newMax;
    }

    setDoc(configRef, finalUpdates, { merge: true }).catch(() => {});
  };

  // Helper untuk merangkai baris-baris jadwal dalam satu hari secara kronologis
  const generateDayTimeline = (day: string) => {
    const timeline: any[] = [];
    let currentTime = parse(config.entryTime, 'HH:mm', new Date());
    const dayDismissalTime = parse(config.dailyDismissalTimes[day], 'HH:mm', new Date());

    for (let p = 1; p <= config.maxPeriods; p++) {
      // 1. Tambahkan Kegiatan Rutin Global (jika ada di jam p)
      const periodActivities = config.globalActivities.filter(a => a.day === day && a.period === p);
      if (periodActivities.length > 0) {
        periodActivities.forEach(act => {
          const startTime = currentTime;
          currentTime = addMinutes(currentTime, act.duration);
          timeline.push({ 
            type: 'activity', 
            label: p.toString(), 
            name: act.name, 
            period: p,
            startTime, 
            endTime: currentTime, 
            duration: act.duration,
            isGlobal: true 
          });
        });
      }

      // 2. Tambahkan Jam Pelajaran Standar (Hanya jika belum melewati jam pulang)
      const startTime = currentTime;
      const lessonEnd = addMinutes(currentTime, config.jpDuration);
      
      if (lessonEnd <= dayDismissalTime) {
        currentTime = lessonEnd;
        timeline.push({ 
          type: 'lesson', 
          label: p.toString(), 
          period: p,
          startTime, 
          endTime: currentTime 
        });

        // 3. Tambahkan Istirahat
        if (config.break1Active && p === config.break1Period) {
          const bStart = currentTime;
          currentTime = addMinutes(currentTime, config.break1Duration);
          timeline.push({ 
            type: 'break', 
            label: 'B', 
            name: 'ISTIRAHAT', 
            startTime: bStart, 
            endTime: currentTime,
            duration: config.break1Duration
          });
        }
        if (config.break2Active && p === config.break2Period) {
          const bStart = currentTime;
          currentTime = addMinutes(currentTime, config.break2Duration);
          timeline.push({ 
            type: 'break', 
            label: 'B', 
            name: 'ISTIRAHAT', 
            startTime: bStart, 
            endTime: currentTime,
            duration: config.break2Duration
          });
        }
      }
    }

    // 4. Baris Waktu Pulang (Menggunakan Input Manual dari Config per Hari)
    timeline.push({ 
      type: 'dismissal', 
      label: 'P', 
      name: 'WAKTU PULANG SEKOLAH', 
      startTime: dayDismissalTime 
    });

    return timeline;
  };

  const workloadStats = useMemo(() => {
    if (!assignments || !classes) return []
    return assignments.map(a => {
      const cls = classes.find(c => c.id === a.classId)
      const displayClassName = cls ? cls.name : (a.className || "-")
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

  const handleAutoGenerate = () => {
    if (!assignments || !classes) return;
    setIsDirty(true);
    let currentRoster = [...localEntries].filter(e => e.isActivity);
    const shuffledAssignments = [...assignments].sort(() => Math.random() - 0.5);
    
    shuffledAssignments.forEach(asg => {
      const scheduledCount = currentRoster.filter(e => e.teacherId === asg.teacherId && e.subjectId === asg.subjectId && e.classId === asg.classId).length;
      let remainingJP = (asg.totalJP || 0) - scheduledCount;
      if (remainingJP <= 0) return;
      
      const shuffledDays = [...DAYS].sort(() => Math.random() - 0.5);
      const shuffledPeriods = Array.from({length: config.maxPeriods}, (_, i) => i + 1).sort(() => Math.random() - 0.5);
      
      for (const day of shuffledDays) {
        for (const p of shuffledPeriods) {
          if (remainingJP <= 0) break;
          // Validasi apakah jam tersebut tersedia di hari itu (berdasarkan jam pulang harian)
          const dayTimeline = generateDayTimeline(day);
          const isSlotExists = dayTimeline.find(row => row.type === 'lesson' && row.period === p);
          if (!isSlotExists) continue;

          const isSlotFree = !currentRoster.find(e => e.day === day && e.period === p && e.classId === asg.classId);
          const isTeacherFree = !currentRoster.find(e => e.day === day && e.period === p && e.teacherId === asg.teacherId);
          if (isSlotFree && isTeacherFree) {
            currentRoster.push({
              id: `temp-${Date.now()}-${Math.random()}`,
              day, period: p, classId: asg.classId, className: asg.className,
              teacherId: asg.teacherId, teacherName: asg.teacherName,
              subjectId: asg.subjectId, subjectName: asg.subjectName, isActivity: false
            });
            remainingJP--;
          }
        }
        if (remainingJP <= 0) break;
      }
    });
    setLocalEntries(currentRoster);
    toast({ title: "Penjadwalan Otomatis Selesai" });
  };

  const handleAddEntryLocal = () => {
    const t = staff?.find(s => s.id === newEntry.teacherId)
    const c = classes?.find(c => c.id === newEntry.classId)
    const s = subjects?.find(s => s.id === newEntry.subjectId)

    const entry: RosterEntry = {
      id: `temp-${Date.now()}`,
      day: newEntry.day || "Senin",
      period: newEntry.period || 1,
      classId: newEntry.classId || "",
      className: c?.name || "-",
      teacherId: newEntry.teacherId,
      teacherName: t?.fullName || "-",
      subjectId: newEntry.subjectId,
      subjectName: s?.name || "-",
      isActivity: false
    }

    setLocalEntries([...localEntries, entry])
    setIsDirty(true)
    setIsAddOpen(false)
    toast({ title: "Ditambahkan ke Buffer" })
  }

  const handleSyncToCloud = async () => {
    if (!db || !serverEntries) return
    setIsSyncingToCloud(true)
    const batch = writeBatch(db)
    try {
      const toDelete = serverEntries.filter(se => !localEntries.some(le => le.id === se.id))
      toDelete.forEach(e => { batch.delete(doc(db, 'rosterEntries', e.id)) })
      localEntries.forEach(le => {
        if (le.id.startsWith('temp-')) {
          const newRef = doc(collection(db, 'rosterEntries'))
          const { id, ...data } = le
          batch.set(newRef, { ...data, createdAt: new Date().toISOString() })
        } else {
          const serverVer = serverEntries.find(ss => ss.id === le.id)
          if (JSON.stringify(serverVer) !== JSON.stringify(le)) {
            batch.update(doc(db, 'rosterEntries', le.id), le as any)
          }
        }
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

  const handleDeleteTrigger = (id: string) => {
    setEntryToDeleteId(id)
    setIsDeleteDialogOpen(true)
  }

  const executeDeleteLocal = () => {
    if (!entryToDeleteId) return
    setLocalEntries(prev => prev.filter(e => e.id !== entryToDeleteId))
    setIsDirty(true)
    setIsDeleteDialogOpen(false)
    setEntryToDeleteId(null)
  }

  const handleAddGlobalActivity = () => {
    const newAct = { id: `act-${Date.now()}`, name: "KEGIATAN BARU", day: "Senin", period: 1, duration: 15 };
    const updated = [...(config.globalActivities || []), newAct];
    handleUpdateConfig({ globalActivities: updated });
  };

  const updateGlobalActivity = (id: string, field: string, val: any) => {
    const updated = config.globalActivities.map(a => a.id === id ? { ...a, [field]: val } : a);
    handleUpdateConfig({ globalActivities: updated });
  };

  const removeGlobalActivity = (id: string) => {
    const updated = config.globalActivities.filter(a => a.id !== id);
    handleUpdateConfig({ globalActivities: updated });
  };

  const handleDownloadUnified = async () => {
    if (!localEntries || !classes) return;
    setIsExporting(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF('l', 'mm', 'a4');

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
      doc.setLineWidth(0.1).line(14, 32, 283, 32);
      
      doc.setFont("helvetica", "bold").setFontSize(11).text("MATRIKS JADWAL PELAJARAN TERPADU", 148.5, 40, { align: "center" });
      
      const sorted = [...classes].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      const tableHead = [['HARI', 'JAM', 'WAKTU', ...sorted.map(c => c.name)]];
      
      const tableBody: any[] = [];

      DAYS.forEach(day => {
        const dayTimeline = generateDayTimeline(day);
        let dayCellAdded = false;

        dayTimeline.forEach(row => {
          const tableRow: any[] = [];
          if (!dayCellAdded) {
            tableRow.push({ content: day, rowSpan: dayTimeline.length, styles: { fontStyle: 'bold', valign: 'middle', halign: 'center' } });
            dayCellAdded = true;
          }
          tableRow.push(row.label);
          
          const timeStr = format(row.startTime, 'HH:mm') + (row.type !== 'dismissal' ? ` - ${format(row.endTime, 'HH:mm')}` : '');
          tableRow.push(timeStr);

          if (row.type === 'lesson') {
            sorted.forEach(cls => {
              const entry = localEntries.find(e => e.day === day && e.period === row.period && e.classId === cls.id);
              if (entry) {
                const colorInfo = getEntryColor(entry.subjectName || "");
                tableRow.push({ 
                  content: `${entry.subjectName || "-"}\n(${entry.teacherName || "-"})`, 
                  styles: { fillColor: colorInfo.rgb, textColor: [0, 0, 0], fontSize: 6 } 
                });
              } else {
                tableRow.push("");
              }
            });
          } else if (row.type === 'activity') {
            tableRow.push({ 
              content: `${row.name.toUpperCase()} (${row.duration} MENIT)`, 
              colSpan: sorted.length, 
              styles: { fillColor: [255, 248, 230], fontStyle: 'bold', halign: 'center', textColor: [0, 0, 0] } 
            });
          } else if (row.type === 'break') {
            tableRow.push({ 
              content: `ISTIRAHAT (${row.duration} MENIT)`, 
              colSpan: sorted.length, 
              styles: { fillColor: [230, 230, 230], fontStyle: 'bold', textColor: [80, 80, 80], halign: 'center' } 
            });
          } else if (row.type === 'dismissal') {
            tableRow.push({
              content: "WAKTU PULANG SEKOLAH",
              colSpan: sorted.length,
              styles: { fillColor: [255, 235, 235], fontStyle: 'bold', textColor: [200, 0, 0], halign: 'center' }
            });
          }
          
          tableBody.push(tableRow);
        });
      });

      autoTable(doc, {
        head: tableHead,
        body: tableBody,
        startY: 45,
        theme: 'grid',
        styles: { fontSize: 6, cellPadding: 1, halign: 'center', valign: 'middle', textColor: [0,0,0], lineColor: [0,0,0] },
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontSize: 7, fontStyle: 'bold', lineWidth: 0.1 },
        columnStyles: { 0: { cellWidth: 15 }, 1: { cellWidth: 8 }, 2: { cellWidth: 18 } },
      });

      doc.save(`Roster_Matriks_Terintegrasi_${schoolName.replace(/\s+/g, '_')}.pdf`);
      toast({ title: "Berhasil Mengunduh PDF" });
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
             <p className="text-muted-foreground text-sm font-medium">Pengaturan terpadu jadwal mengajar & agenda rutin sekolah.</p>
             {isDirty ? (
               <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse gap-1"><CloudOff className="w-3 h-3" /> Belum Sinkron</Badge>
             ) : (
               <Badge className="bg-green-500/10 text-green-500 border-green-500/20 gap-1"><CheckCircle2 className="w-3 h-3" /> Tersinkron</Badge>
             )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isDirty && (
            <Button onClick={handleSyncToCloud} disabled={isSyncingToCloud} className="bg-green-600 hover:bg-green-700 shadow-lg shadow-green-500/20 gap-2">
              {isSyncingToCloud ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
              Simpan Cloud
            </Button>
          )}
          <Button variant="outline" onClick={handleDownloadUnified} disabled={isExporting} className="gap-2 border-primary/30">
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            Cetak Matriks
          </Button>
          <Button variant="secondary" onClick={handleAutoGenerate} className="gap-2 text-primary border-primary/20 hover:bg-primary/10">
            <Zap className="w-4 h-4" /> Acak Jadwal
          </Button>
          <Button onClick={() => setIsAddOpen(true)} className="gap-2 shadow-lg shadow-primary/20"><Plus className="w-4 h-4" /> Plot Mapel</Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50 border p-1 mb-6">
          <TabsTrigger value="builder" className="gap-2"><LayoutGrid className="w-4 h-4" /> Matriks Mingguan</TabsTrigger>
          <TabsTrigger value="settings" className="gap-2"><Settings2 className="w-4 h-4" /> Konfigurasi Waktu</TabsTrigger>
        </TabsList>

        <TabsContent value="builder" className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <Card className="border-border/50 bg-primary/5">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-bold flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-primary" /> Beban JP</CardTitle></CardHeader>
              <CardContent className="space-y-4 pt-2">
                <ScrollArea className="h-[500px] pr-2">
                  {workloadStats.map((w, idx) => (
                    <div key={idx} className="mb-4 space-y-1.5">
                      <div className="flex justify-between items-end">
                        <div className="flex flex-col"><span className="text-[10px] font-bold text-primary truncate max-w-[120px]">{w.teacherName || "-"}</span><span className="text-[9px] text-muted-foreground">{(w.subjectName || "-")} ({w.className})</span></div>
                        <span className="text-[10px] font-bold">{w.scheduled} / {w.totalJP || 0} JP</span>
                      </div>
                      <Progress value={w.percent} className={`h-1.5 ${w.isMet ? 'bg-green-500/20' : 'bg-amber-500/20'}`} />
                    </div>
                  ))}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-3">
             <Card className="border-border/50 shadow-md overflow-hidden bg-card/30">
               <ScrollArea className="w-full">
                 <Table className="border-collapse min-w-[800px]">
                   <TableHeader>
                     <TableRow className="bg-muted/30 hover:bg-muted/30">
                       <TableHead className="w-20 border-r font-bold text-center text-primary text-[10px] uppercase">HARI</TableHead>
                       <TableHead className="w-12 border-r font-bold text-center text-primary text-[10px] uppercase">JAM</TableHead>
                       <TableHead className="w-24 border-r font-bold text-center text-primary text-[10px] uppercase">WAKTU</TableHead>
                       {sortedClasses.map(cls => (
                         <TableHead key={cls.id} className="text-center min-w-[140px] font-bold border-r last:border-r-0 text-[11px] uppercase py-3">
                           {cls.name}
                         </TableHead>
                       ))}
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {DAYS.map((day) => {
                       const dayTimeline = generateDayTimeline(day);
                       let dayCellAdded = false;

                       return dayTimeline.map((row, rowIdx) => (
                         <TableRow key={`${day}-${rowIdx}`} className="hover:bg-transparent">
                           {!dayCellAdded && (
                             <TableCell rowSpan={dayTimeline.length} className="border-r font-bold text-center bg-muted/5 p-0">
                               <div className="rotate-[-90deg] whitespace-nowrap text-xs text-primary font-black uppercase tracking-[0.2em]">
                                 {day}
                               </div>
                               {(dayCellAdded = true) && null}
                             </TableCell>
                           )}
                           
                           <TableCell className={`border-r font-bold text-[10px] text-center p-2 ${row.type === 'break' ? 'text-accent' : row.type === 'dismissal' ? 'text-destructive' : ''}`}>
                             {row.label}
                           </TableCell>
                           
                           <TableCell className="border-r text-[9px] text-center p-1 text-muted-foreground whitespace-nowrap">
                             {format(row.startTime, 'HH:mm')} 
                             {row.type !== 'dismissal' && ` - ${format(row.endTime, 'HH:mm')}`}
                           </TableCell>

                           {row.type === 'lesson' ? (
                             sortedClasses.map(cls => {
                               const entry = localEntries.find(e => e.day === day && e.period === row.period && e.classId === cls.id);
                               const colorInfo = getEntryColor(entry?.subjectName || "");
                               return (
                                 <TableCell key={cls.id} className="p-1 border-r last:border-r-0 h-24 group relative">
                                   {entry ? (
                                     <div className={`h-full border rounded-lg p-2 flex flex-col justify-center text-center transition-all shadow-sm ${colorInfo.bg} ${colorInfo.border}`}>
                                       <div className={`text-[10px] font-bold leading-tight ${colorInfo.text}`}>{entry.subjectName || "-"}</div>
                                       <div className="text-[9px] text-muted-foreground mt-1 font-medium italic">({entry.teacherName || "-"})</div>
                                       <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive hover:bg-destructive/10 rounded-full" onClick={() => handleDeleteTrigger(entry.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                                     </div>
                                   ) : (
                                     <div className="h-full flex flex-col items-center justify-center border border-dashed border-border/10 rounded-lg group-hover:border-primary/20 cursor-pointer bg-muted/5 hover:bg-muted/10 transition-colors" onClick={() => { setNewEntry({...newEntry, day, period: row.period, classId: cls.id}); setIsAddOpen(true); }}><Plus className="w-4 h-4 text-muted-foreground opacity-20 group-hover:opacity-40" /></div>
                                   )}
                                 </TableCell>
                               );
                             })
                           ) : (
                             <TableCell colSpan={sortedClasses.length} className={`p-0 border-r last:border-r-0 border-y ${row.type === 'activity' ? 'bg-amber-50/50' : row.type === 'break' ? 'bg-accent/5' : 'bg-destructive/5'}`}>
                               <div className={`h-12 flex items-center justify-center font-black text-[11px] tracking-[0.4em] uppercase ${row.type === 'activity' ? 'text-amber-700' : row.type === 'break' ? 'text-accent' : 'text-destructive'}`}>
                                 {row.name} {row.duration && `(${row.duration} MENIT)`}
                               </div>
                             </TableCell>
                           )}
                         </TableRow>
                       ));
                     })}
                   </TableBody>
                 </Table>
               </ScrollArea>
             </Card>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <Card className="border-border/50">
                <CardHeader className="border-b bg-muted/5"><CardTitle className="text-lg flex items-center gap-2"><Clock className="w-5 h-5 text-primary" /> Dasar Waktu Pelajaran</CardTitle></CardHeader>
                <CardContent className="pt-6 space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Jam Masuk Sekolah</Label>
                      <input type="time" className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none transition-all" value={config.entryTime || "07:15"} onChange={e => handleUpdateConfig({ entryTime: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Durasi 1 JP (Menit)</Label>
                      <Input type="number" className="h-11" value={config.jpDuration || 40} onChange={e => handleUpdateConfig({ jpDuration: parseInt(e.target.value) || 0 })} />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <Label className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-2 border-b pb-2">
                      <LogOut className="w-4 h-4" /> Waktu Pulang Sekolah (Harian)
                    </Label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {DAYS.map(day => (
                        <div key={day} className="space-y-1.5 p-3 rounded-lg border bg-muted/5">
                          <Label className="text-[10px] font-bold uppercase text-muted-foreground">{day}</Label>
                          <input 
                            type="time" 
                            className="flex h-9 w-full rounded-md border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
                            value={config.dailyDismissalTimes[day]}
                            onChange={e => {
                              const newDaily = { ...config.dailyDismissalTimes, [day]: e.target.value };
                              handleUpdateConfig({ dailyDismissalTimes: newDaily });
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl flex gap-3">
                    <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <p className="text-[10px] text-muted-foreground italic leading-relaxed">
                      <strong>Info Sinkronisasi:</strong> Mengubah jam pulang akan otomatis menyesuaikan jumlah JP yang tersedia di matriks agar jadwal tidak melampaui waktu pulang.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/50">
                <CardHeader className="border-b bg-muted/5"><CardTitle className="text-lg flex items-center gap-2"><Coffee className="w-5 h-5 text-accent" /> Istirahat Global</CardTitle></CardHeader>
                <CardContent className="pt-6 space-y-8">
                  <div className="p-4 rounded-xl border border-border/50 space-y-4 bg-accent/5">
                    <div className="flex items-center justify-between"><Label className="font-bold">Istirahat Sekolah</Label><Switch checked={config.break1Active} onCheckedChange={v => handleUpdateConfig({ break1Active: v })} /></div>
                    {config.break1Active && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-[10px] uppercase">Setelah Jam Ke-</Label>
                          <Select value={config.break1Period?.toString() || "4"} onValueChange={v => handleUpdateConfig({ break1Period: parseInt(v) })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="2">Jam Ke-2</SelectItem><SelectItem value="3">Jam Ke-3</SelectItem><SelectItem value="4">Jam Ke-4</SelectItem><SelectItem value="5">Jam Ke-5</SelectItem></SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2"><Label className="text-[10px] uppercase">Durasi (Menit)</Label><Input type="number" value={config.break1Duration || 10} onChange={e => handleUpdateConfig({ break1Duration: parseInt(e.target.value) || 0 })} /></div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-border/50">
              <CardHeader className="border-b bg-muted/5 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2"><CalendarDays className="w-5 h-5 text-amber-500" /> Kegiatan Rutin Sekolah</CardTitle>
                  <CardDescription>Agenda global (Upacara, Literasi, dll) untuk semua kelas.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={handleAddGlobalActivity} className="h-8 gap-2 border-primary/30 text-primary">
                  <Plus className="w-3 h-3" /> Tambah
                </Button>
              </CardHeader>
              <CardContent className="pt-6">
                <ScrollArea className="h-[550px] pr-4">
                  <div className="space-y-4">
                    {(config.globalActivities || []).length === 0 ? (
                      <div className="text-center py-20 text-muted-foreground italic text-xs">Belum ada kegiatan rutin global.</div>
                    ) : (
                      config.globalActivities.map((act) => (
                        <div key={act.id} className="p-4 rounded-xl border bg-muted/10 space-y-4 relative group">
                          <Button variant="ghost" size="icon" onClick={() => removeGlobalActivity(act.id)} className="absolute top-2 right-2 h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                            <X className="w-4 h-4" />
                          </Button>
                          <div className="grid grid-cols-1 gap-3">
                            <div className="space-y-1.5">
                              <Label className="text-[10px] font-bold uppercase text-muted-foreground">Nama Kegiatan</Label>
                              <Input className="h-8 font-bold" value={act.name} onChange={e => updateGlobalActivity(act.id, 'name', e.target.value)} placeholder="Contoh: UPACARA BENDERA" />
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                              <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase text-muted-foreground">Hari</Label>
                                <Select value={act.day} onValueChange={v => updateGlobalActivity(act.id, 'day', v)}>
                                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                  <SelectContent>{DAYS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase text-muted-foreground">Jam Ke-</Label>
                                <Select value={act.period.toString()} onValueChange={v => updateGlobalActivity(act.id, 'period', parseInt(v))}>
                                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                  <SelectContent>{Array.from({length: 15}).map((_, i) => <SelectItem key={i+1} value={(i+1).toString()}>{i+1}</SelectItem>)}</SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase text-muted-foreground">Menit</Label>
                                <Input type="number" className="h-8" value={act.duration} onChange={e => updateGlobalActivity(act.id, 'duration', parseInt(e.target.value) || 0)} />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader><DialogTitle>Plot Mata Pelajaran</DialogTitle></DialogHeader>
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2"><Label>Hari</Label><Select value={newEntry.day || "Senin"} onValueChange={v => setNewEntry({...newEntry, day: v})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{DAYS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select></div>
               <div className="space-y-2"><Label>Jam Ke-</Label><Select value={newEntry.period?.toString() || "1"} onValueChange={v => setNewEntry({...newEntry, period: parseInt(v)})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Array.from({length: config.maxPeriods}).map((_, i) => <SelectItem key={i+1} value={(i+1).toString()}>{i+1}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="space-y-4">
              <div className="space-y-2"><Label>Pilih Kelas</Label><Select value={newEntry.classId} onValueChange={v => setNewEntry({...newEntry, classId: v})}><SelectTrigger><SelectValue placeholder="Pilih Kelas" /></SelectTrigger><SelectContent>{sortedClasses.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
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
            </div>
          </div>
          <DialogFooter><Button onClick={handleAddEntryLocal} className="w-full h-11 font-bold shadow-lg shadow-primary/20">Tambahkan ke Buffer</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-destructive" /> Hapus Jadwal?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini akan menghapus jadwal dari daftar sementara Anda.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={executeDeleteLocal} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Ya, Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}