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
  Printer
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
import { addMinutes, format, parse } from 'date-fns'
import { ScrollArea } from '@/components/ui/scroll-area'

const DAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"]
const MAX_PERIODS = 10 

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

  const getClassName = (classId: string, defaultName: string) => {
    const cls = classes?.find(c => c.id === classId)
    return cls ? cls.name : defaultName
  }

  const getTimeForPeriod = (period: number) => {
    let current = parse(config.entryTime, 'HH:mm', new Date())
    for (let i = 1; i < period; i++) {
      current = addMinutes(current, config.jpDuration)
      if (config.break1Active && i === config.break1Period) current = addMinutes(current, config.break1Duration)
      if (config.break2Active && i === config.break2Period) current = addMinutes(current, config.break2Duration)
    }
    const end = addMinutes(current, config.jpDuration)
    return `${format(current, 'HH:mm')} - ${format(end, 'HH:mm')}`
  }

  const getBreakTime = (afterPeriod: number, duration: number) => {
    let current = parse(config.entryTime, 'HH:mm', new Date())
    for (let i = 1; i < afterPeriod; i++) {
      current = addMinutes(current, config.jpDuration)
      if (config.break1Active && i === config.break1Period) current = addMinutes(current, config.break1Duration)
      if (config.break2Active && i === config.break2Period) current = addMinutes(current, config.break2Duration)
    }
    const start = addMinutes(current, config.jpDuration)
    const end = addMinutes(start, duration)
    return `${format(start, 'HH:mm')} - ${format(end, 'HH:mm')}`
  }

  const workloadStats = useMemo(() => {
    if (!assignments || !classes) return []
    return assignments.map(a => {
      const displayClassName = getClassName(a.classId, a.className)
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

  const handleAddEntryLocal = () => {
    const t = staff?.find(s => s.id === newEntry.teacherId)
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
      
      doc.setFont("helvetica", "bold").setFontSize(11).text("MATRIKS JADWAL PELAJARAN TERPADU", 148.5, 40, { align: "center" });
      
      const sorted = [...classes].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      const tableHead = [['HARI', 'JAM', 'WAKTU', ...sorted.map(c => c.name)]];
      
      const tableBody: any[] = [];
      DAYS.forEach(day => {
        let rowsAddedForDay = 0;
        for (let p = 1; p <= MAX_PERIODS; p++) {
          const lessonRow: any[] = [p === 1 ? day : "", p, getTimeForPeriod(p)];
          sorted.forEach(cls => {
            const entry = localEntries.find(e => e.day === day && e.period === p && e.classId === cls.id);
            if (entry) {
              if (entry.isActivity) lessonRow.push(entry.activityName || "REHAT");
              else lessonRow.push(entry.subjectName || "");
            } else {
              lessonRow.push("");
            }
          });
          tableBody.push(lessonRow);
          rowsAddedForDay++;

          const checkAndInject = (period: number, active: boolean, label: string, duration: number) => {
            if (active && p === period) {
              const breakRow: any[] = ["", "B", getBreakTime(period, duration)];
              sorted.forEach(() => breakRow.push(label));
              tableBody.push(breakRow);
              rowsAddedForDay++;
            }
          }
          checkAndInject(config.break1Period, config.break1Active, "ISTIRAHAT 1", config.break1Duration);
          checkAndInject(config.break2Period, config.break2Active, "ISTIRAHAT 2", config.break2Duration);
        }
        (day as any)._rows = rowsAddedForDay;
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
              const dayIndex = DAYS.findIndex(d => d === data.cell.text[0]);
              if (dayIndex !== -1) {
                let totalRowsBefore = 0;
                for(let i=0; i<dayIndex; i++) {
                   totalRowsBefore += (10 + (config.break1Active ? 1 : 0) + (config.break2Active ? 1 : 0));
                }
                if (data.row.index === totalRowsBefore) {
                  data.cell.rowSpan = 10 + (config.break1Active ? 1 : 0) + (config.break2Active ? 1 : 0);
                  data.cell.styles.fontStyle = 'bold';
                }
              }
            }
            if (data.row.raw[1] === 'B') {
              data.cell.styles.fillColor = [245, 245, 245];
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.textColor = [100, 100, 100];
            }
          }
        },
      });

      doc.save(`Roster_Matriks_${schoolName.replace(/\s+/g, '_')}.pdf`);
      toast({ title: "Berhasil Mengunduh PDF" });
    } catch (e) {
      toast({ variant: "destructive", title: "Gagal unduh" });
    } finally {
      setIsExporting(false);
    }
  };

  const getEntry = (day: string, period: number, classId: string) => {
    return localEntries.find(e => e.day === day && e.period === period && e.classId === classId)
  }

  if (loadingR || loadingConfigDoc || loadingClasses) return <div className="flex justify-center py-24"><Loader2 className="animate-spin text-primary" /></div>

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Manajemen Roster</h1>
          <div className="flex items-center gap-2 mt-1">
             <p className="text-muted-foreground">Plotting jadwal mengajar terpusat.</p>
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
          <Button onClick={() => setIsAddOpen(true)} className="gap-2 shadow-lg shadow-primary/20"><Plus className="w-4 h-4" /> Plot Manual</Button>
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
                        <div className="flex flex-col"><span className="text-[10px] font-bold text-primary truncate max-w-[120px]">{w.teacherName}</span><span className="text-[9px] text-muted-foreground">{w.subjectName} ({w.className})</span></div>
                        <span className="text-[10px] font-bold">{w.scheduled} / {w.totalJP || 0} JP</span>
                      </div>
                      <Progress value={w.percent} className={`h-1.5 ${w.isMet ? 'bg-green-500/20' : 'bg-amber-500/20'}`} />
                    </div>
                  ))}
                </ScrollArea>
              </CardContent>
            </Card>
            <div className="bg-accent/5 p-4 rounded-xl border border-accent/20 flex gap-3">
              <Info className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              <p className="text-[10px] text-muted-foreground italic">Jam istirahat berlaku otomatis untuk semua kelas pada slot yang dikonfigurasi.</p>
            </div>
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
                       const rows = [];
                       const breakCount = (config.break1Active ? 1 : 0) + (config.break2Active ? 1 : 0);
                       const dayRows = 10 + breakCount;
                       for (let p = 1; p <= MAX_PERIODS; p++) {
                         rows.push(
                           <TableRow key={`${day}-${p}`} className="hover:bg-transparent">
                             {p === 1 && (
                               <TableCell rowSpan={dayRows} className="border-r font-bold text-center bg-muted/5 p-0">
                                 <div className="rotate-[-90deg] whitespace-nowrap text-xs text-primary font-black uppercase tracking-[0.2em]">{day}</div>
                               </TableCell>
                             )}
                             <TableCell className="border-r font-bold text-[10px] text-center p-2">{p}</TableCell>
                             <TableCell className="border-r text-[9px] text-center p-1 text-muted-foreground whitespace-nowrap">{getTimeForPeriod(p)}</TableCell>
                             {sortedClasses.map(cls => {
                               const entry = getEntry(day, p, cls.id);
                               const isTemp = entry?.id.startsWith('temp-');
                               return (
                                 <TableCell key={cls.id} className="p-1 border-r last:border-r-0 h-24 group relative">
                                   {entry ? (
                                     <div className={`h-full border rounded-lg p-2.5 flex flex-col justify-center transition-all shadow-sm ${entry.isActivity ? 'bg-amber-500/10 border-amber-500/20' : 'bg-primary/10 border-primary/20'} ${isTemp ? 'border-dashed border-2 border-amber-500/30' : ''}`}>
                                       <div className="text-[9px] font-black truncate uppercase leading-tight">{entry.isActivity ? (entry.activityName || "REHAT") : entry.subjectName}</div>
                                       {!entry.isActivity && <div className="text-[8px] text-muted-foreground truncate mt-1 italic font-medium">{entry.teacherName}</div>}
                                       <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive hover:bg-destructive/10 rounded-full" onClick={() => { setEntryToDeleteId(entry.id); setIsDeleteDialogOpen(true); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                                     </div>
                                   ) : (
                                     <div className="h-full flex flex-col items-center justify-center border border-dashed border-border/20 rounded-lg group-hover:border-primary/40 cursor-pointer bg-muted/2" onClick={() => { setNewEntry({...newEntry, day, period: p, classId: cls.id}); setIsAddOpen(true); }}><Plus className="w-4 h-4 text-muted-foreground opacity-10 group-hover:opacity-30" /></div>
                                   )}
                                 </TableCell>
                               );
                             })}
                           </TableRow>
                         );
                         const checkInject = (period: number, active: boolean, label: string, duration: number) => {
                           if (active && p === period) {
                             rows.push(
                               <TableRow key={`${day}-break-${period}`} className="bg-accent/5">
                                 <TableCell className="border-r font-bold text-[10px] text-center p-2 text-accent">B</TableCell>
                                 <TableCell className="border-r text-[9px] text-center p-1 text-muted-foreground whitespace-nowrap">{getBreakTime(period, duration)}</TableCell>
                                 <TableCell colSpan={sortedClasses.length} className="p-0 border-r last:border-r-0 border-y border-accent/10">
                                   <div className="h-10 flex items-center justify-center text-accent font-black text-[10px] tracking-[0.6em] uppercase">{label}</div>
                                 </TableCell>
                               </TableRow>
                             );
                           }
                         }
                         checkInject(config.break1Period, config.break1Active, "ISTIRAHAT 1", config.break1Duration);
                         checkInject(config.break2Period, config.break2Active, "ISTIRAHAT 2", config.break2Duration);
                       }
                       return rows;
                     })}
                   </TableBody>
                 </Table>
               </ScrollArea>
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
                    if (configRef) setDoc(configRef, { ...config, entryTime: e.target.value }, { merge: true }).catch(() => {})
                  }} />
                </div>
                <div className="space-y-2">
                  <Label>Durasi 1 JP (Menit)</Label>
                  <Input type="number" value={config.jpDuration || 0} onChange={e => {
                    if (configRef) setDoc(configRef, { ...config, jpDuration: parseInt(e.target.value) || 0 }, { merge: true }).catch(() => {})
                  }} />
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader className="border-b bg-muted/5"><CardTitle className="text-lg flex items-center gap-2"><Coffee className="w-5 h-5 text-accent" /> Istirahat Global</CardTitle></CardHeader>
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
                          <SelectContent><SelectItem value="2">Jam Ke-2</SelectItem><SelectItem value="3">Jam Ke-3</SelectItem><SelectItem value="4">Jam Ke-4</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2"><Label className="text-[10px] uppercase">Durasi (Menit)</Label><Input type="number" value={config.break1Duration || 0} onChange={e => {
                        if (configRef) setDoc(configRef, { ...config, break1Duration: parseInt(e.target.value) || 0 }, { merge: true }).catch(() => {})
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
                          <SelectContent><SelectItem value="6">Jam Ke-6</SelectItem><SelectItem value="7">Jam Ke-7</SelectItem><SelectItem value="8">Jam Ke-8</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2"><Label className="text-[10px] uppercase">Durasi (Menit)</Label><Input type="number" value={config.break2Duration || 0} onChange={e => {
                        if (configRef) setDoc(configRef, { ...config, break2Duration: parseInt(e.target.value) || 0 }, { merge: true }).catch(() => {})
                      }} /></div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader><DialogTitle>Plot Jadwal Manual</DialogTitle></DialogHeader>
          <div className="space-y-6 py-4">
            <div className="flex items-center justify-between p-3 bg-accent/5 border border-accent/20 rounded-xl">
               <div><Label className="font-bold">Mode Kegiatan Sekolah</Label><p className="text-[10px] text-muted-foreground italic">Agenda non-KBM (Upacara/Eskul)</p></div>
               <Switch checked={newEntry.isActivity} onCheckedChange={v => setNewEntry({...newEntry, isActivity: v})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2"><Label>Hari</Label><Select value={newEntry.day || "Senin"} onValueChange={v => setNewEntry({...newEntry, day: v})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{DAYS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select></div>
               <div className="space-y-2"><Label>Jam Ke-</Label><Select value={newEntry.period?.toString() || "1"} onValueChange={v => setNewEntry({...newEntry, period: parseInt(v)})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Array.from({length: MAX_PERIODS}).map((_, i) => <SelectItem key={i+1} value={(i+1).toString()}>{i+1}</SelectItem>)}</SelectContent></Select></div>
            </div>
            {newEntry.isActivity ? (
               <div className="space-y-2"><Label>Nama Kegiatan</Label><Input value={newEntry.activityName || ""} onChange={e => setNewEntry({...newEntry, activityName: e.target.value})} placeholder="Contoh: UPACARA" /></div>
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
            <AlertDialogTitle className="flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-destructive" /> Hapus Jadwal?</AlertDialogTitle>
            <AlertDialogDescription>Tindakan ini akan menghapus jadwal dari daftar sementara Anda.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setLocalEntries(localEntries.filter(e => e.id !== entryToDeleteId)); setIsDirty(true); setIsDeleteDialogOpen(false); }} className="bg-destructive">Ya, Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
