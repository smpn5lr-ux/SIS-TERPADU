"use client"

import React, { useMemo, Suspense } from 'react'
import { 
  BookOpen, 
  Users, 
  Star, 
  Loader2, 
  Backpack, 
  CalendarDays, 
  FileText, 
  Clock, 
  QrCode, 
  RefreshCw,
  Coffee,
  LogOut,
  Zap,
  CheckCircle2
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useUser, useFirestore, useMemoFirebase, useCollection, useDoc } from "@/firebase"
import { collection, query, where, doc } from "firebase/firestore"
import { TeacherAssignment, Staff, RosterEntry, Classroom, GlobalActivity } from "@/lib/types"
import { format, parse, addMinutes } from 'date-fns'
import { id as localeId } from 'date-fns/locale'

const DAYS_LIST = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"]

function TeacherDashboardContent() {
  const { user } = useUser()
  const db = useFirestore()
  const searchParams = useSearchParams()

  const settingsRef = useMemoFirebase(() => db ? doc(db, 'settings', 'system') : null, [db])
  const rosterConfigRef = useMemoFirebase(() => db ? doc(db, 'settings', 'roster') : null, [db])
  
  const { data: config } = useDoc<any>(settingsRef)
  const { data: rosterConfig } = useDoc<any>(rosterConfigRef)

  const selectedSemester = searchParams.get('semester') || config?.activeSemester?.toString() || "1"

  const staffQuery = useMemoFirebase(() => {
    if (!db || !user?.email) return null
    return query(collection(db, 'staff'), where('email', '==', user.email))
  }, [db, user])

  const { data: staffData } = useCollection<Staff>(staffQuery)
  const teacherId = staffData?.[0]?.id

  const assignmentsQuery = useMemoFirebase(() => {
    if (!db || !teacherId) return null
    return query(collection(db, 'teacherAssignments'), where('teacherId', '==', teacherId))
  }, [db, teacherId])

  const rosterQuery = useMemoFirebase(() => {
    if (!db || !teacherId) return null
    return query(collection(db, 'rosterEntries'), where('teacherId', '==', teacherId))
  }, [db, teacherId])

  const classesQuery = useMemoFirebase(() => db ? collection(db, 'classes') : null, [db])

  const { data: assignments, loading: loadingA } = useCollection<TeacherAssignment>(assignmentsQuery)
  const { data: rosters, loading: loadingR } = useCollection<RosterEntry>(rosterQuery)
  const { data: classes } = useCollection<Classroom>(classesQuery)

  const displayAssignments = useMemo(() => {
    if (!assignments || !classes) return assignments;
    return assignments.map(a => {
      const cls = classes.find(c => c.id === a.classId)
      return { ...a, className: cls ? cls.name : a.className }
    })
  }, [assignments, classes])

  const groupedAssignments = useMemo(() => {
    if (!displayAssignments || !classes) return {};
    const groups: Record<number, TeacherAssignment[]> = {};
    
    displayAssignments.forEach(a => {
      const cls = classes.find(c => c.id === a.classId);
      const level = cls ? cls.gradeLevel : 0;
      if (!groups[level]) groups[level] = [];
      groups[level].push(a);
    });

    Object.keys(groups).forEach(level => {
      groups[parseInt(level)].sort((a, b) => a.className.localeCompare(b.className, undefined, { numeric: true, sensitivity: 'base' }));
    });

    return groups;
  }, [displayAssignments, classes]);

  const sortedGradeLevels = useMemo(() => {
    return Object.keys(groupedAssignments).map(Number).sort((a, b) => a - b);
  }, [groupedAssignments]);

  const today = format(new Date(), 'eeee', { locale: localeId })
  
  const yesterday = useMemo(() => {
    const idx = DAYS_LIST.indexOf(today)
    if (idx === -1 || idx === 0) return "Sabtu"
    return DAYS_LIST[idx - 1]
  }, [today])

  const generateTimelineForDay = (dayName: string) => {
    if (!rosterConfig) return [];
    
    const timeline: any[] = [];
    const dailyEntries = rosterConfig.dailyEntryTimes || {};
    const dayEntryStr = dailyEntries[dayName] || rosterConfig.entryTime || "07:15";
    let currentTime = parse(dayEntryStr, 'HH:mm', new Date());
    
    const dailyDismissals = rosterConfig.dailyDismissalTimes || {};
    const dayDismissalStr = dailyDismissals[dayName] || rosterConfig.dismissalTime || "13:00";
    const dayDismissalTime = parse(dayDismissalStr, 'HH:mm', new Date());

    const dailyBreaks = rosterConfig.dailyBreaks || {};
    const dayBreak = dailyBreaks[dayName] || { active: false, period: 4, duration: 15 };

    const dayActivities = (rosterConfig.globalActivities || []).filter((a: GlobalActivity) => a.day === dayName);
    const startActivities = dayActivities.filter((a: GlobalActivity) => a.position !== 'end');
    const endActivities = dayActivities.filter((a: GlobalActivity) => a.position === 'end');
    
    const totalEndDur = endActivities.reduce((sum: number, a: GlobalActivity) => sum + a.duration, 0);
    const effectiveDismissalLimit = addMinutes(dayDismissalTime, -totalEndDur);

    const maxP = rosterConfig.maxPeriods || 10;
    const jpDur = rosterConfig.jpDuration || 40;

    for (let p = 1; p <= maxP; p++) {
      const periodStartActs = startActivities.filter((a: GlobalActivity) => a.period === p);
      periodStartActs.forEach((act: GlobalActivity) => {
        const start = currentTime;
        currentTime = addMinutes(currentTime, act.duration);
        timeline.push({ 
          type: 'activity', 
          name: act.name, 
          startTime: start, 
          endTime: currentTime,
          icon: Zap
        });
      });

      const lessonStart = currentTime;
      const lessonEnd = addMinutes(currentTime, jpDur);
      
      if (lessonEnd <= effectiveDismissalLimit) {
        currentTime = lessonEnd;
        
        const myLesson = rosters?.find(r => r.day === dayName && r.period === p);
        
        timeline.push({ 
          type: 'lesson', 
          period: p,
          startTime: lessonStart, 
          endTime: currentTime,
          isMyClass: !!myLesson,
          lessonData: myLesson
        });

        if (dayBreak.active && p === dayBreak.period) {
          const bStart = currentTime;
          currentTime = addMinutes(currentTime, dayBreak.duration);
          timeline.push({ type: 'break', name: 'ISTIRAHAT', startTime: bStart, endTime: currentTime, icon: Coffee });
        }
      }
    }

    let endStartTime = effectiveDismissalLimit;
    endActivities.forEach((act: GlobalActivity) => {
       const start = endStartTime;
       const end = addMinutes(start, act.duration);
       timeline.push({ 
         type: 'activity', 
         name: act.name, 
         startTime: start, 
         endTime: end,
         icon: Zap
       });
       endStartTime = end;
    });

    timeline.push({ type: 'dismissal', name: 'WAKTU PULANG', startTime: dayDismissalTime, icon: LogOut });
    return timeline;
  };

  const todayTimeline = useMemo(() => generateTimelineForDay(today), [rosterConfig, rosters, today]);
  const prevTimeline = useMemo(() => generateTimelineForDay(yesterday), [rosterConfig, rosters, yesterday]);

  if (loadingA || loadingR) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" /></div>

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Halo, Guru {user?.displayName}</h1>
          <p className="text-muted-foreground mt-1">
            Selamat datang di Portal Pengajar <span className="text-primary font-bold">Semester {selectedSemester}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <div className="bg-accent/10 px-4 py-2 rounded-xl border border-accent/20 flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-accent" />
            <span className="text-sm font-bold text-accent uppercase">SEMESTER {selectedSemester}</span>
          </div>
          <div className="bg-primary/10 px-4 py-2 rounded-xl border border-primary/20 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-primary uppercase">{assignments?.length || 0} Unit</span>
          </div>
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex items-center gap-2 text-muted-foreground">
           <Clock className="w-4 h-4" />
           <h2 className="text-sm font-bold uppercase tracking-widest">Roster Sekolah & Jadwal Mengajar</h2>
        </div>
        
        <Card className="border-border/50 bg-card/40 backdrop-blur-sm relative overflow-hidden shadow-xl">
           <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -mr-32 -mt-32 blur-3xl"></div>
           
           <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x">
              <div className="p-6 md:p-8 space-y-6 bg-primary/[0.01]">
                 <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                       <div className="bg-primary/20 p-2.5 rounded-2xl">
                          <CalendarDays className="w-6 h-6 text-primary" />
                       </div>
                       <div>
                          <CardTitle className="text-xl font-bold">Jadwal Hari Ini</CardTitle>
                          <CardDescription>Agenda resmi sekolah hari ini.</CardDescription>
                       </div>
                    </div>
                    <Badge className="bg-primary text-primary-foreground px-4 py-1 text-sm font-bold shadow-lg shadow-primary/20 uppercase tracking-widest">{today}</Badge>
                 </div>

                 <div className="space-y-3">
                   {todayTimeline.length === 0 ? (
                     <div className="py-12 text-center bg-muted/5 rounded-3xl border border-dashed text-muted-foreground text-xs italic">
                        Belum ada konfigurasi roster untuk hari ini.
                     </div>
                   ) : todayTimeline.map((item, idx) => (
                     <div key={idx} className={`relative flex items-center gap-4 p-3 rounded-2xl transition-all border ${
                       item.isMyClass ? 'bg-primary/10 border-primary/30 shadow-sm ring-1 ring-primary/20' : 
                       item.type === 'dismissal' ? 'bg-destructive/5 border-destructive/20' :
                       item.type === 'break' ? 'bg-accent/5 border-accent/20' : 'bg-background/40 border-border/40'
                     }`}>
                        <div className="flex flex-col items-center w-16 shrink-0 border-r border-border/50 pr-4">
                           <span className="text-[10px] font-black text-foreground">{format(item.startTime, 'HH:mm')}</span>
                           <span className="text-[8px] font-bold text-muted-foreground uppercase">{item.type === 'lesson' ? `Jam ${item.period}` : ''}</span>
                        </div>
                        
                        <div className="flex-1 flex items-center justify-between">
                           <div className="flex flex-col">
                              {item.isMyClass ? (
                                <>
                                  <span className="text-xs font-black text-primary uppercase tracking-tight">{item.lessonData?.subjectName}</span>
                                  <span className="text-[10px] font-bold text-muted-foreground italic">KELAS {item.lessonData?.className}</span>
                                </>
                              ) : (
                                <span className={`text-xs font-bold uppercase tracking-widest ${item.type === 'dismissal' ? 'text-destructive' : 'text-muted-foreground'}`}>
                                  {item.name || 'Jam Pelajaran'}
                                </span>
                              )}
                           </div>
                           
                           <div className="flex items-center gap-2">
                             {item.isMyClass && <Badge className="bg-primary text-[8px] h-5 px-2">MENGAJAR</Badge>}
                             {item.icon && <item.icon className={`w-4 h-4 opacity-30 ${item.type === 'dismissal' ? 'text-destructive' : 'text-accent'}`} />}
                           </div>
                        </div>
                     </div>
                   ))}
                 </div>
              </div>

              <div className="p-6 md:p-8 space-y-6">
                 <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                       <div className="bg-muted p-2.5 rounded-2xl">
                          <RefreshCw className="w-6 h-6 text-muted-foreground" />
                       </div>
                       <div>
                          <CardTitle className="text-xl font-bold text-muted-foreground">Jadwal Sebelumnya</CardTitle>
                          <CardDescription>Riwayat mengajar di hari sekolah lalu.</CardDescription>
                       </div>
                    </div>
                    <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30 px-4 py-1 text-sm font-bold uppercase tracking-widest">{yesterday}</Badge>
                 </div>

                 <div className="space-y-2 opacity-60 grayscale-[0.5]">
                    {prevTimeline.slice(0, 10).map((item, idx) => (
                       item.isMyClass && (
                         <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-muted/10 border border-border/50">
                            <div className="flex flex-col">
                               <span className="text-[10px] font-bold text-muted-foreground uppercase">{format(item.startTime, 'HH:mm')}</span>
                               <span className="text-xs font-bold">{item.lessonData?.subjectName}</span>
                            </div>
                            <Badge variant="outline" className="text-[9px]">KLS {item.lessonData?.className}</Badge>
                         </div>
                       )
                    ))}
                    {!prevTimeline.some(i => i.isMyClass) && (
                       <p className="text-xs text-muted-foreground italic text-center py-8">Tidak ada jadwal mengajar pada hari {yesterday}.</p>
                    )}
                 </div>

                 <div className="pt-4">
                    <Button asChild variant="outline" className="w-full text-xs gap-2 border-border/50 hover:bg-muted/50 rounded-xl h-11">
                      <Link href="/teacher">Perbarui Dasbor <RefreshCw className="w-4 h-4" /></Link>
                    </Button>
                 </div>
              </div>
           </div>
        </Card>
      </section>

      <section className="space-y-6">
         <div className="flex items-center justify-between">
           <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
             <BookOpen className="w-4 h-4 text-accent" /> Mata Pelajaran Pengampu
           </h2>
           <Badge variant="secondary" className="font-bold text-[10px] tracking-widest">{assignments?.length || 0} TOTAL UNIT</Badge>
         </div>
         
         {displayAssignments?.length === 0 ? (
            <div className="py-24 text-center border-2 border-dashed rounded-3xl bg-muted/10">
              <Backpack className="w-16 h-16 mx-auto text-muted-foreground opacity-10 mb-6" />
              <h3 className="text-xl font-bold">Data Kelas Kosong</h3>
              <p className="text-muted-foreground text-sm max-w-xs mx-auto mt-2">Belum ada penugasan guru yang tercatat. Silakan hubungi bagian Kurikulum.</p>
            </div>
         ) : (
           <div className="space-y-12">
             {sortedGradeLevels.map(level => (
               <div key={level} className="space-y-6">
                 <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent font-black text-lg shadow-sm">
                      {level}
                    </div>
                    <div className="flex flex-col">
                       <span className="text-lg font-headline font-bold">TINGKAT {level}</span>
                       <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Siswa Menengah Pertama</span>
                    </div>
                    <div className="h-px bg-gradient-to-r from-border to-transparent flex-1"></div>
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {groupedAssignments[level].map((a) => (
                      <Card key={a.id} className="border-border/50 transition-all shadow-md hover:shadow-xl bg-card/60 backdrop-blur-sm relative group overflow-hidden h-full flex flex-col rounded-3xl">
                        <div className="absolute top-0 left-0 w-full h-1 bg-primary/20 group-hover:h-2 transition-all"></div>
                        <CardHeader className="pb-4">
                          <div className="flex items-center justify-between">
                            <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold px-3 py-1">KELAS {a.className}</Badge>
                            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                              <Star className="w-3.5 h-3.5 text-muted-foreground" />
                            </div>
                          </div>
                          <CardTitle className="text-xl font-headline mt-4 leading-tight group-hover:text-primary transition-colors">{a.subjectName}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 mt-auto">
                          <div className="grid grid-cols-2 gap-3">
                            <Button asChild variant="outline" size="sm" className="gap-2 h-10 border-primary/10 hover:bg-primary/5 rounded-xl text-xs font-bold shadow-sm">
                              <Link href={`/teacher/grading/${a.id}?semester=${selectedSemester}`}>
                                <CheckCircle2 className="w-3.5 h-3.5 text-primary" /> Buku Nilai
                              </Link>
                            </Button>
                            <Button asChild variant="outline" size="sm" className="gap-2 h-10 border-accent/10 hover:bg-accent/5 rounded-xl text-xs font-bold shadow-sm">
                              <Link href={`/teacher/journal/${a.id}?semester=${selectedSemester}`}>
                                <FileText className="w-3.5 h-3.5 text-accent" /> Jurnal
                              </Link>
                            </Button>
                          </div>
                          <Button asChild className="w-full gap-2 h-11 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 rounded-xl font-bold">
                            <Link href={`/teacher/journal/${a.id}?semester=${selectedSemester}&scan=1`}>
                              <QrCode className="w-4 h-4" /> Mulai Absen QR
                            </Link>
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                 </div>
               </div>
             ))}
           </div>
         )}
      </section>
    </div>
  )
}

export default function TeacherDashboard() {
  return (
    <Suspense fallback={<div className="flex justify-center py-24"><Loader2 className="animate-spin text-primary w-10 h-10" /></div>}>
      <TeacherDashboardContent />
    </Suspense>
  )
}
