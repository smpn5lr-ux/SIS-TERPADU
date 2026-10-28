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
import { InstallPWA, InstallPWABanner } from "@/components/InstallPWA"

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

  const semesterParam = searchParams.get('semester')
  const selectedSemester = semesterParam || config?.activeSemester?.toString() || "1"
  const teacherId = staffData?.[0]?.id

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

    const studentsSnap = await getDocs(query(collection(db, 'applicants'), where('admissionStatus', 'in', ['accepted', 'graduated'])))
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
      // Gunakan nama kelas asli dari database 'classes' agar selalu sinkron
      const targetClass = data.allClasses.find(c => c.id === asg?.classId)
      const displayClassName = targetClass ? targetClass.name : asg?.className || "-"

      let formattedDate = j.date
      if (j.date && j.date.includes('-')) {
        const parts = j.date.split('-')
        if (parts.length === 3) {
          formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`
        }
      }

      return { 
        "Mapel": asg?.subjectName, 
        "Kelas": displayClassName, 
        "Pertemuan": j.meetingNumber, 
        "Tgl": formattedDate, 
        "Metode": j.teachingMethod || "-",
        "Materi": j.material 
      }
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
    const processedSheetNames = new Set<string>()

    data.assignments.forEach(asg => {
      if (processedClassIds.has(asg.classId)) return
      processedClassIds.add(asg.classId)
      
      const targetClass = data.allClasses.find(c => c.id === asg.classId)
      if (!targetClass) return

      const classStudents = data.allStudents.filter(s => targetClass.students?.includes(s.id))
      const ws = XLSX.utils.json_to_sheet(classStudents.map((s, i) => ({ "No": i+1, "Nama": s.fullName, "NISN": s.NISN })))
      
      // Pastikan nama sheet unik dan tidak duplikat di file Excel
      let sheetName = `Kelas ${targetClass.name}`.substring(0, 31)
      if (processedSheetNames.has(sheetName)) {
        sheetName = `${sheetName.substring(0, 27)} (${asg.classId.substring(0, 2)})`
      }
      processedSheetNames.add(sheetName)
      
      XLSX.utils.book_append_sheet(wb, ws, sheetName)
    })
    XLSX.writeFile(wb, `Daftar_Siswa_Sem${selectedSemester}.xlsx`)
  }

  const handleDownloadSpecificClassQR = async (classId: string, className: string) => {
    if (!db) return
    setIsProcessingQR(true)
    
    try {
      const { default: jsPDF } = await import('jspdf')
      const brandBlue = [67, 97, 238] as [number, number, number]
      const schoolName = config?.schoolName || "SIS TERPADU"

      const classSnap = await getDocs(query(collection(db, 'classes'), where('__name__', '==', classId)))
      const targetClass = classSnap.docs[0]?.data() as Classroom
      
      if (!targetClass || !targetClass.students || targetClass.students.length === 0) {
        toast({ variant: "destructive", title: "Gagal", description: "Tidak ada murid terdaftar di kelas ini." })
        setIsProcessingQR(false)
        return
      }

      const studentIds = targetClass.students;
      const students: Applicant[] = [];
      
      for (let i = 0; i < studentIds.length; i += 30) {
        const chunk = studentIds.slice(i, i + 30);
        const q = query(collection(db, 'applicants'), where('__name__', 'in', chunk));
        const snap = await getDocs(q);
        students.push(...snap.docs.map(d => ({ id: d.id, ...d.data() } as Applicant)));
      }

      const activeStudents = students
        .filter(s => !s.isDeleted)
        .sort((a, b) => a.fullName.localeCompare(b.fullName))

      if (activeStudents.length === 0) {
        toast({ variant: "destructive", title: "Gagal", description: "Tidak ada murid aktif ditemukan." })
        setIsProcessingQR(false)
        return
      }

      const docPdf = new jsPDF('p', 'mm', 'a4')
      
      const getQrBase64 = async (id: string) => {
        const url = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${id}`;
        const res = await fetch(url);
        const blob = await res.blob();
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      };
      
      docPdf.setFontSize(14).setFont("helvetica", "bold").setTextColor(brandBlue[0], brandBlue[1], brandBlue[2])
      docPdf.text(`KARTU QR ABSENSI - KELAS ${className}`, 105, 15, { align: "center" })
      docPdf.setFontSize(10).setTextColor(100).setFont("helvetica", "normal")
      docPdf.text(`${schoolName}`, 105, 20, { align: "center" })
      docPdf.setDrawColor(200).setLineWidth(0.1).line(14, 25, 196, 25)

      let x = 12;
      let y = 35;
      const cardWidth = 60;
      const cardHeight = 80;
      const marginX = 6;
      const marginY = 8;

      for (const s of activeStudents) {
        docPdf.setDrawColor(230).setLineWidth(0.1).rect(x, y, cardWidth, cardHeight)
        docPdf.setFillColor(brandBlue[0], brandBlue[1], brandBlue[2]).rect(x, y, cardWidth, 6, 'F')
        docPdf.setFontSize(7).setFont("helvetica", "bold").setTextColor(0)
        const truncatedName = s.fullName.length > 25 ? s.fullName.substring(0, 22) + "..." : s.fullName
        docPdf.text(truncatedName.toUpperCase(), x + cardWidth/2, y + 14, { align: "center" })
        docPdf.setFontSize(6).setFont("helvetica", "normal").setTextColor(100)
        docPdf.text(`NISN: ${s.NISN || "-"}`, x + cardWidth/2, y + 19, { align: "center" })
        docPdf.setFontSize(6).setFont("helvetica", "bold").setTextColor(brandBlue[0], brandBlue[1], brandBlue[2])
        docPdf.text(`KELAS: ${className}`, x + cardWidth/2, y + 24, { align: "center" })
        
        const qrBase64 = await getQrBase64(s.id);
        docPdf.addImage(qrBase64, 'PNG', x + (cardWidth - 40) / 2, y + 28, 40, 40)

        docPdf.setFontSize(5).setTextColor(150).text("SCAN UNTUK ABSEN MANDIRI", x + cardWidth/2, y + cardHeight - 4, { align: "center" })

        x += cardWidth + marginX;
        if (x + cardWidth > 205) {
          x = 12;
          y += cardHeight + marginY;
        }
        if (y + cardHeight > 285) {
          docPdf.addPage()
          y = 15;
          x = 12;
        }
      }
      
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
                <p className="px-3 mb-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Utama</p>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      asChild 
                      isActive={pathname === '/teacher' && !semesterParam}
                    >
                      <Link href="/teacher" className="gap-3">
                        <LayoutDashboard className="w-5 h-5" />
                        <span>Dasbor</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </div>
              <div>
                <p className="px-3 mb-2 text-[10px] font-bold text-primary uppercase tracking-widest">Buku Nilai</p>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      asChild 
                      isActive={semesterParam === "1"}
                    >
                      <Link href="/teacher?semester=1" className="gap-3">
                        <CalendarDays className="w-5 h-5" />
                        <span>Semester 1</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      asChild 
                      isActive={semesterParam === "2"}
                    >
                      <Link href="/teacher?semester=2" className="gap-3">
                        <CalendarDays className="w-5 h-5" />
                        <span>Semester 2</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </div>
              <div>
                <p className="px-3 mb-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Unduh Laporan</p>
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
            <div className="flex items-center gap-4">
              <InstallPWA />
            </div>
          </header>
          <main className="flex-1 overflow-y-auto p-6 bg-background/50">
            <React.Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" /></div>}>
              {children}
            </React.Suspense>
          </main>
          <InstallPWABanner />
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
              <ScrollArea className="h-[350px] w-full border rounded-xl overflow-hidden bg-muted/5">
                <div className="divide-y">
                  {uniqueClasses.map((cls) => (
                    <button
                      key={cls.id}
                      disabled={isProcessingQR}
                      onClick={() => handleDownloadSpecificClassQR(cls.id, cls.name)}
                      className="w-full flex items-center justify-between p-4 hover:bg-primary/5 transition-colors group text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-primary/10 p-2.5 rounded-lg group-hover:bg-primary group-hover:text-white transition-all shadow-sm">
                          <Users className="w-4 h-4" />
                        </div>
                        <span className="font-bold text-sm tracking-tight text-foreground">Kelas {cls.name}</span>
                      </div>
                      <Download className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
          <DialogFooter className="border-t pt-4">
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
