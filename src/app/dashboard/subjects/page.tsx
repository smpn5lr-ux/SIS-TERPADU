
"use client"

import { useState, useMemo, useEffect } from 'react'
import { 
  Plus, 
  BookOpen, 
  Trash2, 
  Loader2, 
  Pencil, 
  Layers, 
  BookMarked, 
  Hash, 
  AlertCircle, 
  CheckCircle2,
  CloudUpload,
  CloudOff,
  RefreshCw,
  Info,
  ShieldAlert
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase'
import { collection, addDoc, doc, deleteDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { Subject } from '@/lib/types'
import { useToast } from '@/hooks/use-toast'
import { Badge } from "@/components/ui/badge"

const subjectSchema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter"),
  code: z.string().min(2, "Kode minimal 2 karakter"),
  grades: z.array(z.string()).min(1, "Pilih minimal satu tingkat"),
})

export default function SubjectsPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  
  const [localSubjects, setLocalSubjects] = useState<Subject[]>([])
  const [isDirty, setIsDirty] = useState(false)

  const [subjectToDelete, setSubjectToDelete] = useState<Subject | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  const { toast } = useToast()
  const db = useFirestore()

  const subjectsQuery = useMemoFirebase(() => {
    if (!db) return null
    return collection(db, 'subjects')
  }, [db])

  const { data: serverSubjects, loading } = useCollection<Subject>(subjectsQuery)

  useEffect(() => {
    if (serverSubjects && !isDirty) {
      setLocalSubjects(serverSubjects)
    }
  }, [serverSubjects, isDirty])

  const sortedSubjects = useMemo(() => {
    return [...localSubjects].sort((a, b) => a.name.localeCompare(b.name))
  }, [localSubjects])

  const form = useForm<z.infer<typeof subjectSchema>>({
    resolver: zodResolver(subjectSchema),
    defaultValues: { name: "", code: "", grades: ["7"] },
  })

  const handleSaveLocal = (values: z.infer<typeof subjectSchema>) => {
    const payload = { 
      id: editingSubject ? editingSubject.id : `temp-${Date.now()}`,
      name: values.name, 
      code: values.code, 
      grades: values.grades.map(Number).sort((a, b) => a - b) 
    } as Subject

    if (editingSubject) {
      setLocalSubjects(prev => prev.map(s => s.id === editingSubject.id ? payload : s))
    } else {
      setLocalSubjects(prev => [...prev, payload])
    }

    setIsDirty(true)
    setIsDialogOpen(false)
    form.reset()
    toast({ title: "Mapel Ditambahkan ke Draf", description: "Jangan lupa klik Sinkron untuk menyimpan." })
  }

  const handleDeleteTrigger = (sub: Subject) => {
    setSubjectToDelete(sub)
    setIsDeleteDialogOpen(true)
  }

  const executeDeleteLocal = () => {
    if (!subjectToDelete) return
    setLocalSubjects(prev => prev.filter(s => s.id !== subjectToDelete.id))
    setIsDirty(true)
    setIsDeleteDialogOpen(false)
    setSubjectToDelete(null)
  }

  const handleEditLocal = (sub: Subject) => {
    setEditingSubject(sub)
    form.reset({ 
      name: sub.name, 
      code: sub.code, 
      grades: sub.grades.map(String) 
    })
    setIsDialogOpen(true)
  }

  const handleSyncToCloud = async () => {
    if (!db || !serverSubjects) return
    setIsSyncing(true)
    const batch = writeBatch(db)

    try {
      const toDelete = serverSubjects.filter(ss => !localSubjects.some(ls => ls.id === ss.id))
      toDelete.forEach(s => batch.delete(doc(db, 'subjects', s.id)))

      localSubjects.forEach(ls => {
        if (ls.id.startsWith('temp-')) {
          const { id, ...data } = ls
          batch.set(doc(collection(db, 'subjects')), data)
        } else {
          const serverVer = serverSubjects.find(ss => ss.id === ls.id)
          if (JSON.stringify(serverVer) !== JSON.stringify(ls)) {
            batch.update(doc(db, 'subjects', ls.id), ls as any)
          }
        }
      })

      await batch.commit()
      setIsDirty(false)
      toast({ title: "Kurikulum Berhasil Diperbarui" })
    } catch (e) {
      toast({ variant: "destructive", title: "Gagal Sinkronisasi" })
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Kurikulum & Mapel</h1>
          <div className="flex items-center gap-2 mt-1">
             <p className="text-muted-foreground text-sm">Daftar induk mata pelajaran sekolah.</p>
             {isDirty ? (
               <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse gap-1"><CloudOff className="w-3 h-3" /> Ada Draf Baru</Badge>
             ) : (
               <Badge className="bg-green-500/10 text-green-500 border-green-500/20 gap-1"><CheckCircle2 className="w-3 h-3" /> Terkoneksi</Badge>
             )}
          </div>
        </div>
        <div className="flex gap-2">
          {isDirty && (
            <Button onClick={handleSyncToCloud} disabled={isSyncing} className="bg-green-600 hover:bg-green-700 shadow-lg shadow-green-500/20 gap-2">
              {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
              Sinkronkan ke Cloud
            </Button>
          )}
          <Button onClick={() => { setEditingSubject(null); form.reset(); setIsDialogOpen(true); }} className="gap-2 shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4" /> Tambah Mapel
          </Button>
        </div>
      </div>

      <Card className="border-border/50 overflow-hidden shadow-sm">
        <Table>
          <TableHeader className="bg-primary/5">
            <TableRow>
              <TableHead className="font-bold text-primary w-[150px]">Kode</TableHead>
              <TableHead className="font-bold text-primary">Nama Mata Pelajaran</TableHead>
              <TableHead className="font-bold text-primary">Tersedia untuk Tingkat</TableHead>
              <TableHead className="text-right font-bold text-primary">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !localSubjects.length ? (
              <TableRow><TableCell colSpan={4} className="text-center py-20"><Loader2 className="animate-spin mx-auto text-primary" /></TableCell></TableRow>
            ) : sortedSubjects.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-20 text-muted-foreground italic">Belum ada mata pelajaran.</TableCell></TableRow>
            ) : sortedSubjects.map((sub) => {
              const isTemp = sub.id.startsWith('temp-')
              return (
                <TableRow key={sub.id} className="hover:bg-muted/5 transition-colors">
                  <TableCell className="font-mono font-bold text-accent">
                    <div className="flex items-center gap-2">
                      {sub.code}
                      {isTemp && <RefreshCw className="w-3 h-3 text-amber-500 animate-spin" />}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <BookMarked className="w-4 h-4 text-primary" />
                      <span className="font-bold">{sub.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {sub.grades?.sort((a,b) => a-b).map(g => (
                        <Badge key={g} variant="outline" className="bg-primary/5 border-primary/20 text-[10px] font-bold">KELAS {g}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="hover:text-primary" onClick={() => handleEditLocal(sub)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => handleDeleteTrigger(sub)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>

      <div className="bg-primary/5 p-4 rounded-xl border border-primary/20 flex gap-4">
         <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
         <div className="text-xs text-muted-foreground leading-relaxed">
           <p className="font-bold text-primary mb-1 uppercase tracking-wider">Mode Perencanaan Offline:</p>
           Sistem menggunakan buffer lokal untuk meminimalisir biaya pembacaan database. Seluruh perubahan yang Anda buat di atas (tambah/hapus) tidak akan membebani kuota Firestore sampai Anda menekan tombol <strong>Sinkronkan</strong>.
         </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>{editingSubject ? 'Edit Mata Pelajaran' : 'Tambah Mata Pelajaran Baru'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSaveLocal)} className="space-y-6 pt-4">
              <div className="space-y-4">
                <FormField control={form.control} name="code" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs uppercase font-bold text-muted-foreground tracking-widest flex items-center gap-2">
                      <Hash className="w-3 h-3" /> Kode Mapel
                    </FormLabel>
                    <FormControl><Input placeholder="Contoh: BING-SMP" {...field} value={field.value || ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs uppercase font-bold text-muted-foreground tracking-widest flex items-center gap-2">
                      <BookMarked className="w-3 h-3" /> Nama Lengkap Mapel
                    </FormLabel>
                    <FormControl><Input placeholder="Contoh: Bahasa Inggris" {...field} value={field.value || ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="space-y-3">
                <FormLabel className="text-xs uppercase font-bold text-muted-foreground tracking-widest flex items-center gap-2">
                  <Layers className="w-3 h-3" /> Pilih Tingkat Kelas
                </FormLabel>
                <div className="grid grid-cols-3 gap-4 bg-muted/20 p-4 rounded-xl border border-border/50">
                  {["7", "8", "9"].map((grade) => (
                    <FormField
                      key={grade}
                      control={form.control}
                      name="grades"
                      render={({ field }) => (
                        <FormItem className="flex items-center space-x-2 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value?.includes(grade)}
                              onCheckedChange={(checked) => {
                                return checked
                                  ? field.onChange([...field.value, grade])
                                  : field.onChange(field.value?.filter((value) => value !== grade))
                              }}
                            />
                          </FormControl>
                          <Label className="text-sm font-bold cursor-pointer">Kelas {grade}</Label>
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
                <FormMessage />
              </div>

              <DialogFooter className="pt-4">
                <Button type="submit" className="w-full h-11">
                  Simpan ke Draf
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-destructive" /> Hapus Mata Pelajaran?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini akan menghapus <strong>{subjectToDelete?.name}</strong> dari draf kurikulum Anda. Anda harus menekan tombol Sinkron untuk menerapkan perubahan ini ke database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={executeDeleteLocal} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Ya, Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
