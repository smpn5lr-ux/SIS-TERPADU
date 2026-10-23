
"use client"

import { useState, useMemo } from 'react'
import { 
  UserPlus, 
  Trash2, 
  Mail, 
  Phone, 
  ShieldCheck, 
  Search, 
  Loader2,
  ShieldAlert,
  GraduationCap,
  Info,
  Lock,
  Eye,
  EyeOff,
  Pencil,
  KeyRound,
  CheckCircle2,
  Hash
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { useCollection, useFirestore, useMemoFirebase, useAuth } from '@/firebase'
import { collection, query, orderBy, addDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore'
import { Staff } from '@/lib/types'
import { useToast } from '@/hooks/use-toast'
import { errorEmitter } from '@/firebase/error-emitter'
import { FirestorePermissionError } from '@/firebase/errors'
import { initializeApp, deleteApp, getApps } from "firebase/app"
import { getAuth, createUserWithEmailAndPassword, updateProfile, signOut, sendPasswordResetEmail } from "firebase/auth"
import { firebaseConfig } from "@/firebase/config"

const staffFormSchema = z.object({
  fullName: z.string().min(2, "Nama minimal 2 karakter"),
  email: z.string().email("Format email tidak valid"),
  password: z.string().optional(),
  role: z.enum(['Admin', 'Pegawai', 'Guru', 'Kurikulum']),
  phone: z.string().optional(),
  staffNumber: z.coerce.number().min(1, "Nomor minimal 1"),
})

export default function StaffManagementPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null)
  const [staffToDelete, setStaffToDelete] = useState<Staff | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [isResetingPassword, setIsResetingPassword] = useState(false)
  
  const { toast } = useToast()
  const db = useFirestore()
  const mainAuth = useAuth()

  const staffQuery = useMemoFirebase(() => {
    if (!db) return null
    return query(collection(db, 'staff'))
  }, [db])

  const { data: staffList, loading } = useCollection<Staff>(staffQuery)

  const form = useForm<z.infer<typeof staffFormSchema>>({
    resolver: zodResolver(staffFormSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      role: "Pegawai",
      phone: "",
      staffNumber: 1
    },
  })

  const filteredStaff = useMemo(() => {
    if (!staffList) return []
    return [...staffList]
      .filter(s => 
        (s.fullName || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
        (s.email || "").toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => (a.staffNumber || 999) - (b.staffNumber || 999))
  }, [staffList, searchTerm])

  const handleUpdateNumber = async (staff: Staff, newNumStr: string) => {
    const newNum = parseInt(newNumStr)
    if (isNaN(newNum) || newNum === staff.staffNumber) return;
    
    // Validasi Duplikasi
    const isDuplicate = staffList?.some(s => s.id !== staff.id && s.staffNumber === newNum);
    if (isDuplicate) {
      toast({ 
        variant: "destructive", 
        title: "Nomor Ganda", 
        description: `Nomor ${newNum} sudah digunakan oleh pegawai lain.` 
      });
      return;
    }

    try {
      await updateDoc(doc(db, 'staff', staff.id), { staffNumber: newNum });
      toast({ title: "Nomor Berhasil Diperbarui" });
    } catch (e) {
      toast({ variant: "destructive", title: "Gagal Memperbarui Nomor" });
    }
  }

  const handleEdit = (staff: Staff) => {
    setEditingStaff(staff)
    form.reset({
      fullName: staff.fullName,
      email: staff.email,
      role: staff.role,
      phone: staff.phone || "",
      password: "",
      staffNumber: staff.staffNumber || 1
    })
    setIsDialogOpen(true)
  }

  const handleAddNew = () => {
    setEditingStaff(null)
    const nextNum = Math.max(0, ...(staffList?.map(s => s.staffNumber || 0) || [])) + 1;
    form.reset({
      fullName: "",
      email: "",
      password: "",
      role: "Pegawai",
      phone: "",
      staffNumber: nextNum
    })
    setIsDialogOpen(true)
  }

  const handleResetPassword = async (email: string) => {
    if (!email) return
    setIsResetingPassword(true)
    try {
      await sendPasswordResetEmail(mainAuth, email)
      toast({
        title: "Email Reset Terkirim",
        description: `Link untuk menyetel ulang kata sandi telah dikirim ke ${email}.`,
      })
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal Mengirim Email",
        description: error.message || "Pastikan format email benar.",
      })
    } finally {
      setIsResetingPassword(false)
    }
  }

  const onSubmit = async (values: z.infer<typeof staffFormSchema>) => {
    if (!db || submitting) return
    setSubmitting(true)

    // Validasi Nomor Ganda sebelum Simpan
    const isDuplicateNum = staffList?.some(s => (!editingStaff || s.id !== editingStaff.id) && s.staffNumber === values.staffNumber);
    if (isDuplicateNum) {
      toast({ variant: "destructive", title: "Nomor Ganda", description: "Nomor ini sudah digunakan pegawai lain." })
      setSubmitting(false)
      return
    }

    if (editingStaff) {
      try {
        const staffRef = doc(db, 'staff', editingStaff.id)
        await updateDoc(staffRef, {
          fullName: values.fullName,
          role: values.role,
          phone: values.phone || "",
          staffNumber: values.staffNumber,
          updatedAt: new Date().toISOString(),
        })
        toast({ title: "Data Diperbarui", description: `Profil ${values.fullName} berhasil disimpan.` })
        setIsDialogOpen(false)
      } catch (error) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: `staff/${editingStaff.id}`,
          operation: 'update',
        }))
      } finally {
        setSubmitting(false)
      }
      return
    }
    
    if (!values.password || values.password.length < 6) {
      toast({ variant: "destructive", title: "Sandi Kurang", description: "Sandi baru minimal 6 karakter." })
      setSubmitting(false)
      return
    }

    const secondaryAppName = `SecondaryApp_${Date.now()}`
    let secondaryApp = null
    
    try {
      secondaryApp = initializeApp(firebaseConfig, secondaryAppName)
      const secondaryAuth = getAuth(secondaryApp)
      
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, values.email, values.password)
      await updateProfile(userCredential.user, { displayName: values.fullName })
      
      const newStaff = {
        fullName: values.fullName,
        email: values.email,
        role: values.role,
        phone: values.phone || "",
        staffNumber: values.staffNumber,
        createdAt: new Date().toISOString(),
      }
      
      await addDoc(collection(db, 'staff'), newStaff)
      await signOut(secondaryAuth)
      
      toast({
        title: "Pegawai Berhasil Terdaftar",
        description: `${values.fullName} sekarang dapat login dengan email dan sandi tersebut.`,
      })
      
      setIsDialogOpen(false)
      form.reset()
    } catch (error: any) {
      let message = "Gagal mendaftarkan pegawai."
      if (error.code === 'auth/email-already-in-use') message = "Email sudah terdaftar."
      toast({ variant: "destructive", title: "Pendaftaran Gagal", description: message })
    } finally {
      if (secondaryApp) await deleteApp(secondaryApp)
      setSubmitting(false)
    }
  }

  const handleDeleteStaffConfirm = (staff: Staff) => {
    setStaffToDelete(staff)
    setIsDeleteDialogOpen(true)
  }

  const executeDeleteStaff = async () => {
    if (!db || !staffToDelete) return
    try {
      await deleteDoc(doc(db, 'staff', staffToDelete.id))
      toast({ title: "Akses Dicabut", description: "Data pegawai telah dihapus dari sistem." })
      setStaffToDelete(null)
    } catch (error) {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: `staff/${staffToDelete.id}`,
        operation: 'delete',
      }))
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Manajemen Pegawai</h1>
          <p className="text-muted-foreground mt-1">Kelola akun staf dan guru serta izin operasional sistem.</p>
        </div>
        <Button onClick={handleAddNew} className="gap-2 shadow-lg shadow-primary/20">
          <UserPlus className="w-4 h-4" /> Tambah Pegawai
        </Button>
      </div>

      <Card className="border-border/50 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border/50 bg-muted/10 flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Cari Nama atau Email..." 
              className="pl-9 bg-card" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <Table>
          <TableHeader className="bg-primary/5">
            <TableRow>
              <TableHead className="font-bold text-primary w-[80px]">No (Kode)</TableHead>
              <TableHead className="font-bold text-primary">Pegawai</TableHead>
              <TableHead className="font-bold text-primary">Email & Kontak</TableHead>
              <TableHead className="font-bold text-primary">Hak Akses</TableHead>
              <TableHead className="font-bold text-primary">Terdaftar</TableHead>
              <TableHead className="text-right font-bold text-primary">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></TableCell></TableRow>
            ) : filteredStaff.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground italic">Tidak ada pegawai ditemukan.</TableCell></TableRow>
            ) : filteredStaff.map((staff) => (
              <TableRow key={staff.id} className="hover:bg-muted/10 transition-colors">
                <TableCell>
                   <Input 
                     type="text" 
                     inputMode="numeric"
                     className="w-16 h-9 text-center font-bold text-primary border-primary/20 focus:border-primary transition-all"
                     defaultValue={staff.staffNumber || ""}
                     onBlur={(e) => handleUpdateNumber(staff, e.target.value)}
                   />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                      {(staff.fullName || "P").charAt(0)}
                    </div>
                    <div>
                      <div className="font-medium">{staff.fullName}</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                        {staff.role === 'Guru' ? 'PENGAJAR' : staff.role === 'Kurikulum' ? 'BAGIAN KURIKULUM' : 'STAF SEKOLAH'}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-sm">
                      <Mail className="w-3 h-3 text-muted-foreground" /> {staff.email}
                    </div>
                    {staff.phone && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Phone className="w-3 h-3" /> {staff.phone}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={staff.role === 'Admin' ? 'default' : staff.role === 'Guru' || staff.role === 'Kurikulum' ? 'secondary' : 'outline'} className="text-[10px] font-bold uppercase">
                    {staff.role === 'Guru' || staff.role === 'Kurikulum' ? <GraduationCap className="w-3 h-3 mr-1" /> : <ShieldCheck className="w-3 h-3 mr-1" />}
                    {staff.role}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {staff.createdAt ? new Date(staff.createdAt).toLocaleDateString('id-ID') : '-'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      title="Ubah Data"
                      className="hover:text-primary"
                      onClick={() => handleEdit(staff)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      title="Reset Password"
                      className="hover:text-amber-500"
                      onClick={() => handleResetPassword(staff.email)}
                    >
                      <KeyRound className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      title="Hapus Akun"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => handleDeleteStaffConfirm(staff)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle>{editingStaff ? 'Ubah Data Pegawai' : 'Pendaftaran Pegawai Baru'}</DialogTitle>
            <DialogDescription>
              {editingStaff ? 'Sesuaikan informasi profil pegawai bersangkutan.' : 'Masukkan biodata dan buatkan kata sandi akun sistem.'}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] px-6 py-2">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pb-6">
                <div className="grid grid-cols-3 gap-4 items-end">
                   <FormField control={form.control} name="staffNumber" render={({ field }) => (
                    <FormItem className="col-span-1">
                      <FormLabel className="flex items-center gap-1"><Hash className="w-3 h-3" /> No. Urut</FormLabel>
                      <FormControl><Input type="number" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="fullName" render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Nama Lengkap</FormLabel>
                      <FormControl><Input placeholder="Contoh: Ahmad Sulaiman" {...field} value={field.value || ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Login</FormLabel>
                    <FormControl>
                      <Input 
                        type="email" 
                        placeholder="anda@sekolah.sch.id" 
                        disabled={!!editingStaff}
                        {...field} 
                        value={field.value || ""}
                      />
                    </FormControl>
                    {editingStaff && <p className="text-[10px] text-muted-foreground italic">Email tidak dapat diubah setelah terdaftar.</p>}
                    <FormMessage />
                  </FormItem>
                )} />
                
                {!editingStaff && (
                  <FormField control={form.control} name="password" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kata Sandi Akun</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input 
                            type={showPassword ? "text" : "password"} 
                            placeholder="Min. 6 Karakter" 
                            className="pr-10"
                            {...field} 
                            value={field.value || ""}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}

                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nomor Telepon (Opsional)</FormLabel>
                    <FormControl><Input placeholder="0812xxxx" {...field} value={field.value || ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="role" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hak Akses (Role)</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Pilih Role" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Admin">Admin (Penuh)</SelectItem>
                        <SelectItem value="Kurikulum">Kurikulum (Jadwal & Akademik)</SelectItem>
                        <SelectItem value="Pegawai">Pegawai (Operasional)</SelectItem>
                        <SelectItem value="Guru">Guru (Pengajar & Nilai)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                {editingStaff ? (
                  <div className="bg-amber-500/5 p-4 rounded-xl border border-amber-500/20 space-y-3">
                    <div className="flex items-center gap-2 text-amber-600">
                      <KeyRound className="w-4 h-4" />
                      <span className="text-xs font-bold uppercase tracking-wider">Keamanan Akun</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed italic">
                      Untuk keamanan, Anda tidak dapat melihat atau mengetik sandi secara langsung. Klik tombol di bawah untuk mengirim link penyetelan ulang ke email pegawai.
                    </p>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm" 
                      className="w-full text-[10px] h-8 gap-2 border-amber-500/20 text-amber-600 hover:bg-amber-500/5"
                      onClick={() => handleResetPassword(editingStaff.email)}
                      disabled={isResetingPassword}
                    >
                      {isResetingPassword ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                      Kirim Link Reset Password
                    </Button>
                  </div>
                ) : (
                  <div className="bg-primary/5 p-3 rounded-lg border border-primary/20 flex gap-3">
                    <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <p className="text-[10px] text-muted-foreground leading-relaxed italic">
                      Akun akan langsung aktif di sistem Authentication. Berikan email dan sandi di atas kepada pegawai bersangkutan.
                    </p>
                  </div>
                )}
              </form>
            </Form>
          </ScrollArea>
          <DialogFooter className="p-6 pt-2 border-t bg-muted/10">
            <Button onClick={form.handleSubmit(onSubmit)} disabled={submitting} className="w-full">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              {editingStaff ? 'Simpan Perubahan' : 'Buat Akun & Simpan Pegawai'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-destructive" /> Cabut Akses Pegawai?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus akses untuk <strong>{staffToDelete?.fullName}</strong>? Pegawai ini tidak akan bisa masuk ke sistem lagi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={executeDeleteStaff} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Ya, Cabut Akses
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
