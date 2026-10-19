
"use client"

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { 
  ArrowLeft, 
  Save, 
  Loader2, 
  User, 
  Home, 
  Users, 
  Info,
  CheckCircle2,
  Trash2,
  ShieldAlert
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase'
import { doc, updateDoc } from 'firebase/firestore'
import { Applicant } from '@/lib/types'
import { useToast } from '@/hooks/use-toast'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"

const formSchema = z.object({
  fullName: z.string().min(2, "Nama minimal 2 karakter"),
  gender: z.enum(['Laki-laki', 'Perempuan']),
  NISN: z.string().optional(),
  NIK: z.string().optional(),
  birthPlace: z.string().optional(),
  birthDate: z.string().optional(),
  religion: z.string().optional(),
  address: z.string().optional(),
  rt: z.string().optional(),
  rw: z.string().optional(),
  kelurahan: z.string().optional(),
  kecamatan: z.string().optional(),
  propinsi: z.string().optional(),
  livingWith: z.enum(['Bersama Orang Tua', 'Wali', 'Asrama', 'Kos']),
  transportation: z.enum(['Jalan Kaki', 'Motor', 'Mobil', 'Angkot/Kendaraan Umum']),
  studentPhone: z.string().optional(),
  fatherName: z.string().optional(),
  fatherJob: z.string().optional(),
  motherName: z.string().optional(),
  motherJob: z.string().optional(),
})

export default function EditStudentPage() {
  const { id } = useParams()
  const router = useRouter()
  const db = useFirestore()
  const { toast } = useToast()
  const [isSaving, setIsSaving] = useState(false)

  const studentRef = useMemoFirebase(() => {
    if (!db || !id) return null
    return doc(db, 'applicants', id as string)
  }, [db, id])

  const { data: student, loading } = useDoc<Applicant>(studentRef)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: "", gender: "Laki-laki", NISN: "", NIK: "",
      birthPlace: "", birthDate: "", religion: "Katolik",
      address: "", rt: "", rw: "", kelurahan: "", kecamatan: "", propinsi: "Jawa Barat",
      livingWith: "Bersama Orang Tua", transportation: "Jalan Kaki",
      studentPhone: "", fatherName: "", fatherJob: "", motherName: "", motherJob: ""
    },
  })

  useEffect(() => {
    if (student) {
      form.reset({
        ...student,
      } as any)
    }
  }, [student, form])

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!studentRef) return
    setIsSaving(true)
    try {
      await updateDoc(studentRef, {
        ...values,
        updatedAt: new Date().toISOString()
      })
      toast({ title: "Perubahan Disimpan", description: "Data murid berhasil diperbarui di database." })
      router.push('/dashboard/students')
    } catch (e) {
      toast({ variant: "destructive", title: "Gagal Menyimpan", description: "Terjadi kesalahan saat memperbarui database." })
    } finally {
      setIsSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="animate-spin text-primary w-8 h-8" /></div>
  if (!student) return <div className="text-center py-24 text-muted-foreground">Data murid tidak ditemukan.</div>

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full border"><ArrowLeft className="w-4 h-4" /></Button>
          <div>
            <h1 className="text-3xl font-headline font-bold">Edit Data Murid</h1>
            <p className="text-muted-foreground text-sm">Sesuaikan informasi biodata lengkap siswa.</p>
          </div>
        </div>
        <Button onClick={form.handleSubmit(onSubmit)} disabled={isSaving} className="gap-2 shadow-lg shadow-primary/20">
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Simpan Permanen
        </Button>
      </div>

      <Card className="border-border/50 shadow-md">
        <CardHeader className="bg-muted/10 border-b">
          <div className="flex items-center gap-3">
             <div className="bg-primary/10 p-2 rounded-lg"><User className="w-5 h-5 text-primary" /></div>
             <div>
                <CardTitle className="text-lg">Formulir Dapodik</CardTitle>
                <CardDescription>Murid: {student.fullName}</CardDescription>
             </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <Tabs defaultValue="pribadi" className="w-full">
                <TabsList className="grid w-full grid-cols-3 bg-muted/20 border-b rounded-none h-14 p-1">
                  <TabsTrigger value="pribadi" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">Identitas Pribadi</TabsTrigger>
                  <TabsTrigger value="alamat" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">Domisili</TabsTrigger>
                  <TabsTrigger value="ortu" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">Orang Tua</TabsTrigger>
                </TabsList>
                
                <div className="p-8">
                  <TabsContent value="pribadi" className="space-y-6 mt-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField control={form.control} name="fullName" render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel>Nama Lengkap</FormLabel>
                          <FormControl><Input placeholder="Sesuai Akta Kelahiran" {...field} value={field.value || ""} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="gender" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Jenis Kelamin</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="Laki-laki">Laki-laki</SelectItem>
                              <SelectItem value="Perempuan">Perempuan</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="religion" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Agama</FormLabel>
                          <FormControl><Input {...field} value={field.value || ""} /></FormControl>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="NISN" render={({ field }) => (
                        <FormItem>
                          <FormLabel>NISN</FormLabel>
                          <FormControl><Input className="font-mono" {...field} value={field.value || ""} /></FormControl>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="NIK" render={({ field }) => (
                        <FormItem>
                          <FormLabel>NIK</FormLabel>
                          <FormControl><Input className="font-mono" {...field} value={field.value || ""} /></FormControl>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="birthPlace" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tempat Lahir</FormLabel>
                          <FormControl><Input {...field} value={field.value || ""} /></FormControl>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="birthDate" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tanggal Lahir</FormLabel>
                          <FormControl><Input type="date" {...field} value={field.value || ""} /></FormControl>
                        </FormItem>
                      )} />
                    </div>
                  </TabsContent>

                  <TabsContent value="alamat" className="space-y-6 mt-0">
                    <FormField control={form.control} name="address" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Alamat Lengkap</FormLabel>
                        <FormControl><Input placeholder="Nama Jalan, Blok, No. Rumah" {...field} value={field.value || ""} /></FormControl>
                      </FormItem>
                    )} />
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <FormField control={form.control} name="rt" render={({ field }) => (
                        <FormItem><FormLabel>RT</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="rw" render={({ field }) => (
                        <FormItem><FormLabel>RW</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="kelurahan" render={({ field }) => (
                        <FormItem className="md:col-span-2"><FormLabel>Desa / Kelurahan</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl></FormItem>
                      )} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField control={form.control} name="kecamatan" render={({ field }) => (
                        <FormItem><FormLabel>Kecamatan</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="propinsi" render={({ field }) => (
                        <FormItem><FormLabel>Provinsi</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl></FormItem>
                      )} />
                    </div>
                    <Separator />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField control={form.control} name="transportation" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Transportasi</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="Jalan Kaki">Jalan Kaki</SelectItem>
                              <SelectItem value="Motor">Motor</SelectItem>
                              <SelectItem value="Mobil">Mobil</SelectItem>
                              <SelectItem value="Angkot/Kendaraan Umum">Angkot/Kendaraan Umum</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="studentPhone" render={({ field }) => (
                        <FormItem><FormLabel>No. HP Siswa</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl></FormItem>
                      )} />
                    </div>
                  </TabsContent>

                  <TabsContent value="ortu" className="space-y-8 mt-0">
                    <div className="p-4 bg-muted/20 rounded-xl border border-border/50">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-primary mb-4 flex items-center gap-2"><Users className="w-3 h-3" /> Data Ayah</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField control={form.control} name="fatherName" render={({ field }) => (
                          <FormItem><FormLabel>Nama Ayah</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl></FormItem>
                        )} />
                        <FormField control={form.control} name="fatherJob" render={({ field }) => (
                          <FormItem><FormLabel>Pekerjaan Ayah</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl></FormItem>
                        )} />
                      </div>
                    </div>
                    <div className="p-4 bg-muted/20 rounded-xl border border-border/50">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-accent mb-4 flex items-center gap-2"><Users className="w-3 h-3" /> Data Ibu</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField control={form.control} name="motherName" render={({ field }) => (
                          <FormItem><FormLabel>Nama Ibu</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl></FormItem>
                        )} />
                        <FormField control={form.control} name="motherJob" render={({ field }) => (
                          <FormItem><FormLabel>Pekerjaan Ibu</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl></FormItem>
                        )} />
                      </div>
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
              <div className="p-8 bg-muted/5 border-t flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => router.back()}>Batal</Button>
                <Button type="submit" disabled={isSaving} className="min-w-[150px]">
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                  Simpan Perubahan
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
