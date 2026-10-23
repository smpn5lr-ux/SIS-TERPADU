
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
  LogOut,
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  Trash,
  FileCode
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { useCollection, useFirestore, useMemoFirebase, useDoc } from '@/firebase'
import { collection, query, doc, setDoc, writeBatch } from 'firebase/firestore'
import { RosterEntry, Staff, Classroom, Subject, TeacherAssignment, RosterConfig, GlobalActivity, DailyBreak } from '@/lib/types'
import { useToast } from '@/hooks/use-toast'
import { addMinutes, format, parse } from 'date-fns'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

const DAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"]

const COLOR_PALETTE = [
  [219, 234, 254], [220, 252, 231], [243, 232, 255], [252, 231, 243], [255, 237, 213],
  [204, 251, 241], [224, 231, 255], [255, 228, 230], [254, 243, 199], [209, 250, 229],
  [241, 245, 249], [254, 226, 226], [255, 251, 235], [236, 253, 245], [239, 246, 255],
  [245, 243, 255], [250, 245, 255], [255, 241, 242], [255, 247, 237], [252, 250, 242]
];

const getEntryColor = (subjectName: string) => {
  if (!subjectName) return { bg: 'bg-slate-100', border: 'border-slate-300', text: 'text-slate-800', rgb: [241, 245, 249] };
  let hash = 0;
  for (let i = 0; i < subjectName.length; i++) {
    hash = subjectName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % COLOR_PALETTE.length;
  const rgb = COLOR_PALETTE[index];
  return {
    bg: `bg-[rgb(${rgb[0]},${rgb[1]},${rgb[2]})]`,
    border: 'border-slate-200',
    text: 'text-slate-900',
    rgb: rgb
  };
};

export default function RosterManagementPage() {
  const db = useFirestore()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState("builder")
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isSyncingToCloud, setIsSyncingToCloud] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isExportingCoded, setIsExportingCoded] = useState(false)
  
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
    const dailyEntries: Record<string, string> = {};
    const dailyBreaks: Record<string, DailyBreak> = {};
    
    DAYS.forEach(d => {
      dailyDismissals[d] = rosterConfig?.dailyDismissalTimes?.[d] || rosterConfig?.dismissalTime || "13:00";
      dailyEntries[d] = rosterConfig?.dailyEntryTimes?.[d] || rosterConfig?.entryTime || "07:15";
      dailyBreaks[d] = rosterConfig?.dailyBreaks?.[d] || {
        active: rosterConfig?.break1Active ?? true,
        period: rosterConfig?.break1Period ?? 4,
        duration: rosterConfig?.break1Duration ?? 15
      };
    });

    return {
      entryTime: rosterConfig?.entryTime || "07:15",
      dismissalTime: rosterConfig?.dismissalTime || "13:00",
      dailyEntryTimes: dailyEntries,
      dailyDismissalTimes: dailyDismissals,
      dailyBreaks: dailyBreaks,
      jpDuration: Number(rosterConfig?.jpDuration) || 40,
      maxPeriods: Number(rosterConfig?.maxPeriods) || 8,
      globalActivities: (rosterConfig?.globalActivities || []) as GlobalActivity[]
    };
  }, [rosterConfig])

  const generateDayTimeline = (day: string) => {
    const timeline: any[] = [];
    let currentTime = parse(config.dailyEntryTimes[day], 'HH:mm', new Date());
    const dayDismissalTime = parse(config.dailyDismissalTimes[day], 'HH:mm', new Date());
    const dayBreak = config.dailyBreaks[day];

    const dayActivities = config.globalActivities.filter(a => a.day === day);
    const startActivities = dayActivities.filter(a => a.position !== 'end');
    const endActivities = dayActivities.filter(a => a.position === 'end');
    
    const totalEndDur = endActivities.reduce((sum, a) => sum + a.duration, 0);
    const effectiveDismissalLimit = addMinutes(dayDismissalTime, -totalEndDur);

    for (let p = 1; p <= config.maxPeriods; p++) {
      const periodStartActs = startActivities.filter(a => a.period === p);
      if (periodStartActs.length > 0) {
        periodStartActs.forEach(act => {
          const start = currentTime;
          currentTime = addMinutes(currentTime, act.duration);
          timeline.push({ 
            type: 'activity', 
            label: p.toString(), 
            name: act.name, 
            period: p,
            startTime: start, 
            endTime: currentTime, 
            duration: act.duration 
          });
        });
      }

      const lessonStart = currentTime;
      const lessonEnd = addMinutes(currentTime, config.jpDuration);
      
      if (lessonEnd <= effectiveDismissalLimit) {
        currentTime = lessonEnd;
        timeline.push({ 
          type: 'lesson', 
          label: p.toString(), 
          period: p,
          startTime: lessonStart, 
          endTime: currentTime 
        });

        if (dayBreak.active && p === dayBreak.period) {
          const bStart = currentTime;
          currentTime = addMinutes(currentTime, dayBreak.duration);
          timeline.push({ type: 'break', label: 'B', name: 'ISTIRAHAT', startTime: bStart, endTime: currentTime, duration: dayBreak.duration });
        }
      }
    }

    let endStartTime = effectiveDismissalLimit;
    endActivities.forEach(act => {
       const start = endStartTime;
       const end = addMinutes(start, act.duration);
       timeline.push({ 
         type: 'activity', 
         label: 'A', 
         name: act.name, 
         startTime: start, 
         endTime: end, 
         duration: act.duration,
         isFinal: true 
       });
       endStartTime = end;
    });

    timeline.push({ type: 'dismissal', label: 'P', name: 'WAKTU PULANG SEKOLAH', startTime: dayDismissalTime });
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

  const handleUpdateConfig = (updates: any) => {
    if (!configRef) return;
    setDoc(configRef, { ...config, ...updates }, { merge: true }).catch(() => {});
  };

  const handleAddGlobalActivity = (day: string, position: 'start' | 'end') => {
    const newAct: GlobalActivity = { 
      id: `act-${Date.now()}`, 
      name: position === 'start' ? "KEGIATAN PAGI" : "KEGIATAN AKHIR", 
      day, 
      period: 1, 
      duration: 15, 
      position 
    };
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
              styles: { fillColor: row.isFinal ? [255, 230, 230] : [255, 248, 230], fontStyle: 'bold', halign: 'center', textColor: [0, 0, 0] } 
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
              styles: { fillColor: [255, 220, 220], fontStyle: 'bold', textColor: [200, 0, 0], halign: 'center' }
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

  const handleDownloadCoded = async () => {
    if (!localEntries || !classes) return;
    setIsExportingCoded(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF('l', 'mm', 'a4');

      const govName = (systemSettings?.govName || "PEMERINTAH KABUPATEN MANGGARAI").toUpperCase();
      let dinasName = (systemSettings?.dinasName || "DINAS PENDIDIKAN").toUpperCase();
      if (dinasName.startsWith(govName)) dinasName = dinasName.replace(govName, "").trim();
      const schoolName = (systemSettings?.schoolName || "SIS TERPADU").toUpperCase();
      const academicYear = systemSettings?.academicYear || "2024/2025";

      doc.setFontSize(10).setFont("helvetica", "bold");
      doc.text(govName, 148.5, 10, { align: "center" });
      doc.text(dinasName, 148.5, 15, { align: "center" });
      doc.setFontSize(12).text(schoolName, 148.5, 21, { align: "center" });
      doc.setFontSize(9).text(`JADWAL PELAJARAN TAHUN PELAJARAN ${academicYear}`, 148.5, 26, { align: "center" });
      doc.line(14, 28, 283, 28);

      // PENGATURAN KODE UNIK PER GURU & MAPEL
      // Ambil seluruh assignment unik dari roster yang ada
      const assignmentPairs: { teacherId: string, teacherName: string, subjectName: string, key: string }[] = [];
      localEntries.forEach(e => {
        if (e.teacherId && e.subjectName && !e.isActivity) {
          const key = `${e.teacherId}|${e.subjectName}`;
          if (!assignmentPairs.find(p => p.key === key)) {
            assignmentPairs.push({ teacherId: e.teacherId, teacherName: e.teacherName || "-", subjectName: e.subjectName, key });
          }
        }
      });
      
      // Urutkan untuk menjaga konsistensi nomor (berdasarkan nama guru lalu mapel)
      assignmentPairs.sort((a, b) => {
        const nameComp = a.teacherName.localeCompare(b.teacherName);
        if (nameComp !== 0) return nameComp;
        return a.subjectName.localeCompare(b.subjectName);
      });

      const assignmentMap = new Map<string, { code: number, rgb: number[] }>();
      assignmentPairs.forEach((p, i) => {
        assignmentMap.set(p.key, { 
          code: i + 1, 
          rgb: COLOR_PALETTE[i % COLOR_PALETTE.length] 
        });
      });

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
              if (entry && entry.teacherId && entry.subjectName) {
                const mapping = assignmentMap.get(`${entry.teacherId}|${entry.subjectName}`);
                if (mapping) {
                  tableRow.push({ 
                    content: mapping.code.toString(), 
                    styles: { fillColor: mapping.rgb, textColor: [0, 0, 0], fontSize: 8, fontStyle: 'bold', halign: 'center' } 
                  });
                } else {
                  tableRow.push("");
                }
              } else {
                tableRow.push("");
              }
            });
          } else if (row.type === 'activity' || row.type === 'break' || row.type === 'dismissal') {
             const bg = row.type === 'break' ? [230, 230, 230] : row.type === 'dismissal' ? [255, 220, 220] : (row.isFinal ? [255, 230, 230] : [255, 248, 230]);
             tableRow.push({ 
               content: row.name.toUpperCase(), 
               colSpan: sorted.length, 
               styles: { fillColor: bg, fontStyle: 'bold', halign: 'center', textColor: [0, 0, 0], fontSize: 7 } 
             });
          }
          tableBody.push(tableRow);
        });
      });

      const classColWidth = Math.max(8, Math.floor(180 / sorted.length));
      const colStyles: any = { 0: { cellWidth: 15 }, 1: { cellWidth: 8 }, 2: { cellWidth: 18 } };
      sorted.forEach((_, i) => colStyles[i + 3] = { cellWidth: classColWidth });

      autoTable(doc, {
        head: tableHead,
        body: tableBody,
        startY: 32,
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 1, halign: 'center', valign: 'middle', textColor: [0,0,0], lineColor: [0,0,0] },
        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.1 },
        columnStyles: colStyles,
        margin: { right: 65 } // Space for legend on right
      });

      // LEGENDA MODEL GAMBAR (DI SISI KANAN)
      const startX = 238;
      let startY = 32;
      doc.setFontSize(8).setFont("helvetica", "bold").text("INDEKS GURU & MAPEL", startX, startY - 2);
      
      // Grouping assignmentPairs by Teacher
      const teacherGroups = new Map<string, { name: string, assignments: typeof assignmentPairs }>();
      assignmentPairs.forEach(p => {
        const group = teacherGroups.get(p.teacherId) || { name: p.teacherName, assignments: [] };
        group.assignments.push(p);
        teacherGroups.set(p.teacherId, group);
      });

      const sortedTeachers = Array.from(teacherGroups.values()).sort((a,b) => a.name.localeCompare(b.name));

      sortedTeachers.forEach((group) => {
        const rowHeight = 7.5;
        if (startY + rowHeight > 195) {
           doc.addPage();
           startY = 20;
        }

        // Draw Box
        const boxSize = 6;
        if (group.assignments.length === 1) {
          const mapping = assignmentMap.get(group.assignments[0].key)!;
          doc.setDrawColor(180).setLineWidth(0.1).setFillColor(mapping.rgb[0], mapping.rgb[1], mapping.rgb[2]).rect(startX, startY, boxSize, boxSize, 'F');
          doc.rect(startX, startY, boxSize, boxSize);
          doc.setFontSize(6.5).setFont("helvetica", "bold").setTextColor(0).text(mapping.code.toString(), startX + boxSize/2, startY + 4.2, { align: "center" });
        } else {
          // SPLIT DIAGONAL BOX
          const m1 = assignmentMap.get(group.assignments[0].key)!;
          const m2 = assignmentMap.get(group.assignments[1].key)!;
          
          // Bottom-right triangle
          doc.setFillColor(m1.rgb[0], m1.rgb[1], m1.rgb[2]);
          doc.triangle(startX, startY + boxSize, startX + boxSize, startY + boxSize, startX + boxSize, startY, 'F');
          
          // Top-left triangle
          doc.setFillColor(m2.rgb[0], m2.rgb[1], m2.rgb[2]);
          doc.triangle(startX, startY, startX + boxSize, startY, startX, startY + boxSize, 'F');
          
          doc.setDrawColor(180).setLineWidth(0.1).rect(startX, startY, boxSize, boxSize);
          doc.line(startX, startY + boxSize, startX + boxSize, startY); // Diagonal line
          
          // Show both codes or just the first
          doc.setFontSize(6).setFont("helvetica", "bold").setTextColor(0).text(`${m1.code}`, startX + boxSize/2, startY + 4.2, { align: "center" });
        }

        // Teacher Info
        doc.setFontSize(6.5).setFont("helvetica", "bold").setTextColor(50).text(group.name.toUpperCase(), startX + boxSize + 2, startY + 2.5);
        const subjectsText = group.assignments.map(a => a.subjectName).join(", ");
        doc.setFontSize(5.5).setFont("helvetica", "normal").setTextColor(100).text(subjectsText, startX + boxSize + 2, startY + 5.5);

        startY += rowHeight;
      });

      doc.save(`Roster_Legenda_Model_Kode_${schoolName.replace(/\s+/g, '_')}.pdf`);
      toast({ title: "Berhasil Mengunduh Format Kode" });
    } catch (e) {
      toast({ variant: "destructive", title: "Gagal unduh" });
    } finally {
      setIsExportingCoded(false);
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
          <Button variant="outline" onClick={handleDownloadCoded} disabled={isExportingCoded} className="gap-2 border-accent/30 text-accent">
            {isExportingCoded ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCode className="w-4 h-4" />}
            Cetak Model Kode
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
                           
                           <TableCell className={`border-r font-bold text-[10px] text-center p-2 ${row.type === 'break' ? 'text-accent' : row.type === 'dismissal' ? 'text-destructive font-black' : ''}`}>
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
                             <TableCell colSpan={sortedClasses.length} className={`p-0 border-r last:border-r-0 border-y ${row.type === 'activity' ? (row.isFinal ? 'bg-amber-200/30' : 'bg-amber-50/50') : row.type === 'break' ? 'bg-accent/5' : 'bg-destructive/5'}`}>
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-6">
              <Card className="border-border/50">
                <CardHeader className="border-b bg-muted/5"><CardTitle className="text-lg flex items-center gap-2"><Clock className="w-5 h-5 text-primary" /> Aturan Dasar</CardTitle></CardHeader>
                <CardContent className="pt-6 space-y-6">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Default Jam Masuk Sekolah</Label>
                      <input type="time" className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none transition-all" value={config.entryTime || "07:15"} onChange={e => handleUpdateConfig({ entryTime: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Durasi 1 JP (Menit)</Label>
                      <Input type="number" className="h-11" value={config.jpDuration || 40} onChange={e => handleUpdateConfig({ jpDuration: parseInt(e.target.value) || 0 })} />
                    </div>
                </CardContent>
              </Card>
              
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-4 flex gap-3">
                   <Info className="w-5 h-5 text-primary shrink-0" />
                   <p className="text-[10px] text-muted-foreground italic leading-relaxed">
                     Pengaturan Jam Masuk/Pulang, Istirahat, dan Agenda Harian akan dihitung secara cerdas untuk membatasi jumlah Jam Pelajaran (JP) yang bisa dimuat.
                   </p>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-2">
               <Card className="border-border/50 shadow-md">
                 <CardHeader className="bg-muted/5 border-b">
                   <CardTitle className="text-lg flex items-center gap-2">
                     <CalendarDays className="w-5 h-5 text-accent" /> Agenda Harian & Durasi Belajar
                   </CardTitle>
                   <CardDescription>Atur jam masuk, jam pulang, istirahat, dan agenda rutin unik setiap hari.</CardDescription>
                 </CardHeader>
                 <CardContent className="p-0">
                    <Accordion type="single" collapsible className="w-full">
                       {DAYS.map((day) => {
                          const dayActsPagi = config.globalActivities.filter(a => a.day === day && a.position !== 'end');
                          const dayActsAkhir = config.globalActivities.filter(a => a.day === day && a.position === 'end');
                          const dayBreak = config.dailyBreaks[day];
                          
                          return (
                            <AccordionItem key={day} value={day} className="border-b last:border-b-0 px-6 overflow-hidden transition-all data-[state=open]:bg-primary/5">
                               <AccordionTrigger className="hover:no-underline group py-4">
                                  <div className="flex items-center gap-4 w-full">
                                     <div className="w-2.5 h-10 bg-primary/20 rounded-full group-data-[state=open]:bg-primary transition-colors"></div>
                                     <div className="flex flex-col items-start text-left">
                                        <span className="font-bold text-lg">{day}</span>
                                        <div className="flex items-center gap-3 mt-0.5">
                                           <Badge variant="outline" className="text-[9px] font-bold tracking-widest gap-1 bg-background text-primary">
                                              MASUK: {config.dailyEntryTimes[day]}
                                           </Badge>
                                           <Badge variant="outline" className="text-[9px] font-bold tracking-widest gap-1 bg-background text-destructive">
                                              PULANG: {config.dailyDismissalTimes[day]}
                                           </Badge>
                                           <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">
                                              {dayActsPagi.length + dayActsAkhir.length} KEGIATAN
                                           </span>
                                        </div>
                                     </div>
                                  </div>
                               </AccordionTrigger>
                               <AccordionContent className="pb-8 pt-2 space-y-8 animate-in slide-in-from-top-2 duration-300">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                     {/* Jam Masuk & Pulang */}
                                     <div className="space-y-6">
                                        <div className="space-y-4">
                                           <Label className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                                              <ArrowUpToLine className="w-3.5 h-3.5" /> Jam Masuk Hari {day}
                                           </Label>
                                           <input 
                                              type="time" 
                                              className="flex h-12 w-full rounded-xl border-2 border-border bg-background px-4 py-2 text-lg font-bold outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                                              value={config.dailyEntryTimes[day]}
                                              onChange={e => {
                                                const newDaily = { ...config.dailyEntryTimes, [day]: e.target.value };
                                                handleUpdateConfig({ dailyEntryTimes: newDaily });
                                              }}
                                           />
                                        </div>
                                        <div className="space-y-4">
                                           <Label className="text-[10px] font-black uppercase tracking-widest text-destructive flex items-center gap-2">
                                              <LogOut className="w-3.5 h-3.5" /> Jam Pulang Hari {day}
                                           </Label>
                                           <input 
                                              type="time" 
                                              className="flex h-12 w-full rounded-xl border-2 border-border bg-background px-4 py-2 text-lg font-bold outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                                              value={config.dailyDismissalTimes[day]}
                                              onChange={e => {
                                                const newDaily = { ...config.dailyDismissalTimes, [day]: e.target.value };
                                                handleUpdateConfig({ dailyDismissalTimes: newDaily });
                                              }}
                                           />
                                        </div>
                                     </div>
                                     
                                     {/* Pengaturan Istirahat Harian */}
                                     <div className="space-y-6">
                                        <div className="p-5 rounded-2xl border-2 border-accent/20 bg-accent/5 space-y-5">
                                           <div className="flex items-center justify-between">
                                              <div className="flex items-center gap-2">
                                                 <Coffee className="w-4 h-4 text-accent" />
                                                 <Label className="font-bold text-sm">Istirahat Hari {day}</Label>
                                              </div>
                                              <Switch 
                                                checked={dayBreak.active} 
                                                onCheckedChange={v => {
                                                   const newBreaks = { ...config.dailyBreaks, [day]: { ...dayBreak, active: v } };
                                                   handleUpdateConfig({ dailyBreaks: newBreaks });
                                                }} 
                                              />
                                           </div>
                                           
                                           {dayBreak.active && (
                                             <div className="grid grid-cols-2 gap-4 animate-in fade-in duration-300">
                                                <div className="space-y-2">
                                                   <Label className="text-[10px] font-bold uppercase text-muted-foreground">Setelah Jam Ke-</Label>
                                                   <Select 
                                                     value={dayBreak.period.toString()} 
                                                     onValueChange={v => {
                                                       const newBreaks = { ...config.dailyBreaks, [day]: { ...dayBreak, period: parseInt(v) } };
                                                       handleUpdateConfig({ dailyBreaks: newBreaks });
                                                     }}
                                                   >
                                                      <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                                                      <SelectContent>
                                                         {[2,3,4,5,6].map(p => <SelectItem key={p} value={p.toString()}>Jam Ke-{p}</SelectItem>)}
                                                      </SelectContent>
                                                   </Select>
                                                </div>
                                                <div className="space-y-2">
                                                   <Label className="text-[10px] font-bold uppercase text-muted-foreground">Durasi (Menit)</Label>
                                                   <Input 
                                                     type="number" 
                                                     className="h-10" 
                                                     value={dayBreak.duration} 
                                                     onChange={e => {
                                                       const newBreaks = { ...config.dailyBreaks, [day]: { ...dayBreak, duration: parseInt(e.target.value) || 0 } };
                                                       handleUpdateConfig({ dailyBreaks: newBreaks });
                                                     }} 
                                                   />
                                                </div>
                                             </div>
                                           )}
                                        </div>
                                     </div>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                     {/* Kegiatan Pagi */}
                                     <div className="space-y-4">
                                        <div className="flex items-center justify-between border-b pb-2">
                                           <Label className="text-[10px] font-black uppercase tracking-widest text-amber-500 flex items-center gap-2">
                                              <ArrowUpToLine className="w-3.5 h-3.5" /> Agenda Pagi / Siang
                                           </Label>
                                           <Button variant="ghost" size="sm" onClick={() => handleAddGlobalActivity(day, 'start')} className="h-6 text-[9px] font-bold text-primary px-2 hover:bg-primary/10">
                                              + TAMBAH
                                           </Button>
                                        </div>
                                        <div className="space-y-3">
                                           {dayActsPagi.length === 0 ? (
                                              <div className="text-center py-6 border border-dashed rounded-xl text-[10px] text-muted-foreground opacity-50 uppercase font-bold tracking-widest">
                                                 Belum ada agenda pagi
                                              </div>
                                           ) : dayActsPagi.map(act => (
                                              <div key={act.id} className="p-3 bg-muted/20 border rounded-xl space-y-3 group/act relative">
                                                 <Button variant="ghost" size="icon" onClick={() => removeGlobalActivity(act.id)} className="absolute -top-1.5 -right-1.5 h-6 w-6 bg-background border shadow-sm text-destructive rounded-full opacity-0 group-hover/act:opacity-100 transition-opacity">
                                                    <X className="w-3 h-3" />
                                                 </Button>
                                                 <Input className="h-7 text-xs font-bold bg-background border-none shadow-none focus-visible:ring-0 p-0" value={act.name} onChange={e => updateGlobalActivity(act.id, 'name', e.target.value.toUpperCase())} placeholder="NAMA AGENDA" />
                                                 <div className="grid grid-cols-2 gap-2">
                                                    <div className="space-y-1">
                                                       <Label className="text-[8px] font-bold uppercase text-muted-foreground">Jam Ke-</Label>
                                                       <Select value={act.period.toString()} onValueChange={v => updateGlobalActivity(act.id, 'period', parseInt(v))}>
                                                          <SelectTrigger className="h-7 text-[10px]"><SelectValue /></SelectTrigger>
                                                          <SelectContent>{Array.from({length: 12}).map((_, i) => <SelectItem key={i+1} value={(i+1).toString()}>{i+1}</SelectItem>)}</SelectContent>
                                                       </Select>
                                                    </div>
                                                    <div className="space-y-1">
                                                       <Label className="text-[8px] font-bold uppercase text-muted-foreground">Durasi (Mnt)</Label>
                                                       <Input type="number" className="h-7 text-[10px]" value={act.duration} onChange={e => updateGlobalActivity(act.id, 'duration', parseInt(e.target.value) || 0)} />
                                                    </div>
                                                 </div>
                                              </div>
                                           ))}
                                        </div>
                                     </div>

                                     {/* Kegiatan Akhir */}
                                     <div className="space-y-4">
                                        <div className="flex items-center justify-between border-b pb-2">
                                           <Label className="text-[10px] font-black uppercase tracking-widest text-destructive flex items-center gap-2">
                                              <ArrowDownToLine className="w-3.5 h-3.5" /> Agenda Sebelum Pulang
                                           </Label>
                                           <Button variant="ghost" size="sm" onClick={() => handleAddGlobalActivity(day, 'end')} className="h-6 text-[9px] font-bold text-primary px-2 hover:bg-primary/10">
                                              + TAMBAH
                                           </Button>
                                        </div>
                                        <div className="space-y-3">
                                           {dayActsAkhir.length === 0 ? (
                                              <div className="text-center py-6 border border-dashed rounded-xl text-[10px] text-muted-foreground opacity-50 uppercase font-bold tracking-widest">
                                                 Belum ada agenda akhir
                                              </div>
                                           ) : dayActsAkhir.map(act => (
                                              <div key={act.id} className="p-3 bg-muted/20 border rounded-xl space-y-3 group/act relative">
                                                 <Button variant="ghost" size="icon" onClick={() => removeGlobalActivity(act.id)} className="absolute -top-1.5 -right-1.5 h-6 w-6 bg-background border shadow-sm text-destructive rounded-full opacity-0 group-hover/act:opacity-100 transition-opacity">
                                                    <X className="w-3 h-3" />
                                                 </Button>
                                                 <Input className="h-7 text-xs font-bold bg-background border-none shadow-none focus-visible:ring-0 p-0" value={act.name} onChange={e => updateGlobalActivity(act.id, 'name', e.target.value.toUpperCase())} placeholder="NAMA AGENDA" />
                                                 <div className="space-y-1">
                                                    <Label className="text-[8px] font-bold uppercase text-muted-foreground">Durasi Sebelum Pulang (Menit)</Label>
                                                    <Input type="number" className="h-7 text-[10px]" value={act.duration} onChange={e => updateGlobalActivity(act.id, 'duration', parseInt(e.target.value) || 0)} />
                                                 </div>
                                              </div>
                                           ))}
                                        </div>
                                     </div>
                                  </div>
                               </AccordionContent>
                            </AccordionItem>
                          )
                       })}
                    </Accordion>
                 </CardContent>
               </Card>
            </div>
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
