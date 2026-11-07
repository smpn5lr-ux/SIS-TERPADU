
"use client"

import { useState, useMemo, useEffect } from 'react'
import { 
  Search, Loader2, Eye, Pencil, CloudUpload, CloudOff, CheckCircle2, Info, UserPlus, School, ArrowRightLeft
} from "lucide-react"
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import Link from 'next/link'
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase'
import { collection, query, orderBy, doc, writeBatch, limit, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore'
import { Applicant, Classroom } from '@/lib/types'
import { useToast } from '@/hooks/use-toast'

export default function StudentDatabasePage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [isSyncing, setIsSyncing] = useState(false)
  
  const [localStudents, setLocalStudents] = useState<Applicant[]>([])
  const [isDirty, setIsDirty] = useState(false)

  const [isJoinDialogOpen, setIsJoinDialogOpen] = useState(false)
  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState<Applicant | null>(null)
  const [targetClassId, setTargetClassId] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)

  const { toast } = useToast()
  const db = useFirestore()

  const studentsQuery = useMemoFirebase(() => {
    if (!db) return null
    return query(collection(db, 'applicants'), orderBy('fullName', 'asc'), limit(200))
  }, [db])

  const classesQuery = useMemoFirebase(() => {
    if (!db) return null
    return query(collection(db, 'classes'), orderBy('name', 'asc'))
  }, [db])

  const { data: serverStudents, loading } = useCollection<Applicant>(studentsQuery)
  const { data: classes } = useCollection<Classroom>(classesQuery)

  useEffect(() => {
    if (serverStudents && !isDirty) {
      setLocalStudents(serverStudents)
    }
  }, [serverStudents, isDirty])

  const filteredStudents = useMemo(() => {
    return localStudents.filter(a => 
      !a.isDeleted &&
      ((a.fullName || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
       (a.NISN || "").includes(searchTerm) || 
       (a.NIS || "").includes(searchTerm) || 
       (a.registrationNumber || "").includes(searchTerm))
    )
  }, [localStudents, searchTerm])

  const handleSync = async () => {
    if (!db || !serverStudents) return
    setIsSyncing(true)
    const batch = writeBatch(db)
    try {
      localStudents.forEach(ls => {
        const serverVer = serverStudents.find(ss => ss.id === ls.id)
        if (JSON.stringify(serverVer) !== JSON.stringify(ls)) {
          batch.update(doc(db, 'applicants', ls.id), ls as any)
        }
      })
      await batch.commit()
      setIsDirty(false)
      toast({ title: "Database Siswa Tersinkron" })
    } catch (e) {
      toast({ variant: "destructive", title: "Gagal Sinkronisasi" })
    } finally {
      setIsSyncing(false)
    }
  }

  const handleJoinToClass = async () => {
    if (!db || !selectedStudent || !targetClassId) return
    setIsProcessing(true)
    try {
      const classRef = doc(db, 'classes', targetClassId)
      const targetClass = classes?.find(c => c.id === targetClassId)
      
      if (targetClass?.students?.includes(selectedStudent.id)) {
        toast({ variant: "destructive", title: "Siswa sudah terdaftar", description: "Siswa ini sudah ada di rombel tujuan." })
        setIsProcessing(false)
        return
      }

      await updateDoc(classRef, {
        students: arrayUnion(selectedStudent.id)
      })

      toast({ 
        title: "Berhasil Digabungkan", 
        description: `${selectedStudent.fullName} kini terdaftar sebagai siswa tamu di Kelas ${targetClass?.name}.` 
      })
      setIsJoinDialogOpen(false)
      setSelectedStudent(null)
      setTargetClassId("")
    } catch (e) {
      toast({ variant: "destructive", title: "Gagal menggabungkan" })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleMoveToClass = async () => {
    if (!db || !selectedStudent || !targetClassId) return
    setIsProcessing(true)
    const batch = writeBatch(db)
    
    try {
      const targetClass = classes?.find(c => c.id === targetClassId)
      const oldClassId = selectedStudent.homeClassId

      // 1. Hapus dari kelas lama jika ada
      if (oldClassId) {
        batch.update(doc(db, 'classes', oldClassId), {
          students: arrayRemove(selectedStudent.id)
        })
      }

      // 2. Tambah ke kelas baru
      batch.update(doc(db, 'classes', targetClassId), {
        students: arrayUnion(selectedStudent.id)
      })

      // 3. Update status Rombel Utama di profil siswa
      batch.update(doc(db, 'applicants', selectedStudent.id), {
        homeClassId: targetClassId,
        updatedAt: new Date().toISOString()
      })

      await batch.commit()
      
      toast({ 
        title: "Siswa Berhasil Dipindahkan", 
        description: `${selectedStudent.fullName} kini resmi menjadi siswa Kelas ${targetClass?.name}.` 
      })
      
      setIsMoveDialogOpen(false)
      setSelectedStudent(null)
      setTargetClassId("")
      
      // Update local state untuk mencegah desync tampilan
      setLocalStudents(prev => prev.map(s => s.id === selectedStudent.id ? { ...s, homeClassId: targetClassId } : s))
    } catch (e) {
      toast({ variant: "destructive", title: "Gagal memindahkan siswa" })
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Data Induk Siswa</h1>
          <div className="flex items-center gap-2 mt-1">
             <p className="text-muted-foreground text-sm">Database resmi seluruh murid aktif.</p>
             {isDirty && <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse">Draf Belum Sinkron</Badge>}
          </div>
        </div>
        {isDirty && (
          <Button onClick={handleSync} disabled={isSyncing} className="bg-green-600 gap-2 shadow-lg shadow-green-500/20">
            {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
            Sinkronkan ke Cloud
          </Button>
        )}
      </div>

      <div className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-border/50">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Cari NIS, Nama, atau NISN..." className="pl-9 bg-muted/20" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
        </div>
        <Table>
          <TableHeader className="bg-primary/5">
            <TableRow>
              <TableHead className="font-bold text-primary w-[60px]">No</TableHead>
              <TableHead className="font-bold text-primary w-[120px]">NIS/NISN</TableHead>
              <TableHead className="font-bold text-primary">Nama Lengkap</TableHead>
              <TableHead className="font-bold text-primary">Status</TableHead>
              <TableHead className="text-right font-bold text-primary">Aksi Admin</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !localStudents.length ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></TableCell></TableRow>
            ) : filteredStudents.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">Tidak ada data siswa.</TableCell></TableRow>
            ) : filteredStudents.map((s, idx) => {
              const isGraduated = s.admissionStatus === 'graduated';
              return (
                <TableRow key={s.id} className="hover:bg-muted/10 transition-colors">
                  <TableCell className="text-xs font-medium text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell>
                    <div className="flex flex-col font-mono text-[10px]">
                       <span className="font-bold text-primary">{s.NIS || "-"}</span>
                       <span className="text-accent">{s.NISN || "-"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-sm">{s.fullName}</TableCell>
                  <TableCell>
                    {isGraduated ? (
                      <Badge variant="outline" className="text-[9px] uppercase">LULUSAN</Badge>
                    ) : (
                      <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-[9px] uppercase font-bold">AKTIF</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="outline" size="sm" className="h-8 text-[10px] font-bold gap-1.5 border-primary/20 text-primary" onClick={() => { setSelectedStudent(s); setIsJoinDialogOpen(true); }}>
                        <UserPlus className="w-3.5 h-3.5" /> GABUNG
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 text-[10px] font-bold gap-1.5 border-accent/20 text-accent" onClick={() => { setSelectedStudent(s); setIsMoveDialogOpen(true); }}>
                        <ArrowRightLeft className="w-3.5 h-3.5" /> PINDAH
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                        <Link href={`/dashboard/students/edit/${s.id}`}><Pencil className="w-3.5 h-3.5" /></Link>
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                        <Link href={`/dashboard/applicants/${s.id}`}><Eye className="w-3.5 h-3.5" /></Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isJoinDialogOpen} onOpenChange={setIsJoinDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Gabungkan ke Rombel</DialogTitle>
            <DialogDescription>
              Daftarkan <strong>{selectedStudent?.fullName}</strong> ke rombel tambahan (Siswa Tamu).
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
             <div className="space-y-2">
               <Label className="text-xs uppercase font-bold text-muted-foreground">Pilih Rombongan Belajar Tujuan</Label>
               <Select value={targetClassId} onValueChange={setTargetClassId}>
                 <SelectTrigger className="h-12">
                   <SelectValue placeholder="Pilih Kelas" />
                 </SelectTrigger>
                 <SelectContent>
                   {classes?.map(c => (
                     <SelectItem key={c.id} value={c.id}>Kelas {c.name} (Tingkat {c.gradeLevel})</SelectItem>
                   ))}
                 </SelectContent>
               </Select>
             </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsJoinDialogOpen(false)}>Batal</Button>
            <Button onClick={handleJoinToClass} disabled={!targetClassId || isProcessing} className="gap-2">
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Proses Gabung
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isMoveDialogOpen} onOpenChange={setIsMoveDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Pindahkan Rombel Utama</DialogTitle>
            <DialogDescription>
              Ubah penempatan resmi <strong>{selectedStudent?.fullName}</strong> ke rombel baru.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
             <div className="space-y-2">
               <Label className="text-xs uppercase font-bold text-muted-foreground">Pilih Kelas Baru</Label>
               <Select value={targetClassId} onValueChange={setTargetClassId}>
                 <SelectTrigger className="h-12">
                   <SelectValue placeholder="Pilih Kelas Tujuan" />
                 </SelectTrigger>
                 <SelectContent>
                   {classes?.map(c => (
                     <SelectItem key={c.id} value={c.id}>Kelas {c.name} (Tingkat {c.gradeLevel})</SelectItem>
                   ))}
                 </SelectContent>
               </Select>
             </div>
             <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                <p className="text-[10px] text-amber-600 leading-relaxed italic">
                  * Aksi ini akan mencabut siswa dari kelas lamanya dan menetapkan kelas baru sebagai rumah utamanya.
                </p>
             </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMoveDialogOpen(false)}>Batal</Button>
            <Button onClick={handleMoveToClass} disabled={!targetClassId || isProcessing} className="gap-2 bg-accent hover:bg-accent/90">
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
              Proses Pindah
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
