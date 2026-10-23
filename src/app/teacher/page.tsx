
"use client"

import React, { useMemo, Suspense } from 'react'
import { 
  BookOpen, 
  Users, 
  ChevronRight, 
  Star, 
  ClipboardCheck,
  Loader2,
  Backpack,
  CalendarDays,
  FileText,
  Clock,
  ArrowRight,
  QrCode,
  Layers,
  History
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useUser, useFirestore, useMemoFirebase, useCollection, useDoc } from "@/firebase"
import { collection, query, where, doc } from "firebase/firestore"
import { TeacherAssignment, Staff, RosterEntry, Classroom } from "@/lib/types"
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

  const todaySchedule = useMemo(() => {
    if (!rosters || !classes) return []
    return rosters
      .filter(r => r.day === today)
      .map(r => {
         const cls = classes.find(c => c.id === r.classId)
         return { ...r, className: cls ? cls.name : r.className }
      })
      .sort((a, b) => a.period - b.period)
  }, [rosters, today, classes])

  const prevSchedule = useMemo(() => {
    if (!rosters || !classes) return []
    return rosters
      .filter(r => r.day === yesterday)
      .map(r => {
         const cls = classes.find(c => c.id === r.classId)
         return { ...r, className: cls ? cls.name : r.className }
      })
      .sort((a, b) => a.period - b.period)
  }, [rosters, yesterday, classes])

  const getTimeForPeriod = (period: number) => {
    if (!rosterConfig) return "-"
    let current = parse(rosterConfig.entryTime || "07:00", 'HH:mm', new Date())
    const jpDur = rosterConfig.jpDuration || 40
    
    for (let i = 1; i < period; i++) {
      let duration = jpDur
      if (rosterConfig.break1Active && i === rosterConfig.break1Period) duration = rosterConfig.break1Duration
      if (rosterConfig.break2Active && i === rosterConfig.break2Period) duration = rosterConfig.break2Duration
      current = addMinutes(current, duration)
    }
    
    let currentDuration = jpDur
    if (rosterConfig.break1Active && period === rosterConfig.break1Period) currentDuration = rosterConfig.break1Duration
    if (rosterConfig.break2Active && period === rosterConfig.break2Period) currentDuration = rosterConfig.break2Duration
    
    const end = addMinutes(current, currentDuration)
    return `${format(current, 'HH:mm')} - ${format(end, 'HH:mm')}`
  }

  if (loadingA || loadingR) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" /></div>

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
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
            <span className="text-sm font-bold text-primary uppercase">{assignments?.length || 0} Kelas</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <Card className="border-border/50 bg-primary/5 relative overflow-hidden">
             <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full -mr-16 -mt-16 blur-2xl"></div>
             <CardHeader>
                <div className="flex items-center justify-between">
                   <CardTitle className="text-lg flex items-center gap-2"><Clock className="w-5 h-5 text-primary" /> Jadwal Hari Ini</CardTitle>
                   <Badge className="bg-primary text-primary-foreground">{today}</Badge>
                </div>
                <CardDescription>Urutan mengajar Anda hari ini.</CardDescription>
             </CardHeader>
             <CardContent className="space-y-4">
                {todaySchedule.length === 0 ? (
                  <div className="py-8 text-center flex flex-col items-center gap-3 bg-card/40 rounded-xl border border-dashed">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                       <Star className="w-5 h-5 text-muted-foreground opacity-20" />
                    </div>
                    <p className="text-[10px] text-muted-foreground italic">Tidak ada jadwal mengajar hari ini.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {todaySchedule.map((s, idx) => (
                      <div key={s.id} className="relative pl-6 border-l-2 border-primary/20 group hover:border-primary transition-all">
                        <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-background border-2 border-primary group-hover:scale-125 transition-transform"></div>
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-primary uppercase tracking-tighter">JAM KE-{s.period} • {getTimeForPeriod(s.period)}</span>
                              <Badge variant="outline" className="text-[8px] h-4">KELAS {s.className}</Badge>
                            </div>
                            <span className="font-bold text-sm">{s.subjectName}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
             </CardContent>
             
             <Separator className="opacity-30" />
             
             <CardHeader className="pt-6">
                <div className="flex items-center justify-between">
                   <CardTitle className="text-sm font-bold flex items-center gap-2 text-muted-foreground"><History className="w-4 h-4" /> Jadwal Sebelumnya</CardTitle>
                   <Badge variant="outline" className="text-[10px] text-muted-foreground">{yesterday}</Badge>
                </div>
             </CardHeader>
             <CardContent className="space-y-4 pb-8">
                {prevSchedule.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground italic text-center py-4">Tidak ada data jadwal kemarin.</p>
                ) : (
                  <div className="space-y-4">
                    {prevSchedule.map((s) => (
                      <div key={s.id} className="relative pl-6 border-l-2 border-border/50 opacity-60">
                        <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-background border-2 border-border"></div>
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-bold uppercase text-muted-foreground">JAM KE-{s.period} • {getTimeForPeriod(s.period)}</span>
                              <span className="text-[8px] font-bold text-muted-foreground">KELAS {s.className}</span>
                            </div>
                            <span className="font-medium text-xs text-muted-foreground">{s.subjectName}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <Button asChild variant="outline" className="w-full mt-4 text-[10px] h-9 gap-2 border-border/50 hover:bg-background">
                  <Link href="/teacher">Refresh Dasbor <ArrowRight className="w-3 h-3" /></Link>
                </Button>
             </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-8">
           <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
             <BookOpen className="w-4 h-4" /> Mata Pelajaran Anda
           </h2>
           
           {displayAssignments?.length === 0 ? (
              <div className="py-20 text-center border-2 border-dashed rounded-2xl bg-muted/20">
                <Backpack className="w-12 h-12 mx-auto text-muted-foreground opacity-20 mb-4" />
                <h3 className="text-xl font-bold">Belum Ada Penugasan</h3>
                <p className="text-muted-foreground">Hubungi Admin/Kurikulum untuk plotting jadwal mengajar Anda.</p>
              </div>
           ) : (
             <div className="space-y-10">
               {sortedGradeLevels.map(level => (
                 <div key={level} className="space-y-4">
                   <div className="flex items-center gap-4">
                      <Badge className="bg-primary/10 text-primary border-primary/30 px-3 py-1 text-xs font-bold gap-2">
                        <Layers className="w-3 h-3" /> TINGKAT {level}
                      </Badge>
                      <div className="h-px bg-border flex-1 opacity-50"></div>
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {groupedAssignments[level].map((a) => (
                        <Card key={a.id} className="border-border/50 transition-all shadow-sm hover:shadow-md bg-card/40 backdrop-blur-sm relative group h-full">
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <Badge className="bg-primary/20 text-primary border-none text-[10px] font-bold uppercase">KELAS {a.className}</Badge>
                              <div className="bg-muted p-2 rounded-lg">
                                <Star className="w-4 h-4 text-muted-foreground fill-current" />
                              </div>
                            </div>
                            <CardTitle className="text-xl font-headline mt-4">{a.subjectName}</CardTitle>
                            <CardDescription className="text-xs uppercase tracking-widest font-bold text-muted-foreground/60">Tingkat Menengah Pertama</CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                              <Button asChild variant="outline" size="sm" className="gap-2 h-10 border-primary/20 hover:bg-primary/5">
                                <Link href={`/teacher/grading/${a.id}?semester=${selectedSemester}`}>
                                  <ClipboardCheck className="w-4 h-4 text-primary" /> Buku Nilai
                                </Link>
                              </Button>
                              <Button asChild variant="outline" size="sm" className="gap-2 h-10 border-accent/20 hover:bg-accent/5">
                                <Link href={`/teacher/journal/${a.id}?semester=${selectedSemester}`}>
                                  <FileText className="w-4 h-4 text-accent" /> Jurnal
                                </Link>
                              </Button>
                            </div>
                            <Button asChild className="w-full gap-2 h-11 bg-primary hover:bg-primary/90 shadow-md shadow-primary/10">
                              <Link href={`/teacher/journal/${a.id}?semester=${selectedSemester}&scan=1`}>
                                <QrCode className="w-5 h-5" /> Mulai Absen QR
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
        </div>
      </div>
    </div>
  )
}

export default function TeacherDashboard() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" /></div>}>
      <TeacherDashboardContent />
    </Suspense>
  )
}
