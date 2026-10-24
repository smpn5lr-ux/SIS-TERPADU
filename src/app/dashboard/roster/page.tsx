
"use client"

import React, { useState, useMemo, useEffect, useRef } from 'react'
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
  FileCode,
  Move
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
  [67, 97, 238], [76, 201, 240], [247, 37, 133], [114, 9, 183], [58, 12, 163],
  [255, 120, 0], [132, 204, 22], [236, 72, 153], [20, 184, 166], [153, 27, 27],
  [120, 53, 15], [34, 197, 94], [190, 24, 93], [69, 10, 10], [245, 158, 11],
  [168, 85, 247], [6, 182, 212], [249, 115, 22], [99, 102, 241], [244, 63, 94],
  [14, 165, 233], [16, 185, 129], [139, 92, 246], [30, 64, 175], [21, 128, 61],
  [219, 39, 119], [37, 99, 235], [5, 150, 105], [217, 70, 239], [234, 179, 8],
  [239, 68, 68], [10, 10, 10], [0, 153, 255], [0, 204, 153], [255, 153, 0],
  [204, 0, 204], [153, 153, 255], [255, 204, 0], [102, 255, 102], [255, 102, 102]
];

const getEntryColor = (teacherId: string, subjectId: string = "") => {
  if (!teacherId || teacherId === "-") return { bg: 'bg-slate-100', border: 'border-slate-300', text: 'text-slate-800', rgb: [241, 245, 249] };
  const seed = teacherId + subjectId;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % COLOR_PALETTE.length;
  const rgb = COLOR_PALETTE[index];
  return { bg: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`, border: 'border-white/20', text: 'text-white', rgb: rgb };
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
  const [draggedItem, setDraggedItem] = useState<{ sourceDay: string, sourcePeriod: number, sourceClassId: string, sourceEntryId: string } | null>(null)
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null)

  const [newEntry, setNewEntry] = useState<Partial<RosterEntry>>({
    day: "Senin", period: 1, teacherId: "", classId: "", subjectId: ""
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
      dailyBreaks[d] = rosterConfig?.dailyBreaks?.[d] || { active: rosterConfig?.break1Active ?? true, period: rosterConfig?.break1Period ?? 4, duration: rosterConfig?.break1Duration ?? 15 };
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
      periodStartActs.forEach(act => {
        const start = currentTime;
        currentTime = addMinutes(currentTime, act.duration);
        timeline.push({ type: 'activity', label: p.toString(), name: act.name, period: p, startTime: start, endTime: currentTime, duration: act.duration });
      });
      const lessonStart = currentTime;
      const lessonEnd = addMinutes(currentTime, config.jpDuration);
      if (lessonEnd <= effectiveDismissalLimit) {
        currentTime = lessonEnd;
        timeline.push({ type: 'lesson', label: p.toString(), period: p, startTime: lessonStart, endTime: currentTime });
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
       timeline.push({ type: 'activity', label: 'A', name: act.name, startTime: start, endTime: end, duration: act.duration, isFinal: true });
       endStartTime = end;
    });
    timeline.push({ type: 'dismissal', label: 'P', name: 'WAKTU PULANG SEKOLAH', startTime: dayDismissalTime });
    return timeline;
  };

  const workloadStats = useMemo(() => {
    if (!assignments || !classes) return []
    return assignments.map(a => {
      const cls = classes.find(c => c.id === a.classId)
      const scheduledCount = localEntries.filter(e => e.teacherId === a.teacherId && e.subjectId === a.subjectId && e.classId === a.classId).length
      return { ...a, className: cls ? cls.name : (a.className || "-"), scheduled: scheduledCount, isMet: scheduledCount >= (a.totalJP || 0), percent: Math.min(100, Math.round((scheduledCount / (a.totalJP || 1)) * 100)) }
    })
  }, [assignments, localEntries, classes])

  const handleAddEntryLocal = () => {
    const { day, period, classId, teacherId, subjectId } = newEntry;
    if (!day || !period || !classId || !teacherId || !subjectId) {
      toast({ variant: "destructive", title: "Data tidak lengkap", description: "Pilih Hari, Jam, Kelas, dan Guru/Mapel." });
      return;
    }

    const cls = classes?.find(c => c.id === classId);
    const teacher = staff?.find(s => s.id === teacherId);
    const subject = subjects?.find(s => s.id === subjectId);

    const classConflict = localEntries.find(e => e.day === day && e.period === period && e.classId === classId);
    if (classConflict) {
      toast({ variant: "destructive", title: "Bentrok Kelas", description: `Kelas ${cls?.name} sudah terisi ${classConflict.subjectName} pada jam ini.` });
      return;
    }

    const teacherConflict = localEntries.find(e => e.day === day && e.period === period && e.teacherId === teacherId);
    if (teacherConflict) {
      toast({ variant: "destructive", title: "Bentrok Guru", description: `Guru ${teacher?.fullName} sudah mengajar di kelas ${teacherConflict.className} pada jam ini.` });
      return;
    }

    const entry: RosterEntry = {
      id: `temp-${Date.now()}`,
      day,
      period,
      classId,
      className: cls?.name || "",
      teacherId,
      teacherName: teacher?.fullName || "",
      subjectId,
      subjectName: subject?.name || "",
      isActivity: false
    };

    setLocalEntries(prev => [...prev, entry]);
    setIsDirty(true);
    setIsAddOpen(false);
    toast({ title: "Penugasan Ditambahkan ke Draf" });
  };

  const handleDragStart = (e: React.DragEvent, sourceEntry: RosterEntry) => {
    setDraggedItem({
      sourceDay: sourceEntry.day,
      sourcePeriod: sourceEntry.period,
      sourceClassId: sourceEntry.classId,
      sourceEntryId: sourceEntry.id
    });
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, day: string, period: number, classId: string) => {
    e.preventDefault();
    setDragOverSlot(`${day}-${period}-${classId}`);
  };

  const handleDrop = (e: React.DragEvent, targetDay: string, targetPeriod: number, targetClassId: string) => {
    e.preventDefault();
    setDragOverSlot(null);
    if (!draggedItem) return;

    const { sourceEntryId, sourceDay, sourcePeriod, sourceClassId } = draggedItem;
    if (sourceDay === targetDay && sourcePeriod === targetPeriod && sourceClassId === targetClassId) return;

    const sourceEntry = localEntries.find(ent => ent.id === sourceEntryId);
    if (!sourceEntry) return;

    const targetEntry = localEntries.find(ent => ent.day === targetDay && ent.period === targetPeriod && ent.classId === targetClassId);

    // Conflict Check Source Guru at Target Slot
    const sourceGuruConflict = localEntries.find(ent => 
      ent.day === targetDay && 
      ent.period === targetPeriod && 
      ent.teacherId === sourceEntry.teacherId &&
      ent.id !== sourceEntry.id &&
      ent.id !== targetEntry?.id
    );

    if (sourceGuruConflict) {
      toast({ 
        variant: "destructive", 
        title: "Bentrok Guru", 
        description: `Guru ${sourceEntry.teacherName} sudah mengajar di ${sourceGuruConflict.className} pada jam tersebut.` 
      });
      return;
    }

    // Conflict Check Target Guru at Source Slot (if swapping)
    if (targetEntry) {
      const targetGuruConflict = localEntries.find(ent => 
        ent.day === sourceDay && 
        ent.period === sourcePeriod && 
        ent.teacherId === targetEntry.teacherId &&
        ent.id !== targetEntry.id &&
        ent.id !== sourceEntry.id
      );

      if (targetGuruConflict) {
        toast({ 
          variant: "destructive", 
          title: "Bentrok Guru", 
          description: `Guru ${targetEntry.teacherName} sudah mengajar di ${targetGuruConflict.className} pada jam asal.` 
        });
        return;
      }
    }

    setLocalEntries(prev => {
      let next = [...prev];
      next = next.map(ent => {
        if (ent.id === sourceEntry.id) {
          const targetCls = classes?.find(c => c.id === targetClassId);
          return { ...ent, day: targetDay, period: targetPeriod, classId: targetClassId, className: targetCls?.name || ent.className };
        }
        if (targetEntry && ent.id === targetEntry.id) {
          const sourceCls = classes?.find(c => c.id === sourceClassId);
          return { ...ent, day: sourceDay, period: sourcePeriod, classId: sourceClassId, className: sourceCls?.name || ent.className };
        }
        return ent;
      });
      return next;
    });

    setIsDirty(true);
    setDraggedItem(null);
    toast({ title: targetEntry ? "Jadwal Ditukar" : "Jadwal Dipindahkan" });
  };

  const handleAutoGenerate = () => {
    if (!assignments || !classes) return;
    setIsDirty(true);
    let currentRoster = [...localEntries];
    const sortedAssignments = [...assignments].sort((a, b) => (b.totalJP || 0) - (a.totalJP || 0));
    sortedAssignments.forEach(asg => {
      const scheduledCount = currentRoster.filter(e => e.teacherId === asg.teacherId && e.subjectId === asg.subjectId && e.classId === asg.classId).length;
      let remainingJP = (asg.totalJP || 0) - scheduledCount;
      if (remainingJP <= 0) return;
      const shuffledDays = [...DAYS].sort(() => Math.random() - 0.5);
      for (const day of shuffledDays) {
        if (remainingJP < 2) break;
        const dayTimeline = generateDayTimeline(day);
        const lessonPeriods = dayTimeline.filter(row => row.type === 'lesson').map(row => row.period);
        for (let i = 0; i < lessonPeriods.length - 1; i++) {
          if (remainingJP < 2) break;
          const p1 = lessonPeriods[i];
          const p2 = lessonPeriods[i+1];
          if (p2 !== p1 + 1) continue;
          const isClassFree1 = !currentRoster.find(e => e.day === day && e.period === p1 && e.classId === asg.classId);
          const isTeacherFree1 = !currentRoster.find(e => e.day === day && e.period === p1 && e.teacherId === asg.teacherId);
          const isClassFree2 = !currentRoster.find(e => e.day === day && e.period === p2 && e.classId === asg.classId);
          const isTeacherFree2 = !currentRoster.find(e => e.day === day && e.period === p2 && e.teacherId === asg.teacherId);
          if (isClassFree1 && isTeacherFree1 && isClassFree2 && isTeacherFree2) {
            currentRoster.push({ id: `temp-${Date.now()}-${Math.random()}`, day, period: p1, classId: asg.classId, className: asg.className, teacherId: asg.teacherId, teacherName: asg.teacherName, subjectId: asg.subjectId, subjectName: asg.subjectName, isActivity: false });
            currentRoster.push({ id: `temp-${Date.now()}-${Math.random()}`, day, period: p2, classId: asg.classId, className: asg.className, teacherId: asg.teacherId, teacherName: asg.teacherName, subjectId: asg.subjectId, subjectName: asg.subjectName, isActivity: false });
            remainingJP -= 2;
          }
        }
      }
      if (remainingJP > 0) {
        for (const day of shuffledDays) {
          if (remainingJP <= 0) break;
          const dayTimeline = generateDayTimeline(day);
          const lessonPeriods = dayTimeline.filter(row => row.type === 'lesson').map(row => row.period);
          for (const p of lessonPeriods) {
            if (remainingJP <= 0) break;
            const isSlotFree = !currentRoster.find(e => e.day === day && e.period === p && e.classId === asg.classId);
            const isTeacherFree = !currentRoster.find(e => e.day === day && e.period === p && e.teacherId === asg.teacherId);
            if (isSlotFree && isTeacherFree) {
              currentRoster.push({ id: `temp-${Date.now()}-${Math.random()}`, day, period: p, classId: asg.classId, className: asg.className, teacherId: asg.teacherId, teacherName: asg.teacherName, subjectId: asg.subjectId, subjectName: asg.subjectName, isActivity: false });
              remainingJP--;
            }
          }
        }
      }
    });
    setLocalEntries(currentRoster);
    toast({ title: "Penjadwalan Otomatis Selesai" });
  };

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
                const colorInfo = getEntryColor(entry.teacherId || "", entry.subjectId || "");
                tableRow.push({ content: `${entry.subjectName || "-"}\n(${entry.teacherName || "-"})`, styles: { fillColor: colorInfo.rgb, textColor: [255, 255, 255], fontSize: 6, fontStyle: 'bold' } });
              } else { tableRow.push(""); }
            });
          } else {
            const label = row.type === 'break' ? `ISTIRAHAT (${row.duration} MENIT)` : row.type === 'dismissal' ? "WAKTU PULANG SEKOLAH" : `${row.name.toUpperCase()} (${row.duration} MENIT)`;
            const bg = row.type === 'break' ? [230, 230, 230] : row.type === 'dismissal' ? [255, 220, 220] : (row.isFinal ? [255, 230, 230] : [255, 248, 230]);
            tableRow.push({ content: label, colSpan: sorted.length, styles: { fillColor: bg, fontStyle: 'bold', halign: 'center', textColor: [0, 0, 0] } });
          }
          tableBody.push(tableRow);
        });
      });
      autoTable(doc, { head: tableHead, body: tableBody, startY: 45, theme: 'grid', styles: { fontSize: 6, cellPadding: 1, halign: 'center', valign: 'middle', textColor: [0,0,0], lineColor: [0,0,0] }, headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontSize: 7, fontStyle: 'bold', lineWidth: 0.1 }, columnStyles: { 0: { cellWidth: 15 }, 1: { cellWidth: 8 }, 2: { cellWidth: 18 } } });
      doc.save(`Roster_Matriks_Terintegrasi.pdf`);
    } catch (e) { toast({ variant: "destructive", title: "Gagal unduh" }); } finally { setIsExporting(false); }
  };

  const handleDownloadCoded = async () => {
    if (!localEntries || !classes || !staff) return;
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

      const assignmentPairs: { teacherId: string, teacherName: string, subjectId: string, subjectName: string, key: string }[] = [];
      localEntries.forEach(e => {
        if (e.teacherId && e.subjectId && !e.isActivity) {
          const key = `${e.teacherId}|${e.subjectId}`;
          if (!assignmentPairs.find(p => p.key === key)) {
            assignmentPairs.push({ teacherId: e.teacherId, teacherName: e.teacherName || "-", subjectId: e.subjectId, subjectName: e.subjectName || "-", key });
          }
        }
      });
      assignmentPairs.sort((a, b) => {
        const sA = staff.find(s => s.id === a.teacherId);
        const sB = staff.find(s => s.id === b.teacherId);
        return (sA?.staffNumber || 999) - (sB?.staffNumber || 999);
      });

      const assignmentMap = new Map<string, { code: string, rgb: number[] }>();
      assignmentPairs.forEach((p) => {
        const sm = staff.find(s => s.id === p.teacherId);
        const code = sm?.staffNumber?.toString() || "?";
        assignmentMap.set(p.key, { code, rgb: getEntryColor(p.teacherId, p.subjectId).rgb });
      });

      const teacherGroups = new Map<string, { name: string, assignments: typeof assignmentPairs }>();
      assignmentPairs.forEach(p => {
        const g = teacherGroups.get(p.teacherId) || { name: p.teacherName, assignments: [] };
        g.assignments.push(p);
        teacherGroups.set(p.teacherId, g);
      });

      const sortedT = Array.from(teacherGroups.values()).sort((a,b) => {
        const sA = staff.find(s => s.fullName === a.name);
        const sB = staff.find(s => s.fullName === b.name);
        return (sA?.staffNumber || 999) - (sB?.staffNumber || 999);
      });

      const drawLegend = (doc: any) => {
        const startX = 235;
        let startY = 32;
        doc.setFontSize(8).setFont("helvetica", "bold").setTextColor(0).text("INDEKS GURU & MAPEL", startX, startY - 4);
        sortedT.forEach((group) => {
          const rowH = group.assignments.length > 1 ? 11 : 8;
          if (startY + rowH > 195) { doc.addPage(); startY = 20; }
          const bs = 6;
          if (group.assignments.length === 1) {
            const m = assignmentMap.get(group.assignments[0].key)!;
            doc.setDrawColor(0).setLineWidth(0.05).setFillColor(m.rgb[0], m.rgb[1], m.rgb[2]).rect(startX, startY, bs, bs, 'F');
            doc.rect(startX, startY, bs, bs);
            doc.setFontSize(7).setFont("helvetica", "bold").setTextColor(255, 255, 255).text(m.code, startX + bs/2, startY + 4.2, { align: "center" });
          } else {
            const m1 = assignmentMap.get(group.assignments[0].key)!;
            const m2 = assignmentMap.get(group.assignments[1].key)!;
            doc.setFillColor(m1.rgb[0], m1.rgb[1], m1.rgb[2]);
            doc.triangle(startX, startY + bs, startX + bs, startY + bs, startX + bs, startY, 'F');
            doc.setFillColor(m2.rgb[0], m2.rgb[1], m2.rgb[2]);
            doc.triangle(startX, startY, startX + bs, startY, startX, startY + bs, 'F');
            doc.setDrawColor(0).setLineWidth(0.05).rect(startX, startY, bs, bs);
            doc.line(startX, startY + bs, startX + bs, startY);
            doc.setFontSize(5).setFont("helvetica", "bold").setTextColor(255, 255, 255).text(`${m2.code}`, startX + 1.5, startY + 2.5, { align: "center" });
            doc.text(`${m1.code}`, startX + bs - 1.5, startY + bs - 1, { align: "center" });
          }
          doc.setFontSize(7).setFont("helvetica", "bold").setTextColor(50).text(group.name.toUpperCase(), startX + bs + 2, startY + 2.5);
          doc.setFontSize(6).setFont("helvetica", "normal").setTextColor(100).text(group.assignments.map(a => a.subjectName).join(", "), startX + bs + 2, startY + 5.5);
          startY += rowH;
        });
      };

      const sortedC = [...classes].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      const tableHead = [['HARI', 'JAM', 'WAKTU', ...sortedC.map(c => c.name)]];
      const tableBody: any[] = [];
      DAYS.forEach(day => {
        const dayTimeline = generateDayTimeline(day);
        let dayCellAdded = false;
        dayTimeline.forEach(row => {
          const tableRow: any[] = [];
          if (!dayCellAdded) { tableRow.push({ content: day, rowSpan: dayTimeline.length, styles: { fontStyle: 'bold', valign: 'middle', halign: 'center' } }); dayCellAdded = true; }
          tableRow.push(row.label);
          tableRow.push(format(row.startTime, 'HH:mm') + (row.type !== 'dismissal' ? ` - ${format(row.endTime, 'HH:mm')}` : ''));
          if (row.type === 'lesson') {
            sortedC.forEach(cls => {
              const e = localEntries.find(e => e.day === day && e.period === row.period && e.classId === cls.id);
              if (e && e.teacherId && e.subjectId) {
                const m = assignmentMap.get(`${e.teacherId}|${e.subjectId}`);
                if (m) tableRow.push({ content: m.code, styles: { fillColor: m.rgb, textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold', halign: 'center' } });
                else tableRow.push("");
              } else tableRow.push("");
            });
          } else {
            const bg = row.type === 'break' ? [230, 230, 230] : row.type === 'dismissal' ? [255, 220, 220] : (row.isFinal ? [255, 230, 230] : [255, 248, 230]);
            tableRow.push({ content: row.name.toUpperCase(), colSpan: sortedC.length, styles: { fillColor: bg, fontStyle: 'bold', halign: 'center', textColor: [0, 0, 0], fontSize: 7 } });
          }
          tableBody.push(tableRow);
        });
      });

      autoTable(doc, {
        head: tableHead, body: tableBody, startY: 32, theme: 'grid',
        styles: { fontSize: 7, cellPadding: 1, halign: 'center', valign: 'middle', textColor: [0,0,0], lineColor: [0,0,0] },
        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.1 },
        margin: { right: 68 },
        didDrawPage: (data) => {
          doc.setFontSize(10).setFont("helvetica", "bold").setTextColor(0);
          doc.text(govName, 148.5, 10, { align: "center" });
          doc.text(dinasName, 148.5, 15, { align: "center" });
          doc.setFontSize(12).text(schoolName, 148.5, 21, { align: "center" });
          doc.setFontSize(9).text(`JADWAL PELAJARAN TAHUN PELAJARAN ${academicYear}`, 148.5, 26, { align: "center" });
          doc.line(14, 28, 283, 28);
          drawLegend(doc);
        }
      });

      doc.save(`Roster_Model_Kode.pdf`);
    } catch (e) { toast({ variant: "destructive", title: "Gagal unduh" }); } finally { setIsExportingCoded(false); }
  };

  if (loadingR || loadingConfigDoc || loadingClasses) return <div className="flex justify-center py-24"><Loader2 className="animate-spin text-primary" /></div>
  const totalNeededJP = workloadStats.reduce((sum, w) => sum + (w.totalJP || 0), 0);
  const totalScheduledJP = workloadStats.reduce((sum, w) => sum + w.scheduled, 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Manajemen Roster</h1>
          <div className="flex items-center gap-2 mt-1">
             <p className="text-muted-foreground text-sm font-medium">Pengaturan terpadu jadwal mengajar & agenda rutin sekolah.</p>
             {isDirty ? (<Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse gap-1"><CloudOff className="w-3 h-3" /> Belum Sinkron</Badge>) : (<Badge className="bg-green-500/10 text-green-500 border-green-500/20 gap-1"><CheckCircle2 className="w-3 h-3" /> Tersinkron</Badge>)}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isDirty && (<Button onClick={handleSyncToCloud} disabled={isSyncingToCloud} className="bg-green-600 hover:bg-green-700 shadow-lg shadow-green-500/20 gap-2">{isSyncingToCloud ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}Simpan Cloud</Button>)}
          <Button variant="outline" onClick={handleDownloadUnified} disabled={isExporting} className="gap-2 border-primary/30"><Printer className="w-4 h-4" /> Cetak Matriks</Button>
          <Button variant="outline" onClick={handleDownloadCoded} disabled={isExportingCoded} className="gap-2 border-accent/30 text-accent"><FileCode className="w-4 h-4" /> Cetak Model Kode</Button>
          <Button variant="secondary" onClick={handleAutoGenerate} className="gap-2 text-primary border-primary/20 hover:bg-primary/10"><Zap className="w-4 h-4" /> Distribusi Otomatis JP</Button>
          <Button onClick={() => setIsAddOpen(true)} className="gap-2 shadow-lg shadow-primary/20"><Plus className="w-4 h-4" /> Plot Mapel</Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50 border p-1 mb-6"><TabsTrigger value="builder" className="gap-2"><LayoutGrid className="w-4 h-4" /> Matriks Mingguan</TabsTrigger><TabsTrigger value="settings" className="gap-2"><Settings2 className="w-4 h-4" /> Konfigurasi Waktu</TabsTrigger></TabsList>
        <TabsContent value="builder" className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <Card className="border-border/50 bg-primary/5">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-bold flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-primary" /> Beban JP ({totalScheduledJP}/{totalNeededJP})</CardTitle></CardHeader>
              <CardContent className="space-y-4 pt-2">
                <ScrollArea className="h-[500px] pr-2">
                  {workloadStats.map((w, idx) => (
                    <div key={idx} className="mb-4 space-y-1.5">
                      <div className="flex justify-between items-end"><div className="flex flex-col"><span className="text-[10px] font-bold text-primary truncate max-w-[120px]">{w.teacherName || "-"}</span><span className="text-[9px] text-muted-foreground">{(w.subjectName || "-")} ({w.className})</span></div><span className={`text-[10px] font-bold ${w.isMet ? 'text-green-500' : 'text-foreground'}`}>{w.scheduled} / {w.totalJP || 0} JP</span></div>
                      <Progress value={w.percent} className={`h-1.5 ${w.isMet ? 'bg-green-500/20' : 'bg-amber-500/20'}`} />
                    </div>
                  ))}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
          <div className="lg:col-span-3">
             <div className="w-full overflow-x-auto bg-card/30 border border-border/50 rounded-xl shadow-md">
               <div className="min-w-[1000px]">
                 <Table className="border-collapse w-full">
                   <TableHeader><TableRow className="bg-muted/30"><TableHead className="w-20 border-r font-bold text-center text-primary text-[10px]">HARI</TableHead><TableHead className="w-12 border-r font-bold text-center text-primary text-[10px]">JAM</TableHead><TableHead className="w-24 border-r font-bold text-center text-primary text-[10px]">WAKTU</TableHead>{sortedClasses.map(cls => (<TableHead key={cls.id} className="text-center min-w-[140px] font-bold border-r text-[11px] uppercase py-3">{cls.name}</TableHead>))}</TableRow></TableHeader>
                   <TableBody>{DAYS.map((day) => {
                       const dayTimeline = generateDayTimeline(day);
                       let dayCellAdded = false;
                       return dayTimeline.map((row, rowIdx) => (
                         <TableRow key={`${day}-${rowIdx}`} className="hover:bg-transparent">{!dayCellAdded && (<TableCell rowSpan={dayTimeline.length} className="border-r font-bold text-center bg-muted/5 p-0"><div className="rotate-[-90deg] whitespace-nowrap text-xs text-primary font-black uppercase tracking-[0.2em]">{day}</div>{(dayCellAdded = true) && null}</TableCell>)}<TableCell className="border-r font-bold text-[10px] text-center p-2">{row.label}</TableCell><TableCell className="border-r text-[9px] text-center p-1 text-muted-foreground whitespace-nowrap">{format(row.startTime, 'HH:mm')} {row.type !== 'dismissal' && ` - ${format(row.endTime, 'HH:mm')}`}</TableCell>
                           {row.type === 'lesson' ? (sortedClasses.map(cls => {
                               const entry = localEntries.find(e => e.day === day && e.period === row.period && e.classId === cls.id);
                               const ci = getEntryColor(entry?.teacherId || "", entry?.subjectId || "");
                               const isOver = dragOverSlot === `${day}-${row.period}-${cls.id}`;
                               return (
                                 <TableCell 
                                   key={cls.id} 
                                   className={`p-1 border-r h-28 group relative transition-colors ${isOver ? 'bg-primary/20 ring-2 ring-primary/40 ring-inset' : ''}`}
                                   onDragOver={(e) => handleDragOver(e, day, row.period, cls.id)}
                                   onDrop={(e) => handleDrop(e, day, row.period, cls.id)}
                                   onDragLeave={() => setDragOverSlot(null)}
                                 >
                                    {entry ? (
                                      <div 
                                        draggable={true}
                                        onDragStart={(e) => handleDragStart(e, entry)}
                                        className={`h-full border-2 rounded-xl p-3 flex flex-col justify-center text-center transition-all shadow-md active:scale-95 active:rotate-1 cursor-grab active:cursor-grabbing ${ci.border} hover:brightness-110`} 
                                        style={{ backgroundColor: ci.bg }}
                                      >
                                        <div className={`text-[10px] font-black leading-tight uppercase tracking-tight ${ci.text}`}>{entry.subjectName || "-"}</div>
                                        <div className="text-[9px] text-white/80 mt-1.5 font-bold italic line-clamp-2 leading-tight">({entry.teacherName || "-"})</div>
                                        
                                        <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-40 transition-opacity">
                                           <Move className="w-3 h-3 text-white" />
                                        </div>

                                        <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 text-white hover:bg-white/10 rounded-full" onClick={(e) => { e.stopPropagation(); handleDeleteTrigger(entry.id); }}>
                                           <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                      </div>
                                    ) : (
                                      <div 
                                        className="h-full flex flex-col items-center justify-center border border-dashed border-border/20 rounded-xl group-hover:border-primary/40 cursor-pointer bg-muted/5 hover:bg-primary/5 transition-all" 
                                        onClick={() => { setNewEntry({...newEntry, day, period: row.period, classId: cls.id}); setIsAddOpen(true); }}
                                      >
                                        <Plus className="w-4 h-4 text-muted-foreground opacity-10 group-hover:opacity-40" />
                                        <span className="text-[8px] text-muted-foreground font-bold mt-1 opacity-0 group-hover:opacity-40">KOSONG</span>
                                      </div>
                                    )}
                                 </TableCell>
                               );
                             })) : (<TableCell colSpan={sortedClasses.length} className="p-0 border-r border-y"><div className={`h-12 flex items-center justify-center font-black text-[11px] tracking-[0.4em] uppercase ${row.type === 'activity' ? 'text-amber-700' : row.type === 'break' ? 'text-accent' : 'text-destructive'}`}>{row.name} {row.duration && `(${row.duration} MENIT)`}</div></TableCell>)}
                         </TableRow>
                       ));
                     })}</TableBody>
                 </Table>
               </div>
             </div>
          </div>
        </TabsContent>
        <TabsContent value="settings" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-6">
              <Card className="border-border/50"><CardHeader className="border-b bg-muted/5"><CardTitle className="text-lg flex items-center gap-2"><Clock className="w-5 h-5 text-primary" /> Aturan Dasar</CardTitle></CardHeader><CardContent className="pt-6 space-y-6"><div className="space-y-2"><Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Jam Masuk Default</Label><input type="time" className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" value={config.entryTime || "07:15"} onChange={e => handleUpdateConfig({ entryTime: e.target.value })} /></div><div className="space-y-2"><Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Durasi 1 JP (Menit)</Label><Input type="number" className="h-11" value={config.jpDuration || 40} onChange={e => handleUpdateConfig({ jpDuration: parseInt(e.target.value) || 0 })} /></div></CardContent></Card>
            </div>
            <div className="lg:col-span-2">
               <Card className="border-border/50 shadow-md"><CardHeader className="bg-muted/5 border-b"><CardTitle className="text-lg flex items-center gap-2"><CalendarDays className="w-5 h-5 text-accent" /> Agenda Harian & Durasi Belajar</CardTitle></CardHeader><CardContent className="p-0"><Accordion type="single" collapsible className="w-full">{DAYS.map((day) => { const dayBreak = config.dailyBreaks[day]; return (<AccordionItem key={day} value={day} className="border-b last:border-b-0 px-6 data-[state=open]:bg-primary/5"><AccordionTrigger className="hover:no-underline py-4"><div className="flex items-center gap-4 w-full"><div className="w-2.5 h-10 bg-primary/20 rounded-full group-data-[state=open]:bg-primary"></div><div className="flex flex-col items-start text-left"><span className="font-bold text-lg">{day}</span><div className="flex items-center gap-3 mt-0.5"><Badge variant="outline" className="text-[9px] font-bold bg-background text-primary">MASUK: {config.dailyEntryTimes[day]}</Badge><Badge variant="outline" className="text-[9px] font-bold bg-background text-destructive">PULANG: {config.dailyDismissalTimes[day]}</Badge></div></div></div></AccordionTrigger><AccordionContent className="pb-8 pt-2 space-y-8"><div className="grid grid-cols-1 md:grid-cols-2 gap-8"><div className="space-y-6"><div className="space-y-4"><Label className="text-[10px] font-black uppercase text-primary">Jam Masuk</Label><input type="time" className="flex h-12 w-full rounded-xl border-2 bg-background px-4 py-2 text-lg font-bold" value={config.dailyEntryTimes[day]} onChange={e => { const newDaily = { ...config.dailyEntryTimes, [day]: e.target.value }; handleUpdateConfig({ dailyEntryTimes: newDaily }); }} /></div><div className="space-y-4"><Label className="text-[10px] font-black uppercase text-destructive">Jam Pulang</Label><input type="time" className="flex h-12 w-full rounded-xl border-2 bg-background px-4 py-2 text-lg font-bold" value={config.dailyDismissalTimes[day]} onChange={e => { const newDaily = { ...config.dailyDismissalTimes, [day]: e.target.value }; handleUpdateConfig({ dailyDismissalTimes: newDaily }); }} /></div></div><div className="space-y-6"><div className="p-5 rounded-2xl border-2 border-accent/20 bg-accent/5 space-y-5"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Coffee className="w-4 h-4 text-accent" /><Label className="font-bold text-sm">Istirahat</Label></div><Switch checked={dayBreak.active} onCheckedChange={v => { const newBreaks = { ...config.dailyBreaks, [day]: { ...dayBreak, active: v } }; handleUpdateConfig({ dailyBreaks: newBreaks }); }} /></div>{dayBreak.active && (<div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label className="text-[10px] font-bold uppercase">Setelah Jam Ke-</Label><Select value={dayBreak.period.toString()} onValueChange={v => { const newBreaks = { ...config.dailyBreaks, [day]: { ...dayBreak, period: parseInt(v) } }; handleUpdateConfig({ dailyBreaks: newBreaks }); }}><SelectTrigger className="h-10"><SelectValue /></SelectTrigger><SelectContent>{[2,3,4,5,6].map(p => <SelectItem key={p} value={p.toString()}>Jam Ke-{p}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label className="text-[10px] font-bold uppercase">Durasi (Menit)</Label><Input type="number" className="h-10" value={dayBreak.duration} onChange={e => { const newBreaks = { ...config.dailyBreaks, [day]: { ...dayBreak, duration: parseInt(e.target.value) || 0 } }; handleUpdateConfig({ dailyBreaks: newBreaks }); }} /></div></div>)}</div></div></div></AccordionContent></AccordionItem>) })}</Accordion></CardContent></Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Plot Mata Pelajaran</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Hari</Label>
                <Select value={newEntry.day || "Senin"} onValueChange={v => setNewEntry({...newEntry, day: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DAYS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Jam Ke-</Label>
                <Select value={newEntry.period?.toString() || "1"} onValueChange={v => setNewEntry({...newEntry, period: parseInt(v)})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Array.from({length: config.maxPeriods}).map((_, i) => <SelectItem key={i+1} value={(i+1).toString()}>{i+1}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Pilih Kelas</Label>
                <Select value={newEntry.classId} onValueChange={v => setNewEntry({...newEntry, classId: v})}>
                  <SelectTrigger><SelectValue placeholder="Pilih Kelas" /></SelectTrigger>
                  <SelectContent>{sortedClasses.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Pilih Penugasan Guru</Label>
                <Select value={newEntry.teacherId && newEntry.subjectId ? `${newEntry.teacherId}|${newEntry.subjectId}` : ""} onValueChange={v => { const [tId, sId] = v.split('|'); setNewEntry({...newEntry, teacherId: tId, subjectId: sId}); }}>
                  <SelectTrigger><SelectValue placeholder="Pilih Guru & Mapel" /></SelectTrigger>
                  <SelectContent>{assignments?.filter(a => a.classId === newEntry.classId).map(a => (<SelectItem key={a.id} value={`${a.teacherId}|${a.subjectId}`}>{a.teacherName} - {a.subjectName}</SelectItem>))}</SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleAddEntryLocal} className="w-full h-11 font-bold shadow-lg shadow-primary/20">Tambahkan ke Buffer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle className="flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-destructive" /> Hapus Jadwal?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={executeDeleteLocal} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Ya, Hapus Sekarang</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
