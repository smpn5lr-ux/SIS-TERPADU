
"use client"

import { useState, useMemo } from "react"
import { 
  FileDown, 
  TrendingUp, 
  Users, 
  School, 
  Calendar,
  Filter,
  BarChart3,
  PieChart as PieIcon,
  Download,
  Loader2,
  FileSpreadsheet,
  FileText as FilePdf,
  FileCode,
  CheckCircle2,
  Settings2,
  CalendarDays,
  LayoutGrid,
  Users2
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell
} from "recharts"
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
import { useCollection, useFirestore, useMemoFirebase, useDoc } from "@/firebase"
import { collection, query, orderBy, doc } from "firebase/firestore"
import { Applicant, Classroom } from "@/index"
import { useToast } from "@/hooks/use-toast"
import * as XLSX from 'xlsx'
import { Skeleton } from "@/components/ui/skeleton"

const COLORS = ['#4361EE', '#4CC9F0', '#F72585', '#7209B7', '#3A0CA3']

const EXPORT_COLUMNS = [
  { id: 'registrationNumber', label: 'No. Induk / Reg' },
  { id: 'NISN', label: 'NISN' },
  { id: 'fullName', label: 'Nama Lengkap' },
  { id: 'gender', label: 'Jenis Kelamin' },
  { id: 'originSchool', label: 'Sekolah Asal' },
  { id: 'address', label: 'Alamat' },
  { id: 'birthDate', label: 'Tanggal Lahir' },
  { id: 'religion', label: 'Agama' },
]

export default function ReportsPage() {
  const db = useFirestore()
  const { toast } = useToast()
  const [isExporting, setIsExporting] = useState(false)
  const [selectedColumns, setSelectedColumns] = useState<string[]>(EXPORT_COLUMNS.map(c => c.id))
  const [isDownloadDialogOpen, setIsDownloadDialogOpen] = useState(false)

  const applicantsQuery = useMemoFirebase(() => {
    if (!db) return null
    return query(collection(db, 'applicants'), orderBy('fullName', 'asc'))
  }, [db])

  const classesQuery = useMemoFirebase(() => db ? collection(db, 'classes') : null, [db])

  const settingsRef = useMemoFirebase(() => {
    if (!db) return null
    return doc(db, 'settings', 'system')
  }, [db])

  const { data: applicants, loading: loadingA } = useCollection<Applicant>(applicantsQuery)
  const { data: classes, loading: loadingC } = useCollection<Classroom>(classesQuery)
  const { data: systemSettings } = useDoc<any>(settingsRef)

  const dinasName = systemSettings?.dinasName || "DINAS PENDIDIKAN"
  const schoolName = systemSettings?.schoolName || "SIS TERPADU"
  const academicYear = systemSettings?.academicYear || "2024/2025"

  const stats = useMemo(() => {
    if (!applicants) return { total: 0, activeCount: 0, avgClassSize: 0, totalClasses: 0 }
    const total = applicants.filter(a => !a.isDeleted).length
    const activeCount = applicants.filter(a => !a.isDeleted && a.admissionStatus !== 'graduated').length
    const totalClasses = classes?.length || 0
    const avgClassSize = totalClasses > 0 ? (activeCount / totalClasses).toFixed(1) : 0
      
    return { total, activeCount, avgClassSize, totalClasses }
  }, [applicants, classes])

  const getExportData = () => {
    if (!applicants) return []
    return applicants.filter(a => !a.isDeleted).map((a, idx) => {
      const row: any = { "No.": idx + 1 }
      EXPORT_COLUMNS.forEach(col => {
        if (selectedColumns.includes(col.id)) {
          row[col.label] = (a as any)[col.id] || '-'
        }
      })
      return row
    })
  }

  const handleExportExcel = () => {
    if (!applicants?.length || selectedColumns.length === 0) return
    setIsExporting(true)
    try {
      const data = getExportData()
      const worksheet = XLSX.utils.json_to_sheet(data)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan Siswa")
      XLSX.writeFile(workbook, `Laporan_Siswa_${new Date().toISOString().split('T')[0]}.xlsx`)
      toast({ title: "Ekspor Berhasil" })
      setIsDownloadDialogOpen(false)
    } catch (error) {
      toast({ variant: "destructive", title: "Error" })
    } finally {
      setIsExporting(false)
    }
  }

  const toggleColumn = (id: string) => {
    setSelectedColumns(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  const levelDistribution = useMemo(() => {
    if (!classes || !applicants) return []
    const levels: Record<number, number> = {}
    
    classes.forEach(cls => {
      const level = cls.gradeLevel
      const count = cls.students?.length || 0
      levels[level] = (levels[level] || 0) + count
    })

    return Object.entries(levels).map(([lvl, count]) => ({
      name: `Tingkat ${lvl}`,
      count
    })).sort((a, b) => a.name.localeCompare(b.name))
  }, [classes, applicants])

  const genderData = useMemo(() => {
    if (!applicants) return []
    const male = applicants.filter(a => !a.isDeleted && a.gender === 'Laki-laki').length
    const female = applicants.filter(a => !a.isDeleted && a.gender === 'Perempuan').length
    const total = male + female
    if (total === 0) return []
    return [
      { name: 'Laki-laki', value: Math.round((male/total)*100) },
      { name: 'Perempuan', value: Math.round((female/total)*100) }
    ]
  }, [applicants])

  const loading = loadingA || loadingC

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Laporan Akademik</h1>
          <p className="text-muted-foreground mt-1">Rekapitulasi data siswa dan operasional sekolah.</p>
        </div>
        <Dialog open={isDownloadDialogOpen} onOpenChange={setIsDownloadDialogOpen}>
          <DialogTrigger asChild>
            <Button disabled={loading} className="gap-2 bg-primary shadow-lg shadow-primary/20">
              <FileDown className="w-4 h-4" /> Ekspor Data Induk
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Pilih Kolom Ekspor</DialogTitle>
              <DialogDescription>Format file akan berupa Excel (.xlsx)</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 py-4">
              {EXPORT_COLUMNS.map(col => (
                <div key={col.id} className="flex items-center space-x-2">
                  <Checkbox id={col.id} checked={selectedColumns.includes(col.id)} onCheckedChange={() => toggleColumn(col.id)} />
                  <Label htmlFor={col.id} className="text-xs cursor-pointer">{col.label}</Label>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button onClick={handleExportExcel} disabled={isExporting} className="w-full">Unduh Sekarang</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="border-border/50">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Murid Aktif</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{loading ? "..." : stats.activeCount}</div></CardContent>
        </Card>
        <Card className="border-border/50">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2"><School className="w-4 h-4 text-accent" /> Total Rombel</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{loading ? "..." : stats.totalClasses}</div></CardContent>
        </Card>
        <Card className="border-border/50">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2"><Users2 className="w-4 h-4 text-pink-500" /> Rasio Rombel</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{loading ? "..." : stats.avgClassSize}</div><p className="text-[10px] text-muted-foreground">Siswa / Kelas</p></CardContent>
        </Card>
        <Card className="border-border/50">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2"><Calendar className="w-4 h-4 text-amber-500" /> Thn Ajaran</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold">{academicYear}</div></CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border/50">
          <CardHeader><CardTitle className="text-lg">Sebaran Murid per Tingkat</CardTitle></CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={levelDistribution}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '8px', border: 'none' }} />
                <Bar dataKey="count" fill="#4361EE" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader><CardTitle className="text-lg">Persentase Gender</CardTitle></CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={genderData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" label={({name, value}) => `${name}: ${value}%`}>
                  {genderData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
