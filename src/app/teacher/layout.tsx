
"use client"

import * as React from "react"
import { 
  GraduationCap,
  LogOut,
  Loader2,
  Menu,
  BookCheck,
  LayoutDashboard,
  UserCircle,
  CalendarDays,
  ChevronRight,
  Download,
  FileSpreadsheet,
  BookOpen,
  Users,
  QrCode,
  Search,
  CheckCircle2
} from "lucide-react"
import { 
  Sidebar, 
  SidebarContent, 
  SidebarFooter, 
  SidebarHeader, 
  SidebarInset, 
  SidebarMenu, 
  SidebarMenuButton, 
  SidebarMenuItem, 
  SidebarProvider, 
  SidebarTrigger,
  useSidebar
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useAuth, useUser, useFirestore, useDoc, useMemoFirebase, useCollection } from "@/firebase"
import { signOut } from "firebase/auth"
import { doc, collection, query, where, getDocs } from "firebase/firestore"
import { Staff, TeacherAssignment, Journal, Assessment, Applicant, Classroom } from "@/lib/types"
import { useToast } from "@/hooks/use-toast"
import { ScrollArea } from "@/components/ui/scroll-area"
import * as XLSX from 'xlsx'

function TeacherLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const auth = useAuth()
  const db = useFirestore()
  const { toast } = useToast()
  const { user, loading: userLoading } = useUser()
  
  const [isQRDialogOpen, setIsQRDialogOpen] = React.useState(false)
  const [isProcessingQR, setIsProcessingQR] = React.useState(false)

  const settingsRef = useMemoFirebase(() => db ? doc(db, 'settings', 'system') : null, [db])
  const { data: config } = useDoc<any>(settingsRef)

  const staffQuery = useMemoFirebase(() => {
    if (!db || !user?.email) return null
    return query(collection(db, 'staff'), where('email', '==', user.email))
  }, [db, user])

  const { data: staffData, loading: staffLoading } = useCollection<Staff>(staffQuery)

  const selectedSemester = searchParams.get('semester') || config?.activeSemester?.toString() || "1"
  const teacherId = staffData?.[0]?.id

  // Ambil assignments secara reaktif untuk populate dialog pilihan kelas
  const assignmentsQuery = useMemoFirebase(() => {
    if (!db || !teacherId) return null
    return query(collection(db, 'teacherAssignments'), where('teacherId', '==', teacherId))
  }, [db, teacherId])
  
  const { data: teacherAssignments, loading: loadingAsg } = useCollection<TeacherAssignment>(assignmentsQuery)

  const uniqueClasses = React.useMemo(() => {
    if (!teacherAssignments) return []
    const map = new Map<string, string>()
    teacherAssignments.forEach(a => map.set(a.classId, a.className))
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  }, [teacherAssignments])

  React.useEffect(() => {
    if (!userLoading && !user) router.push('/login')
    if (!staffLoading && staffData && staffData.length > 0) {
      if (staffData[0].role !== 'Guru') router.push('/dashboard')
    }
  }, [user, userLoading, staffLoading, staffData, router])

  const handleLogout = async () => {
    await signOut(auth)
    router.push('/login')
  }

  const fetchAllTeacherData = async () => {
    if (!db || !teacherId) return null
    
    const assignmentsSnap = await getDocs(query(collection(db, 'teacherAssignments'), where('teacherId', '==', teacherId)))
    const assignments = assignmentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as TeacherAssignment))
    
    const assignmentIds = assignments.map(a => a.id)
    if (assignmentIds.length === 0) return { assignments: [], journals: [], assessments: [], allStudents: [], allClasses: [] }

    const journalsSnap = await getDocs(query(collection(db, 'journals'), where('assignmentId', 'in', assignmentIds)))
    const journals = journalsSnap.docs.map(d => d.data() as Journal).filter(j => j.semester === parseInt(selectedSemester))

    const assessmentsSnap = await getDocs(query(collection(db, 'assessments'), where('assignmentId', 'in', assignmentIds)))
    const assessments = assessmentsSnap.docs.map(d => d.data() as Assessment).filter(a => a.semester === parseInt(selectedSemester))

    const studentsSnap = await getDocs(query(collection(db, 'applicants'), where('admissionStatus', '==', 'accepted')))
    const allStudents = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Applicant))

    const classesSnap = await getDocs(collection(db, 'classes'))
    const allClasses = classesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Classroom))

    return { assignments, journals, assessments, allStudents, allClasses }
  }

  const handleDownloadTemplate = async () => {
    const data = [["No", "Nama Siswa", "NISN", "Absensi (%)", "Tugas 1", "Tugas 2", "Tugas 3", "Ulangan", "STS", "SAS"]]
    const ws = XLSX.utils.aoa_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Template Nilai")
    XLSX.writeFile(wb, "Template_Buku_Nilai.xlsx")
    toast({ title: "Template Berhasil Diunduh" })
  }

  const handleDownloadJurnal = async () => {
    const data = await fetchAllTeacherData()
    if (!data) return
    const journalData = data.journals.map(j => {
      const asg = data.assignments.find(a => a.id === j.assignmentId)
      return { "Mapel": asg?.subjectName, "Kelas": asg?.className, "Pertemuan": j.meetingNumber, "Tgl": j.date, "Materi": j.material }
    })
    const ws = XLSX.utils.json_to_sheet(journalData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Jurnal")
    XLSX.writeFile(wb, `Jurnal_Sem${selectedSemester}.xlsx`)
  }

  const handleDownloadKelas = async () => {
    const data = await fetchAllTeacherData()
    if (!data) return
    const wb = XLSX.utils.book_new()
    const processedClassIds = new Set<string>()
    data.assignments.forEach(asg => {
      if (processedClassIds.has(asg.classId)) return
      processedClassIds.add(asg.classId)
      const targetClass = data.allClasses.find(c => c.id === asg.classId)
      const classStudents = data.allStudents.filter(s => targetClass?.students?.includes(s.id))
      const ws = XLSX.utils.json_to_sheet(classStudents.map((s, i) => ({ "No": i+1, "Nama": s.fullName, "NISN": s.NISN })))
      XLSX.utils.book_append_sheet(wb, ws, `Kelas ${asg.className}`.substring(0, 30))
    })
    XLSX.writeFile(wb, "Daftar_Murid.xlsx")
  }

  const handleDownloadSpecificClassQR = async (classId: string, className: string) => {
    if (!db) return
    setIsProcessingQR(true)
    
    try {
      const { default: jsPDF } = await import('jspdf')
      const brandBlue = [67, 97, 238] as [number, number, number]
      const schoolName = config?.schoolName || "SIS TERPADU"

      // Ambil data rombel untuk tau daftar murid ID
      const classRef = doc(db, 'classes', classId)
      const classSnap = await getDocs(query(collection(db, 'classes'), where('__name__', '==', classId)))
      const targetClass = classSnap.docs[0]?.data() as Classroom
      
      if (!targetClass || !targetClass.students || targetClass.students.length === 0) {
        toast({ variant: "destructive", title: "Gagal", description: "Tidak ada murid terdaftar di kelas ini." })
        setIsProcessingQR(false)
        return
      }

      // Ambil data murid lengkap
      const studentsSnap = await getDocs(query(collection(db, 'applicants'), where('admissionStatus', '==', 'accepted')))
      const students = studentsSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as Applicant))
        .filter(s => targetClass.students.includes(s.id))
        .sort((a, b) => a.fullName.localeCompare(b.fullName))

      const docPdf = new jsPDF('p', 'mm', 'a4')
      
      docPdf.setFontSize(14).setFont("helvetica", "bold").setTextColor(brandBlue[0], brandBlue[1], brandBlue[2])
      docPdf.text(`KARTU QR ABSENSI - KELAS ${className}`, 105, 15, { align: "center" })
      docPdf.setFontSize(10).setTextColor(100).setFont("helvetica", "normal")
      docPdf.text(`${schoolName}`, 105, 20, { align: "center" })
      docPdf.line(14, 25, 196, 25)

      let x = 10;
      let y = 35;
      const cardWidth = 62;
      const cardHeight = 68;
      const margin = 2;

      students.forEach((s, idx) => {
        docPdf.setDrawColor(230).setLineWidth(0.2).rect(x, y, cardWidth, cardHeight)
        docPdf.setFillColor(brandBlue[0], brandBlue[1], brandBlue[2]).rect(x, y, cardWidth, 5, 'F')
        
        docPdf.setFontSize(7).setFont("helvetica", "bold").setTextColor(0)
        const truncatedName = s.fullName.length > 25 ? s.fullName.substring(0, 23) + "..." : s.fullName
        docPdf.text(truncatedName.toUpperCase(), x + cardWidth/2, y + 12, { align: "center" })
        
        docPdf.setFontSize(6).setFont("helvetica", "normal").setTextColor(100)
        docPdf.text(`NISN: ${s.NISN || "-"}`, x + cardWidth/2, y + 17, { align: "center" })

        docPdf.setFontSize(6).setFont("helvetica", "bold").setTextColor(brandBlue[0], brandBlue[1], brandBlue[2])
        docPdf.text(`KELAS: ${className}`, x + cardWidth/2, y + 22, { align: "center" })

        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${s.id}`
        docPdf.addImage(qrUrl, 'PNG', x + (cardWidth - 35) / 2, y + 26, 35, 35)
        
        docPdf.setFontSize(5).setTextColor(150).text("SCAN UNTUK ABSEN MANDIRI", x + cardWidth/2, y + 65, { align: "center" })

        x += cardWidth + margin;
        if (x + cardWidth > 200) {
          x = 10;
          y += cardHeight + margin;
        }
        if (y + cardHeight > 280) {
          docPdf.addPage()
          y = 15;
          x = 10;
        }
      })
      
      docPdf.save(`Kartu_QR_Absensi_${className.replace(/\s+/g, '_')}.pdf`)
      toast({ title: "Unduh Berhasil", description: `Kartu QR Kelas ${className} telah disimpan.` })
      setIsQRDialogOpen(false)
    } catch (e) {
      toast({ variant: "destructive", title: "Kesalahan", description: "Gagal membuat dokumen PDF." })
    } finally {
      setIsProcessingQR(false)
    }
  }

  const appName = config?.appName || "SIS TERPADU"
  const appLogoUrl = config?.appLogoUrl || "/icon-logo.webp"

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <Sidebar className="border-r border-border">
          <SidebarHeader className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 overflow-hidden shrink-0 bg-transparent flex items-center justify-center">
                {appLogoUrl ? <img src={appLogoUrl} alt="Logo" className="w-full h-full object-contain" /> : <GraduationCap className="w-full h-full text-primary" />}
              </div>
              <div className="flex flex-col">
                <span className="font-headline font-bold text-lg leading-tight uppercase truncate">{appName}</span>
                <span className="text-[10px] text-primary font-bold">Portal Pengajar</span>
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent className="px-2 py-4">
            <div className="space-y-6">
              <div>
                <p className="px-3 mb-2 text-[10px] font-bold text-muted-foreground uppercase">Utama</p>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === '/teacher'}>
                      <Link href="/teacher" className="gap-3">
                        <LayoutDashboard className="w-5 h-5" />
                        <span>Dasbor</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </div>
              <div>
                <p className="px-3 mb-2 text-[10px] font-bold text-primary uppercase">Buku Nilai</p>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={selectedSemester === "1"}>
                      <Link href="/teacher?semester=1" className="gap-3">
                        <CalendarDays className="w-5 h-5" />
                        <span>Semester 1</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={selectedSemester === "2"}>
                      <Link href="/teacher?semester=2" className="gap-3">
                        <CalendarDays className="w-5 h-5" />
                        <span>Semester 2</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </div>
              <div>
                <p className="px-3 mb-2 text-[10px] font-bold text-muted-foreground uppercase">Unduh Laporan</p>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton onClick={() => setIsQRDialogOpen(true)} className="gap-3">
                      <QrCode className="w-5 h-5 text-accent" />
                      <span className="text-xs">Unduh Kartu QR</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton onClick={handleDownloadTemplate} className="gap-3">
                      <FileSpreadsheet className="w-5 h-5 text-green-500" />
                      <span className="text-xs">Template Nilai</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton onClick={handleDownloadJurnal} className="gap-3">
                      <BookOpen className="w-5 h-5 text-blue-500" />
                      <span className="text-xs">Unduh Jurnal</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton onClick={handleDownloadKelas} className="gap-3">
                      <Users className="w-5 h-5 text-orange-500" />
                      <span className="text-xs">Unduh Kelas</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </div>
            </div>
          </SidebarContent>
          <SidebarFooter className="p-4 border-t">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={handleLogout} className="text-destructive h-10 gap-3">
                  <LogOut className="w-5 h-5" />
                  <span>Keluar</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset className="flex flex-col flex-1 overflow-hidden">
          <header className="h-16 border-b flex items-center justify-between px-6 bg-card/40 backdrop-blur-sm sticky top-0 z-10">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="lg:hidden" />
              <h2 className="font-bold text-sm">Selamat Datang, {user?.displayName}</h2>
            </div>
          </header>
          <main className="flex-1 overflow-y-auto p-6 bg-background/50">
            <React.Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" /></div>}>
              {children}
            </React.Suspense>
          </main>
        </SidebarInset>
      </div>

      <Dialog open={isQRDialogOpen} onOpenChange={setIsQRDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-primary" />
              Pilih Kelas untuk Kartu QR
            </DialogTitle>
            <DialogDescription>
              Kartu QR akan diunduh dalam format PDF berisi identitas absensi mandiri siswa.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {loadingAsg ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" /></div>
            ) : uniqueClasses.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground italic">Anda belum memiliki penugasan kelas.</div>
            ) : (
              <ScrollArea className="max-h-[300px] border rounded-xl overflow-hidden">
                <div className="divide-y">
                  {uniqueClasses.map((cls) => (
                    <button
                      key={cls.id}
                      disabled={isProcessingQR}
                      onClick={() => handleDownloadSpecificClassQR(cls.id, cls.name)}
                      className="w-full flex items-center justify-between p-4 hover:bg-muted transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-primary/10 p-2 rounded-lg group-hover:bg-primary group-hover:text-white transition-colors">
                          <Users className="w-4 h-4" />
                        </div>
                        <span className="font-bold text-sm">Kelas {cls.name}</span>
                      </div>
                      <Download className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsQRDialogOpen(false)} disabled={isProcessingQR}>Batal</Button>
            {isProcessingQR && (
              <div className="flex items-center gap-2 text-xs text-primary font-bold animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin" /> Sedang Memproses PDF...
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return (
    <React.Suspense fallback={<div className="flex h-screen w-full items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <TeacherLayoutContent>{children}</TeacherLayoutContent>
    </React.Suspense>
  )
}
