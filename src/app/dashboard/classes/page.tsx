
"use client"

import { useState, useEffect, useMemo } from 'react'
import { 
  Users, Trash2, Shuffle, Plus, Pencil, Eye, FileDown, FileSpreadsheet, FileText as FilePdf, ChevronDown, ClipboardList, AlertTriangle, ShieldAlert, DatabaseZap, Loader2, CheckCircle2, Settings2, ArrowLeftRight, UserMinus, GraduationCap, QrCode, UserPlus, Search, Upload, Check, Download, CloudUpload, CloudOff, RefreshCw, Info
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useCollection, useFirestore, useMemoFirebase, useDoc } from '@/firebase'
import { collection, doc, updateDoc, writeBatch, addDoc, query, orderBy, deleteDoc } from 'firebase/firestore'
import { Applicant, Classroom } from '@/lib/types'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { useToast } from '@/hooks/use-toast'
import { ScrollArea } from "@/components/ui/scroll-area"
import * as XLSX from 'xlsx'
import Link from 'next/link'

const classFormSchema = z.object({
  name: z.string().min(1, "Nama kelas harus diisi"),
  gradeLevel: z.string().min(1, "Tingkat harus diisi"),
  homeroomTeacher: z.string().optional(),
  capacity: z.string().min(1, "Kapasitas harus diisi"),
})

export default function ClassesPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isShuffling, setIsShuffling] = useState(false)
  const [editingClass, setEditingClass] = useState<Classroom | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [localClasses, setLocalClasses] = useState<Classroom[]>([])
  const [classToDelete, setClassToDelete] = useState<Classroom | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  
  const { toast } = useToast()
  const db = useFirestore()

  const classesQuery = useMemoFirebase(() => db ? query(collection(db, 'classes'), orderBy('name', 'asc')) : null, [db])
  const applicantsQuery = useMemoFirebase(() => db ? collection(db, 'applicants') : null, [db])
  const settingsRef = useMemoFirebase(() => db ? doc(db, 'settings', 'system') : null, [db])

  const { data: serverClasses, loading: loadingClasses } = useCollection<Classroom>(classesQuery)
  const { data: applicants } = useCollection<Applicant>(applicantsQuery)
  const { data: systemSettings } = useDoc<any>(settingsRef)

  useEffect(() => {
    if (serverClasses && !isDirty) {
      setLocalClasses(serverClasses)
    }
  }, [serverClasses, isDirty])

  const form = useForm<z.infer<typeof classFormSchema>>({
    resolver: zodResolver(classFormSchema),
    defaultValues: { name: "", gradeLevel: "7", homeroomTeacher: "", capacity: "32" },
  })

  const onSaveLocal = (values: z.infer<typeof classFormSchema>) => {
    const classData = {
      id: editingClass ? editingClass.id : `temp-${Date.now()}`,
      name: values.name,
      gradeLevel: parseInt(values.gradeLevel),
      homeroomTeacher: values.homeroomTeacher || "",
      capacity: parseInt(values.capacity),
      students: editingClass?.students || [],
      currentEnrollment: editingClass?.currentEnrollment || 0
    } as Classroom

    if (editingClass) {
      setLocalClasses(prev => prev.map(c => c.id === editingClass.id ? classData : c))
    } else {
      setLocalClasses(prev => [...prev, classData])
    }

    setIsDirty(true)
    setIsDialogOpen(false)
    toast({ title: "Perubahan Disimpan di Buffer" })
  }

  const handleDeleteTrigger = (cls: Classroom) => {
    setClassToDelete(cls)
    setIsDeleteDialogOpen(true)
  }

  const executeDeleteLocal = () => {
    if (!classToDelete) return
    setLocalClasses(prev => prev.filter(c => c.id !== classToDelete.id))
    setIsDirty(true)
    setIsDeleteDialogOpen(false)
    setClassToDelete(null)
  }

  const handleSyncToCloud = async () => {
    if (!db || !serverClasses) return
    setIsSyncing(true)
    const batch = writeBatch(db)

    try {
      const toDelete = serverClasses.filter(sc => !localClasses.some(lc => lc.id === sc.id))
      toDelete.forEach(c => batch.delete(doc(db, 'classes', c.id)))

      localClasses.forEach(lc => {
        if (lc.id.startsWith('temp-')) {
          const { id, ...data } = lc
          batch.set(doc(collection(db, 'classes')), data)
        } else {
          const serverVer = serverClasses.find(sc => sc.id === lc.id)
          if (JSON.stringify(serverVer) !== JSON.stringify(lc)) {
            batch.update(doc(db, 'classes', lc.id), lc as any)
          }
        }
      })

      await batch.commit()
      setIsDirty(false)
      toast({ title: "Sinkronisasi Berhasil" })
    } catch (e) {
      toast({ variant: "destructive", title: "Gagal Sinkronisasi" })
    } finally {
      setIsSyncing(false)
    }
  }

  const groupedClasses = useMemo(() => {
    const groups: Record<number, Classroom[]> = {}
    localClasses.forEach(cls => {
      const level = cls.gradeLevel
      if (!groups[level]) groups[level] = []
      groups[level].push(cls)
    })
    return groups
  }, [localClasses])

  const sortedLevels = useMemo(() => Object.keys(groupedClasses).map(Number).sort((a, b) => a - b), [groupedClasses])

  if (loadingClasses && !localClasses.length) return <div className="flex justify-center py-24"><Loader2 className="animate-spin" /></div>

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Manajemen Kelas</h1>
          <div className="flex items-center gap-2 mt-1">
             <p className="text-muted-foreground">Kelola rombel dan distribusi murid.</p>
             {isDirty ? (
               <Badge className="bg-amber-500/10 text-amber-500 animate-pulse gap-1"><CloudOff className="w-3 h-3" /> Ada Draf Baru</Badge>
             ) : (
               <Badge className="bg-green-500/10 text-green-500 gap-1"><CheckCircle2 className="w-3 h-3" /> Tersinkron</Badge>
             )}
          </div>
        </div>
        <div className="flex gap-2">
          {isDirty && (
            <Button onClick={handleSyncToCloud} disabled={isSyncing} className="bg-green-600 gap-2">
              {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
              Sinkronkan ke Cloud
            </Button>
          )}
          <Button onClick={() => { setEditingClass(null); form.reset(); setIsDialogOpen(true); }} className="gap-2 shadow-lg shadow-primary/20"><Plus className="w-4 h-4" /> Tambah Rombel</Button>
        </div>
      </div>

      <div className="space-y-12">
        {sortedLevels.map(level => (
          <section key={level} className="space-y-4">
            <div className="flex items-center gap-4">
              <Badge className="bg-primary px-3 py-1 text-lg">TINGKAT {level}</Badge>
              <div className="h-px bg-border flex-1"></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {groupedClasses[level].sort((a,b) => a.name.localeCompare(b.name, undefined, {numeric: true})).map(cls => {
                const isTemp = cls.id.startsWith('temp-')
                return (
                  <Card key={cls.id} className={`border-border/50 relative group ${isTemp ? 'bg-amber-500/5 border-dashed border-2' : ''}`}>
                    <Button variant="ghost" size="icon" className="absolute top-2 right-2 text-destructive opacity-0 group-hover:opacity-100" onClick={() => handleDeleteTrigger(cls)}><Trash2 className="w-4 h-4" /></Button>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">Kelas {cls.name} {isTemp && <RefreshCw className="w-4 h-4 text-amber-500 animate-spin" />}</CardTitle>
                      <CardDescription>{cls.currentEnrollment} / {cls.capacity} Murid</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="bg-muted/30 p-2 rounded text-xs">Wali Kelas: <span className="font-bold">{cls.homeroomTeacher || "-"}</span></div>
                      <Button variant="outline" className="w-full text-xs" onClick={() => { setEditingClass(cls); form.reset({...cls, gradeLevel: cls.gradeLevel.toString(), capacity: cls.capacity.toString()}); setIsDialogOpen(true); }}>Edit Rombel</Button>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="bg-accent/5 p-4 rounded-xl border border-accent/20 flex gap-4">
         <Info className="w-5 h-5 text-accent shrink-0 mt-0.5" />
         <div className="text-xs text-muted-foreground leading-relaxed italic">
           Sistem menggunakan <strong>Mode Offline Buffer</strong> untuk rombel. Anda dapat membuat banyak kelas tanpa biaya database. Pastikan menekan tombol <strong>Sinkronkan</strong> untuk menyimpan hasil akhir.
         </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader><DialogTitle>{editingClass ? 'Edit Rombel' : 'Tambah Rombel Baru'}</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSaveLocal)} className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>Nama Kelas</FormLabel><FormControl><Input placeholder="7-A" {...field} value={field.value || ""} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="gradeLevel" render={({ field }) => (
                  <FormItem><FormLabel>Tingkat</FormLabel><FormControl><Input type="number" {...field} value={field.value || ""} /></FormControl></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="homeroomTeacher" render={({ field }) => (
                <FormItem><FormLabel>Wali Kelas</FormLabel><FormControl><Input placeholder="Nama Guru" {...field} value={field.value || ""} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="capacity" render={({ field }) => (
                <FormItem><FormLabel>Kapasitas</FormLabel><FormControl><Input type="number" {...field} value={field.value || ""} /></FormControl></FormItem>
              )} />
              <DialogFooter><Button type="submit" className="w-full">Simpan ke Buffer</Button></DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-destructive" /> Hapus Rombel?</AlertDialogTitle>
            <AlertDialogDescription>Tindakan ini menghapus draf kelas Anda. Murid di dalamnya akan dikeluarkan dari rombel tapi data profil mereka aman.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={executeDeleteLocal} className="bg-destructive text-destructive-foreground">Ya, Hapus</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
