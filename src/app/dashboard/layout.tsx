
"use client"

import * as React from "react"
import { 
  LayoutDashboard, 
  Users, 
  School, 
  BarChart3, 
  Settings,
  Bell,
  Search,
  UserCircle,
  LogOut,
  Loader2,
  Pencil,
  UserPlus,
  Menu,
  BookOpen,
  UserCheck,
  GraduationCap,
  CalendarClock,
  Contact,
  QrCode,
  Download,
  Trash2
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useAuth, useUser, useFirestore, useDoc, useMemoFirebase, useCollection } from "@/firebase"
import { signOut, updateProfile } from "firebase/auth"
import { doc, collection, query, where, getDocs } from "firebase/firestore"
import { useToast } from "@/hooks/use-toast"
import { Staff, Classroom, Applicant } from "@/lib/types"
import { ScrollArea } from "@/components/ui/scroll-area"

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const auth = useAuth()
  const db = useFirestore()
  const { toast } = useToast()
  const { user, loading: userLoading } = useUser()
  const { isMobile, setOpenMobile } = useSidebar()
  
  const [isProfileOpen, setIsProfileOpen] = React.useState(false)
  const [newName, setNewName] = React.useState("")
  const [updating, setUpdating] = React.useState(false)

  const [isQRDialogOpen, setIsQRDialogOpen] = React.useState(false)
  const [isProcessingQR, setIsProcessingQR] = React.useState(false)

  const settingsRef = useMemoFirebase(() => {
    if (!db) return null
    return doc(db, 'settings', 'system')
  }, [db])

  const { data: config } = useDoc<any>(settingsRef)

  const staffQuery = useMemoFirebase(() => {
    if (!db || !user?.email) return null
    return query(collection(db, 'staff'), where('email', '==', user.email))
  }, [db, user])

  const { data: staffData, loading: staffLoading } = useCollection<Staff>(staffQuery)

  const classesQuery = useMemoFirebase(() => {
    // PROTEKSI: Jangan query kelas sampai auth siap untuk menghindari Permission Denied
    if (!db || userLoading || !user) return null
    return collection(db, 'classes')
  }, [db, user, userLoading])
  const { data: allClasses, loading: loadingClasses } = useCollection<Classroom>(classesQuery)

  React.useEffect(() => {
    if (!userLoading && !user) {
      router.push('/login')
    }
    if (user) {
      setNewName(user.displayName || "")
    }
    if (!staffLoading && staffData && staffData.length > 0) {
      const role = staffData[0].role
      if (role === 'Guru' && !pathname.startsWith('/teacher')) {
        router.push('/teacher')
      }
    }
  }, [user, userLoading, staffLoading, staffData, router, pathname])

  const handleLogout = async () => {
    try {
      await signOut(auth)
      router.push('/login')
    } catch (error) {
      console.error("Logout error", error)
    }
  }

  const handleUpdateName = async () => {
    if (!user || !newName.trim() || updating) return
    setUpdating(true)
    try {
      await updateProfile(user, { displayName: newName.trim() })
      toast({
        title: "Profil Diperbarui",
        description: "Nama tampilan Anda berhasil diubah.",
      })
      setIsProfileOpen(false)
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Gagal Memperbarui",
        description: "Terjadi kesalahan saat mengubah nama.",
      })
    } finally {
      setUpdating(false)
    }
  }

  const handleDownloadSpecificClassQR = async (classId: string, className: string) => {
    if (!db) return
    setIsProcessingQR(true)
    
    try {
      const { default: jsPDF } = await import('jspdf')
      const brandBlue = [67, 97, 238] as [number, number, number]
      const schoolName = config?.schoolName || "SIS TERPADU"

      const targetClass = allClasses?.find(c => c.id === classId)
      
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

  const handleMenuClick = () => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  if (userLoading || staffLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!user) return null

  const appName = config?.appName || "SIS TERPADU"
  const appLogoUrl = config?.appLogoUrl || "/icon-logo.webp"
  
  const userRole = staffData?.[0]?.role || 'Administrator'
  const isKurikulum = userRole === 'Kurikulum' || userRole === 'Admin'

  const academicNav = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Data Induk Siswa', href: '/dashboard/students', icon: Contact },
    { name: 'Manajemen Kelas', href: '/dashboard/classes', icon: School },
    { name: 'Kurikulum & Mapel', href: '/dashboard/subjects', icon: BookOpen },
    { name: 'Penugasan Guru', href: '/dashboard/assignments', icon: UserCheck },
    ...(isKurikulum ? [{ name: 'Manajemen Roster', href: '/dashboard/roster', icon: CalendarClock }] : []),
    { name: 'Manajemen Pegawai', href: '/dashboard/staff', icon: UserPlus },
    { name: 'Laporan', href: '/dashboard/reports', icon: BarChart3 },
    { name: 'Tempat Sampah', href: '/dashboard/trash', icon: Trash2 },
  ]

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar className="border-r border-border">
        <SidebarHeader className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 overflow-hidden shrink-0 bg-transparent">
              {appLogoUrl ? (
                <img src={appLogoUrl} alt="App Logo" className="w-full h-full object-contain bg-transparent" />
              ) : (
                <div className="bg-primary p-2 rounded-lg shadow-lg shadow-primary/20 flex items-center justify-center w-full h-full">
                  <GraduationCap className="w-6 h-6 text-primary-foreground" />
                </div>
              )}
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="font-headline font-bold text-lg tracking-tight uppercase line-clamp-1">{appName}</span>
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{userRole}</span>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent className="px-2 py-4">
          <div className="space-y-6">
            <div>
              <p className="px-3 mb-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Sistem Informasi Sekolah</p>
              <SidebarMenu>
                {academicNav.map((item) => (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton 
                      asChild 
                      isActive={pathname === item.href || pathname?.startsWith(item.href + '/')}
                      tooltip={item.name}
                      className="h-10"
                    >
                      <Link 
                        href={item.href} 
                        className="flex items-center gap-3 w-full"
                        onClick={handleMenuClick}
                      >
                        <item.icon className="w-4 h-4" />
                        <span className="font-medium text-sm">{item.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </div>

            {isKurikulum && (
              <div>
                <p className="px-3 mb-2 text-[10px] font-bold text-primary uppercase tracking-widest">Utilitas Cetak</p>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      onClick={() => setIsQRDialogOpen(true)}
                      className="h-10 gap-3"
                    >
                      <QrCode className="w-4 h-4 text-accent" />
                      <span className="font-medium text-sm">Kartu QR Absensi</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </div>
            )}
          </div>
        </SidebarContent>
        <SidebarFooter className="p-4 mt-auto border-t border-border">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton 
                asChild 
                isActive={pathname === '/dashboard/settings'}
                className="h-11"
              >
                <Link 
                  href="/dashboard/settings" 
                  className="flex items-center gap-3 w-full"
                  onClick={handleMenuClick}
                >
                  <Settings className="w-5 h-5" />
                  <span className="font-medium">Pengaturan Sistem</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton 
                onClick={handleLogout}
                className="h-11 text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <div className="flex items-center gap-3 w-full">
                  <LogOut className="w-5 h-5" />
                  <span className="font-medium">Keluar</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      
      <SidebarInset className="flex flex-col flex-1 overflow-hidden">
        <header className="h-16 border-b border-border flex items-center justify-between px-6 bg-card/40 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <SidebarTrigger className="lg:hidden">
              <Menu className="w-5 h-5" />
            </SidebarTrigger>
            <div className="hidden md:flex items-center bg-muted/30 px-3 py-1.5 rounded-full border border-border/50 w-80">
              <Search className="w-4 h-4 text-muted-foreground mr-2" />
              <input 
                placeholder="Cari Data Sistem..." 
                className="bg-transparent border-none text-sm focus:outline-none w-full placeholder:text-muted-foreground/50"
              />
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground">
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-destructive rounded-full border-2 border-background"></span>
            </Button>
            <div className="h-8 w-px bg-border"></div>
            
            <div 
              className="flex items-center gap-3 pl-2 cursor-pointer hover:bg-muted/30 p-1.5 rounded-lg transition-colors group"
              onClick={() => setIsProfileOpen(true)}
            >
              <div className="flex flex-col items-end hidden sm:flex">
                <span className="text-sm font-semibold group-hover:text-primary transition-colors">
                  {user?.displayName || 'Admin'}
                </span>
                <span className="text-[10px] text-primary font-bold uppercase tracking-widest">{userRole}</span>
              </div>
              <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary overflow-hidden relative">
                {user?.photoURL ? (
                  <img src={user.photoURL} alt="profil" className="w-full h-full object-cover" />
                ) : (
                  <UserCircle className="w-6 h-6" />
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <Pencil className="w-3 h-3 text-white" />
                </div>
              </div>
            </div>
          </div>
        </header>
        
        <main className="flex-1 overflow-y-auto p-6 bg-background/50">
          {children}
        </main>
      </SidebarInset>

      <Dialog open={isQRDialogOpen} onOpenChange={setIsQRDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-primary" />
              Cetak Kartu QR Siswa
            </DialogTitle>
            <DialogDescription>
              Pilih rombongan belajar untuk mengunduh seluruh kartu QR identitas absensi mandiri.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {loadingClasses ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" /></div>
            ) : !allClasses || allClasses.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground italic">Belum ada data kelas yang terdaftar.</div>
            ) : (
              <ScrollArea className="h-[350px] w-full border rounded-xl overflow-hidden bg-muted/5">
                <div className="divide-y">
                  {[...allClasses].sort((a,b) => a.name.localeCompare(b.name, undefined, {numeric: true})).map((cls) => (
                    <button
                      key={cls.id}
                      disabled={isProcessingQR}
                      onClick={() => handleDownloadSpecificClassQR(cls.id, cls.name)}
                      className="w-full flex items-center justify-between p-4 hover:bg-primary/5 transition-colors group text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-primary/10 p-2.5 rounded-lg group-hover:bg-primary group-hover:text-white transition-all shadow-sm">
                          <School className="w-4 h-4" />
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
                <Loader2 className="w-3 h-3 animate-spin" /> Membuat PDF...
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isProfileOpen} onOpenChange={setIsProfileOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Ubah Nama Profil</DialogTitle>
            <DialogDescription>
              Ubah nama tampilan administrator Anda di sistem.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nama Lengkap</Label>
              <Input
                id="name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Masukkan nama baru..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsProfileOpen(false)}>Batal</Button>
            <Button onClick={handleUpdateName} disabled={updating}>
              {updating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Simpan Perubahan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </SidebarProvider>
  )
}
