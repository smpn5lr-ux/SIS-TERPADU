
"use client"

import { useState, useMemo } from 'react'
import { Plus, BookOpen, Trash2, Loader2, Pencil, Layers, BookMarked, Hash, AlertCircle } from "lucide-react"
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
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase'
import { collection, query, addDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore'
import { Subject } from '@/lib/types'
import { useToast } from '@/hooks/use-toast'
import { Badge } from "@/components/ui/badge"

const subjectSchema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter"),
  code: z.string().min(2, "Kode minimal 2 karakter"),
  grade: z.string().optional(),
})

export default function SubjectsPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()
  const db = useFirestore()

  const subjectsQuery = useMemoFirebase(() => {
    if (!db) return null
    return collection(db, 'subjects')
  }, [db])

  const { data: subjects, loading } = useCollection<Subject>(subjectsQuery)

  // Logika Pengelompokan Mapel agar tidak dobel
  const groupedSubjects = useMemo(() => {
    if (!subjects) return []
    const map = new Map<string, { 
      name: string, 
      code: string, 
      grades: number[],
      ids: string[],
      masterDoc: Subject 
    }>()

    subjects.forEach(s => {
      const key = `${s.code}-${s.name}`.toLowerCase()
      const existing = map.get(key) || { 
        name: s.name, 
        code: s.code, 
        grades: [], 
        ids: [],
        masterDoc: s 
      }
      if (!existing.grades.includes(s.grade)) existing.grades.push(s.grade)
      existing.ids.push(s.id)
      map.set(key, existing)
    })

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [subjects])

  const form = useForm<z.infer<typeof subjectSchema>>({
    resolver: zodResolver(subjectSchema),
    defaultValues: { name: "", code: "", grade: "7" },
  })

  const onSubmit = async (values: z.infer<typeof subjectSchema>) => {
    if (!db || submitting) return
    setSubmitting(true)
    const payload = { ...values, grade: parseInt(values.grade || "7") }
    try {
      if (editingSubject) {
        await updateDoc(doc(db, 'subjects', editingSubject.id), payload)
        toast({ title: "Mata Pelajaran Diperbarui" })
      } else {
        await addDoc(collection(db, 'subjects'), payload)
        toast({ title: "Mata Pelajaran Ditambahkan" })
      }
      setIsDialogOpen(false)
      setEditingSubject(null)
      form.reset()
    } catch (e) {
      toast({ variant: "destructive", title: "Gagal menyimpan" })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (ids: string[]) => {
    if (!db) return
    // Jika mapel dikelompokkan, hapus semua instance atau tanya user. 
    // Untuk MVP, hapus doc utama yang dipilih.
    for (const id of ids) {
      await deleteDoc(doc(db, 'subjects', id))
    }
    toast({ title: "Mata Pelajaran Dihapus" })
  }

  const handleEdit = (sub: Subject) => {
    setEditingSubject(sub)
    form.reset({ name: sub.name, code: sub.code, grade: sub.grade.toString() })
    setIsDialogOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Kurikulum & Mapel</h1>
          <p className="text-muted-foreground">Manajemen daftar mata pelajaran yang diajarkan di sekolah.</p>
        </div>
        <Button onClick={() => { setEditingSubject(null); form.reset(); setIsDialogOpen(true); }} className="gap-2 shadow-lg shadow-primary/20">
          <Plus className="w-4 h-4" /> Tambah Mapel
        </Button>
      </div>

      <Card className="border-border/50 overflow-hidden shadow-sm">
        <Table>
          <TableHeader className="bg-primary/5">
            <TableRow>
              <TableHead className="font-bold text-primary w-[150px]">Kode</TableHead>
              <TableHead className="font-bold text-primary">Nama Mata Pelajaran</TableHead>
              <TableHead className="font-bold text-primary">Tingkat Tersedia</TableHead>
              <TableHead className="text-right font-bold text-primary">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-20"><Loader2 className="animate-spin mx-auto text-primary" /></TableCell></TableRow>
            ) : groupedSubjects.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-20 text-muted-foreground italic">Belum ada mata pelajaran.</TableCell></TableRow>
            ) : groupedSubjects.map((group, idx) => (
              <TableRow key={idx} className="hover:bg-muted/5 transition-colors">
                <TableCell className="font-mono font-bold text-accent">{group.code}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <BookMarked className="w-4 h-4 text-primary" />
                    <span className="font-bold">{group.name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {group.grades.sort((a,b) => a-b).map(g => (
                      <Badge key={g} variant="outline" className="bg-primary/5 border-primary/20 text-[10px]">Kelas {g}</Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" className="hover:text-primary" onClick={() => handleEdit(group.masterDoc)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => handleDelete(group.ids)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="bg-primary/5 p-4 rounded-xl border border-primary/20 flex gap-4">
         <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
         <div className="text-xs text-muted-foreground leading-relaxed">
           <p className="font-bold text-primary mb-1 uppercase tracking-wider">Informasi Pengelompokan:</p>
           Sistem secara otomatis menggabungkan mata pelajaran dengan <strong>Nama dan Kode</strong> yang sama ke dalam satu baris. Ini memudahkan Anda melihat cakupan kurikulum tanpa adanya data ganda di layar.
         </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{editingSubject ? 'Edit Mata Pelajaran' : 'Tambah Mata Pelajaran Baru'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
              <FormField control={form.control} name="code" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs uppercase font-bold text-muted-foreground tracking-widest flex items-center gap-2">
                    <Hash className="w-3 h-3" /> Kode Mapel
                  </FormLabel>
                  <FormControl><Input placeholder="Contoh: BING-7" {...field} value={field.value || ""} /></FormControl>
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
              <FormField control={form.control} name="grade" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs uppercase font-bold text-muted-foreground tracking-widest flex items-center gap-2">
                    <Layers className="w-3 h-3" /> Tingkat Kelas
                  </FormLabel>
                  <FormControl><Input type="number" placeholder="7" {...field} value={field.value || ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter className="pt-4">
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Simpan Mata Pelajaran
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
