
"use client"

import { useState, useMemo, useEffect } from 'react'
import { 
  Search, Loader2, Eye, Pencil, CloudUpload, CloudOff, CheckCircle2, Info, Contact
} from "lucide-react"
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import Link from 'next/link'
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase'
import { collection, query, orderBy, doc, writeBatch, where } from 'firebase/firestore'
import { Applicant } from '@/lib/types'
import { useToast } from '@/hooks/use-toast'

export default function StudentDatabasePage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [isSyncing, setIsSyncing] = useState(false)
  
  const [localStudents, setLocalStudents] = useState<Applicant[]>([])
  const [isDirty, setIsDirty] = useState(false)

  const { toast } = useToast()
  const db = useFirestore()

  const studentsQuery = useMemoFirebase(() => {
    if (!db) return null
    // Filter siswa yang diterima atau sudah lulus
    return query(collection(db, 'applicants'), where('admissionStatus', 'in', ['accepted', 'graduated']), orderBy('fullName', 'asc'))
  }, [db])

  const { data: serverStudents, loading } = useCollection<Applicant>(studentsQuery)

  useEffect(() => {
    if (serverStudents && !isDirty) {
      setLocalStudents(serverStudents)
    }
  }, [serverStudents, isDirty])

  const filteredStudents = useMemo(() => {
    return localStudents.filter(a => 
      !a.isDeleted &&
      ((a.fullName || "").toLowerCase().includes(searchTerm.toLowerCase()) || (a.NISN || "").includes(searchTerm) || (a.registrationNumber || "").includes(searchTerm))
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Data Induk Siswa</h1>
          <div className="flex items-center gap-2 mt-1">
             <p className="text-muted-foreground text-sm">Database resmi seluruh murid aktif (Dapodik).</p>
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
            <Input placeholder="Cari No. Urut, Nama, atau NISN..." className="pl-9 bg-muted/20" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
        </div>
        <Table>
          <TableHeader className="bg-primary/5">
            <TableRow>
              <TableHead className="font-bold text-primary w-[140px]">No. Urut</TableHead>
              <TableHead className="font-bold text-primary">NISN</TableHead>
              <TableHead className="font-bold text-primary">Nama Lengkap</TableHead>
              <TableHead className="font-bold text-primary">Status</TableHead>
              <TableHead className="text-right font-bold text-primary">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !localStudents.length ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></TableCell></TableRow>
            ) : filteredStudents.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">Tidak ada data siswa.</TableCell></TableRow>
            ) : filteredStudents.map((s) => {
              const isGraduated = s.admissionStatus === 'graduated';
              return (
                <TableRow key={s.id} className="hover:bg-muted/10 transition-colors">
                  <TableCell className="font-mono text-xs font-bold text-primary">{s.registrationNumber || s.registrationSequence}</TableCell>
                  <TableCell className="font-mono text-xs font-bold text-accent">{s.NISN || "-"}</TableCell>
                  <TableCell className="font-medium">{s.fullName}</TableCell>
                  <TableCell>
                    {isGraduated ? (
                      <Badge variant="outline" className="bg-muted text-muted-foreground border-muted-foreground/20 gap-1.5 py-1 px-3">
                        LULUSAN
                      </Badge>
                    ) : (
                      <Badge className="bg-green-500/10 text-green-500 border-green-500/20 gap-1.5 py-1 px-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                        SISWA AKTIF
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" title="Ubah Data" asChild>
                        <Link href={`/dashboard/students/edit/${s.id}`}><Pencil className="w-4 h-4" /></Link>
                      </Button>
                      <Button variant="ghost" size="icon" title="Lihat Biodata" asChild>
                        <Link href={`/dashboard/applicants/${s.id}`}><Eye className="w-4 h-4" /></Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <div className="bg-accent/5 p-4 rounded-xl border border-accent/20 flex gap-4">
         <Info className="w-5 h-5 text-accent shrink-0 mt-0.5" />
         <div className="text-xs text-muted-foreground leading-relaxed italic">
           Halaman ini berisi data <strong>Buku Induk Sekolah</strong>. Gunakan fitur sinkronisasi untuk menyimpan permanen hasil edit data murid.
         </div>
      </div>
    </div>
  )
}
