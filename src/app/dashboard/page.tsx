"use client"

import { useMemo } from "react"
import { 
  Users, 
  School, 
  BookOpen, 
  GraduationCap,
  BarChart3
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useCollection, useFirestore, useMemoFirebase, useDoc } from "@/firebase"
import { collection, query, limit, doc } from "firebase/firestore"
import { Applicant, Classroom, Staff, Subject } from "@/lib/types"
import { Skeleton } from "@/components/ui/skeleton"
import Link from "next/link"

export default function OverviewPage() {
  const db = useFirestore()
  
  const applicantsQuery = useMemoFirebase(() => {
    if (!db) return null
    return query(collection(db, 'applicants'), limit(2000))
  }, [db])

  const classesQuery = useMemoFirebase(() => db ? collection(db, 'classes') : null, [db])
  const staffQuery = useMemoFirebase(() => db ? collection(db, 'staff') : null, [db])
  const subjectsQuery = useMemoFirebase(() => db ? collection(db, 'subjects') : null, [db])

  const settingsRef = useMemoFirebase(() => {
    if (!db) return null
    return doc(db, 'settings', 'system')
  }, [db])

  const { data: allApplicants, loading: loadingApplicants } = useCollection<Applicant>(applicantsQuery)
  const { data: classes } = useCollection<Classroom>(classesQuery)
  const { data: staff } = useCollection<Staff>(staffQuery)
  const { data: subjects } = useCollection<Subject>(subjectsQuery)
  const { data: config, loading: loadingConfig } = useDoc<any>(settingsRef)

  const applicants = useMemo(() => {
    if (!allApplicants) return []
    return allApplicants.filter(a => !a.isDeleted)
  }, [allApplicants])

  const academicStats = [
    { name: 'Total Rombel', value: classes?.length || 0, icon: School, color: 'text-primary', bg: 'bg-primary/10', href: '/dashboard/classes' },
    { name: 'Staf & Guru', value: staff?.length || 0, icon: GraduationCap, color: 'text-accent', bg: 'bg-accent/10', href: '/dashboard/staff' },
    { name: 'Mata Pelajaran', value: subjects?.length || 0, icon: BookOpen, color: 'text-amber-500', bg: 'bg-amber-500/10', href: '/dashboard/subjects' },
    { name: 'Murid Aktif', value: applicants.filter(a => a.admissionStatus === 'accepted').length, icon: Users, color: 'text-green-500', bg: 'bg-green-500/10', href: '/dashboard/students' },
  ]

  const loading = loadingApplicants || loadingConfig

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Ringkasan Sistem</h1>
          <p className="text-muted-foreground mt-1">Status operasional akademik sekolah terpadu.</p>
        </div>
        <div className="flex items-center gap-2 bg-card p-1.5 rounded-lg border border-border">
          <Badge variant="default" className="gap-1 font-bold">
             <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
             SISTEM AKTIF
          </Badge>
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          <GraduationCap className="w-4 h-4" /> Manajemen Akademik
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
          ) : (
            academicStats.map((stat) => (
              <Link key={stat.name} href={stat.href} className="block">
                <Card className="border-border/50 hover:border-primary/50 transition-all group cursor-pointer h-full bg-card/50 backdrop-blur-sm">
                  <CardContent className="p-5 flex items-center gap-4">
                    <div className={`${stat.bg} p-3 rounded-xl`}>
                      <stat.icon className={`w-5 h-5 ${stat.color}`} />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{stat.name}</p>
                      <h3 className="text-xl font-bold">{stat.value}</h3>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4">
        <Card className="border-border/50 bg-card/30">
          <CardHeader>
            <CardTitle className="font-headline text-lg">Informasi Akademik</CardTitle>
            <CardDescription>Detail periode operasional sekolah.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-muted/20 rounded-lg border border-border/50">
                   <p className="text-[10px] font-bold text-muted-foreground uppercase">Tahun Ajaran</p>
                   <p className="text-lg font-bold">{config?.academicYear || "-"}</p>
                </div>
                <div className="p-3 bg-muted/20 rounded-lg border border-border/50">
                   <p className="text-[10px] font-bold text-muted-foreground uppercase">Semester</p>
                   <p className="text-lg font-bold">{config?.activeSemester === 1 ? '1 (Ganjil)' : '2 (Genap)'}</p>
                </div>
             </div>
             <div className="p-4 rounded-xl border border-primary/20 bg-primary/5">
                <p className="text-xs text-muted-foreground leading-relaxed italic text-center">
                  "Seluruh data nilai dan absensi otomatis terhubung ke periode akademik di atas."
                </p>
             </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/30">
          <CardHeader>
            <CardTitle className="font-headline text-lg">Pintasan Cepat</CardTitle>
            <CardDescription>Akses menu yang sering digunakan.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            <Button asChild variant="outline" className="justify-start gap-2 h-11"><Link href="/dashboard/students"><Users className="w-4 h-4" /> Data Murid</Link></Button>
            <Button asChild variant="outline" className="justify-start gap-2 h-11"><Link href="/dashboard/classes"><School className="w-4 h-4" /> Kelola Rombel</Link></Button>
            <Button asChild variant="outline" className="justify-start gap-2 h-11"><Link href="/dashboard/subjects"><BookOpen className="w-4 h-4" /> Kurikulum</Link></Button>
            <Button asChild variant="outline" className="justify-start gap-2 h-11"><Link href="/dashboard/reports"><BarChart3 className="w-4 h-4" /> Laporan</Link></Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
