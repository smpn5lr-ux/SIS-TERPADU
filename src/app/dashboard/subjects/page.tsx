
"use client"

import { useState, useMemo } from 'react'
import { Plus, BookOpen, Trash2, Loader2, Pencil, Layers, BookMarked, Hash, AlertCircle, CheckCircle2 } from "lucide-react"
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
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase'
import { collection, addDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore'
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
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()
  const db = useFirestore()

  const subjectsQuery = useMemoFirebase(() => {
    if (!db) return null
    return collection(db, 'subjects')
  }, [db])

  const { data: subjects, loading } = useCollection<Subject>(subjectsQuery)

  const sortedSubjects = useMemo(() => {
    if (!subjects) return []
    return [...subjects].sort((a, b) => a.name.localeCompare(b.name))
  }, [subjects])

  const form = useForm<z.infer<typeof subjectSchema>>({
    resolver: zodResolver(subjectSchema),
    defaultValues: { name: "", code: "", grades: ["7"] },
  })

  const onSubmit = async (values: z.infer<typeof subjectSchema>) => {
    if (!db || submitting) return
    setSubmitting(true)
    const payload = { 
      name: values.name, 
      code: values.code, 
      grades: values.grades.map(Number).sort((a, b) => a - b) 
    }
    
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

  const handleDelete = async (id: string) => {
    if (!db) return
    await deleteDoc(doc(db, 'subjects', id))
    toast({ title: "Mata Pelajaran Dihapus" })
  }

  const handleEdit = (sub: Subject) => {
    setEditingSubject(sub)
    form.reset({ 
      name: sub.name, 
      code: sub.code, 
      grades: sub.grades.map(String) 
    })
    setIsDialogOpen(true)
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Kurikulum & Mapel</h1>
          <p className="text-muted-foreground mt-1">Daftar induk mata pelajaran yang diajarkan di sekolah.</p>
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
              <TableHead className="font-bold text-primary">Tersedia untuk Tingkat</TableHead>
              <TableHead className="text-right font-bold text-primary">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-20"><Loader2 className="animate-spin mx-auto text-primary" /></TableCell></TableRow>
            ) : sortedSubjects.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-20 text-muted-foreground italic">Belum ada mata pelajaran.</TableCell></TableRow>
            ) : sortedSubjects.map((sub) => (
              <TableRow key={sub.id} className="hover:bg-muted/5 transition-colors">
                <TableCell className="font-mono font-bold text-accent">{sub.code}</TableCell>
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
                    <Button variant="ghost" size="icon" className="hover:text-primary" onClick={() => handleEdit(sub)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => handleDelete(sub.id)}>
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
           <p className="font-bold text-primary mb-1 uppercase tracking-wider">Sistem Mapel Terpadu:</p>
           Gunakan menu ini untuk mendefinisikan mata pelajaran sekali saja. Anda dapat mencentang beberapa tingkat sekaligus jika mapel tersebut diajarkan di kelas yang berbeda. Perubahan di sini akan otomatis memperbarui seluruh referensi penugasan guru.
         </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>{editingSubject ? 'Edit Mata Pelajaran' : 'Tambah Mata Pelajaran Baru'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
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
                <Button type="submit" disabled={submitting} className="w-full h-11">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
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
