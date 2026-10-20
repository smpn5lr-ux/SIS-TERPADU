
"use client"

import { useState, useEffect, useMemo } from 'react'
import { 
  Users, Trash2, Plus, Pencil, Eye, FileSpreadsheet, Loader2, CheckCircle2, UserPlus, Search, Upload, Download, CloudUpload, CloudOff, RefreshCw, Info, UserMinus, X, GraduationCap, ArrowLeft, ChevronRight, Hash, ArrowUpCircle, School, UserCheck, Trash, Printer, FileText
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useCollection, useFirestore, useMemoFirebase, useDoc } from '@/firebase'
import { collection, doc, updateDoc, writeBatch, query, orderBy, getDocs } from 'firebase/firestore'
import { Applicant, Classroom } from '@/lib/types'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { useToast } from '@/hooks/use-toast'
import { ScrollArea } from "@/components/ui/scroll-area"
import Link from 'next/link'
import * as XLSX from 'xlsx'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const classFormSchema = z.object({
  name: z.string().min(1, "Nama kelas harus diisi"),
  gradeLevel: z.string().min(1, "Tingkat harus diisi"),
  homeroomTeacher: z.string().optional(),
  capacity: z.string().min(1, "Kapasitas harus diisi"),
})

const studentEditSchema = z.object({
  fullName: z.string().min(2, "Nama minimal 2 karakter"),
  NIS: z.string().optional(),
  NISN: z.string().optional(),
  gender: z.enum(['Laki-laki', 'Perempuan']),
})

export default function ClassesPage() {
  const [view, setView] = useState<'grid' | 'students'>('grid')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isAddStudentMode, setIsAddStudentMode] = useState(false)
  const [isEditStudentOpen, setIsEditStudentOpen] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  
  const [editingClass, setEditingClass] = useState<Classroom | null>(null)
  const [selectedClassForStudents, setSelectedClassForStudents] = useState<Classroom | null>(null)
  const [editingStudentData, setEditingStudentData] = useState<Applicant | null>(null)
  
  const [isDirty, setIsDirty] = useState(false)
  const [localClasses, setLocalClasses] = useState<Classroom[]>([])
  const [localApplicants, setLocalApplicants] = useState<Applicant[]>([])
  const [classToDelete, setClassToDelete] = useState<Classroom | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isClearAllDialogOpen, setIsClearAllDialogOpen] = useState(false)

  const [isPromotionDialogOpen, setIsPromotionDialogOpen] = useState(false)
  const [classToPromote, setClassToPromote] = useState<Classroom | null>(null)
  
  const [studentSearch, setStudentSearch] = useState("")
  
  const { toast } = useToast()
  const db = useFirestore()

  const settingsRef = useMemoFirebase(() => db ? doc(db, 'settings', 'system') : null, [db])
  const { data: config } = useDoc<any>(settingsRef)

  const classesQuery = useMemoFirebase(() => db ? query(collection(db, 'classes'), orderBy('name', 'asc')) : null, [db])
  const applicantsQuery = useMemoFirebase(() => db ? query(collection(db, 'applicants')) : null, [db])

  const { data: serverClasses, loading: loadingClasses } = useCollection<Classroom>(classesQuery)
  const { data: serverApplicants } = useCollection<Applicant>(applicantsQuery)

  useEffect(() => {
    if (serverClasses && !isDirty) {
      setLocalClasses(serverClasses)
    }
  }, [serverClasses, isDirty])

  useEffect(() => {
    if (serverApplicants && !isDirty) {
      setLocalApplicants(serverApplicants)
    }
  }, [serverApplicants, isDirty])

  const form = useForm<z.infer<typeof classFormSchema>>({
    resolver: zodResolver(classFormSchema),
    defaultValues: { name: "", gradeLevel: "7", homeroomTeacher: "", capacity: "32" },
  })

  const studentEditForm = useForm<z.infer<typeof studentEditSchema>>({
    resolver: zodResolver(studentEditSchema),
    defaultValues: { fullName: "", NIS: "", NISN: "", gender: "Laki-laki" },
  })

  const onSaveLocal = (values: z.infer<typeof classFormSchema>) => {
    const isDuplicate = localClasses.some(c => 
      c.name.toLowerCase().trim() === values.name.toLowerCase().trim() && 
      (!editingClass || c.id !== editingClass.id)
    );

    if (isDuplicate) {
      toast({ 
        variant: "destructive", 
        title: "Gagal Menyimpan", 
        description: `Kelas ${values.name} sudah terdaftar.` 
      });
      return;
    }

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

  const handleEditStudent = (student: Applicant) => {
    setEditingStudentData(student)
    studentEditForm.reset({
      fullName: student.fullName,
      NIS: student.NIS || "",
      NISN: student.NISN,
      gender: student.gender
    })
    setIsEditStudentOpen(true)
  }

  const onSaveStudentLocal = (values: z.infer<typeof studentEditSchema>) => {
    if (!editingStudentData) return
    const updated = { ...editingStudentData, ...values, updatedAt: new Date().toISOString() }
    setLocalApplicants(prev => prev.map(a => a.id === editingStudentData.id ? updated : a))
    setIsDirty(true)
    setIsEditStudentOpen(false)
    toast({ title: "Biodata Siswa Diperbarui di Buffer" })
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

  const handleClearAllStudents = () => {
    if (!selectedClassForStudents) return
    const updatedClass = {
      ...selectedClassForStudents,
      students: [],
      currentEnrollment: 0
    }
    setLocalClasses(prev => prev.map(c => c.id === updatedClass.id ? updatedClass : c))
    setSelectedClassForStudents(updatedClass)
    setIsDirty(true)
    setIsClearAllDialogOpen(false)
    toast({ title: "Daftar Murid Dikosongkan", description: "Seluruh murid telah dikeluarkan dari rombel ini (Draf)." })
  }

  const handlePromoteClassLocal = () => {
    if (!classToPromote) return
    const isGrade9 = classToPromote.gradeLevel >= 9
    const studentIds = classToPromote.students || []

    if (studentIds.length === 0) {
      toast({ variant: "destructive", title: "Gagal", description: "Kelas ini tidak memiliki murid." })
      return
    }

    const updatedClass = { ...classToPromote, students: [], currentEnrollment: 0 }
    setLocalClasses(prev => prev.map(c => c.id === classToPromote.id ? updatedClass : c))

    if (isGrade9) {
      setLocalApplicants(prev => prev.map(a => {
        if (studentIds.includes(a.id)) {
          return { ...a, admissionStatus: 'graduated' as any, updatedAt: new Date().toISOString() }
        }
        return a
      }))
    }

    setIsDirty(true)
    setIsPromotionDialogOpen(false)
    setClassToPromote(null)
    toast({ 
      title: isGrade9 ? "Proses Kelulusan Berhasil (Buffer)" : "Proses Kenaikan Berhasil (Buffer)",
      description: isGrade9 ? `${studentIds.length} murid ditandai lulus.` : `${studentIds.length} murid siap dipindah ke tingkat berikutnya.`
    })
  }

  const handleSyncToCloud = async () => {
    if (!db || !serverClasses || !serverApplicants) return
    setIsSyncing(true)
    const batch = writeBatch(db)

    try {
      // Map untuk melacak ID sementara ke ID Firestore yang baru
      const idMap = new Map<string, string>();

      // 1. Sinkronkan Applicants (Murid) dulu agar kita dapat ID aslinya
      const nextApplicants = localApplicants.map(la => {
        if (la.id.startsWith('temp-')) {
          const newRef = doc(collection(db, 'applicants'))
          idMap.set(la.id, newRef.id);
          const { id, ...data } = la
          batch.set(newRef, { ...data, id: newRef.id })
          return { ...la, id: newRef.id }
        } else {
          const serverVer = serverApplicants.find(sa => sa.id === la.id)
          if (serverVer && JSON.stringify(serverVer) !== JSON.stringify(la)) {
            batch.update(doc(db, 'applicants', la.id), la as any)
          }
          return la
        }
      })

      // 2. Sinkronkan Classes (Kelas) dengan ID Murid yang sudah dipetakan
      const nextClasses = localClasses.map(lc => {
        // Update array students dengan ID baru jika ada di map
        const updatedStudents = (lc.students || []).map(sid => idMap.get(sid) || sid);
        const updatedClass = { ...lc, students: updatedStudents, currentEnrollment: updatedStudents.length };

        if (lc.id.startsWith('temp-')) {
          const newRef = doc(collection(db, 'classes'))
          const { id, ...data } = updatedClass
          batch.set(newRef, { ...data, id: newRef.id })
          return { ...updatedClass, id: newRef.id }
        } else {
          const serverVer = serverClasses.find(sc => sc.id === lc.id)
          if (serverVer && JSON.stringify(serverVer) !== JSON.stringify(updatedClass)) {
            batch.update(doc(db, 'classes', lc.id), updatedClass as any)
          }
          return updatedClass
        }
      })

      // 3. Tangani Penghapusan
      const classesToDelete = serverClasses.filter(sc => !localClasses.some(lc => lc.id === sc.id))
      classesToDelete.forEach(c => batch.delete(doc(db, 'classes', c.id)))

      await batch.commit()
      
      // Update state lokal agar sinkron dengan ID baru dari server
      setLocalApplicants(nextApplicants)
      setLocalClasses(nextClasses)
      if (selectedClassForStudents) {
         const updatedSelected = nextClasses.find(c => 
           c.name === selectedClassForStudents.name && 
           c.gradeLevel === selectedClassForStudents.gradeLevel
         )
         if (updatedSelected) setSelectedClassForStudents(updatedSelected)
      }
      
      setIsDirty(false)
      toast({ title: "Sinkronisasi Berhasil", description: "Seluruh data telah aman di Cloud." })
    } catch (e) {
      console.error("Sync Error:", e)
      toast({ variant: "destructive", title: "Gagal Sinkronisasi" })
    } finally {
      setIsSyncing(false)
    }
  }

  const availableStudents = useMemo(() => {
    if (!localApplicants || !localClasses) return []
    const assignedIds = new Set(localClasses.flatMap(c => c.students || []))
    return localApplicants.filter(a => !assignedIds.has(a.id) && !a.isDeleted)
  }, [localApplicants, localClasses])

  const currentClassStudents = useMemo(() => {
    if (!selectedClassForStudents || !localApplicants) return []
    return localApplicants
      .filter(a => selectedClassForStudents.students?.includes(a.id))
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
  }, [selectedClassForStudents, localApplicants])

  const classGenderStats = useMemo(() => {
    const total = currentClassStudents.length
    const male = currentClassStudents.filter(s => s.gender === 'Laki-laki').length
    const female = total - male
    return { total, male, female }
  }, [currentClassStudents])

  const handleAddStudentToClass = (studentId: string) => {
    if (!selectedClassForStudents) return
    const updatedClass = {
      ...selectedClassForStudents,
      students: [...(selectedClassForStudents.students || []), studentId],
      currentEnrollment: (selectedClassForStudents.students?.length || 0) + 1
    }
    setLocalClasses(prev => prev.map(c => c.id === updatedClass.id ? updatedClass : c))
    setSelectedClassForStudents(updatedClass)
    setIsDirty(true)
    toast({ title: "Murid Ditambahkan ke Draf" })
  }

  const handleRemoveStudentFromClass = (studentId: string) => {
    if (!selectedClassForStudents) return
    const updatedClass = {
      ...selectedClassForStudents,
      students: (selectedClassForStudents.students || []).filter(id => id !== studentId),
      currentEnrollment: Math.max(0, (selectedClassForStudents.students?.length || 0) - 1)
    }
    setLocalClasses(prev => prev.map(c => c.id === updatedClass.id ? updatedClass : c))
    setSelectedClassForStudents(updatedClass)
    setIsDirty(true)
    toast({ title: "Murid Dikeluarkan dari Draf" })
  }

  const handleDownloadTemplate = () => {
    const data = [
      { "NO": 1, "NISN": "3149664895", "NIS": "12345", "NAMA SISWA": "Abel Artasasta Sutono", "LP": "L" },
      { "NO": 2, "NISN": "3133865046", "NIS": "12346", "NAMA SISWA": "Adrianus Nggaro", "LP": "L" },
      { "NO": 3, "NISN": "3143191449", "NIS": "12347", "NAMA SISWA": "Afila Hana", "LP": "P" }
    ]
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Template_Impor")
    XLSX.writeFile(wb, "Template_Impor_Murid.xlsx")
    toast({ title: "Template Berhasil Diunduh" })
  }

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedClassForStudents) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result
        const wb = XLSX.read(bstr, { type: 'binary' })
        const wsname = wb.SheetNames[0]
        const ws = wb.Sheets[wsname]
        const data = XLSX.utils.sheet_to_json(ws) as any[]
        
        if (data.length === 0) {
          toast({ variant: "destructive", title: "Impor Gagal", description: "File Excel kosong." });
          return;
        }

        const firstRow = data[0];
        const keys = Object.keys(firstRow);
        
        const nameKey = keys.find(k => k.toLowerCase().includes("nama")) || "NAMA SISWA";
        const nisnKey = keys.find(k => k.toLowerCase().includes("nisn")) || "NISN";
        const nisKey = keys.find(k => k.toLowerCase() === "nis") || "NIS";
        const genderKey = keys.find(k => k.toLowerCase() === "lp" || k.toLowerCase().includes("jk") || k.toLowerCase().includes("kelamin")) || "LP";

        let addedCount = 0
        let createdCount = 0
        const currentStudentsInClass = [...(selectedClassForStudents.students || [])]
        const currentApplicantsInDb = [...localApplicants]
        
        data.forEach(row => {
          const rawName = String(row[nameKey] || "").trim()
          const nameLower = rawName.toLowerCase()
          const nisn = String(row[nisnKey] || "").trim()
          const nis = String(row[nisKey] || "").trim()
          let rawGender = String(row[genderKey] || "L").trim()
          
          let gender: 'Laki-laki' | 'Perempuan' = 'Laki-laki'
          if (rawGender.toLowerCase().startsWith('p') || rawGender.toLowerCase() === 'wanita' || rawGender.toLowerCase() === 'perempuan') {
            gender = 'Perempuan'
          }

          if (!rawName && !nisn && !nis) return;

          // Cari apakah murid sudah ada di database utama
          let student = currentApplicantsInDb.find(a => {
            const dbNisn = (a.NISN || "").trim();
            const dbNis = (a.NIS || "").trim();
            const dbName = (a.fullName || "").trim().toLowerCase();
            return (nisn !== "" && dbNisn === nisn) || (nis !== "" && dbNis === nis) || (nameLower !== "" && dbName === nameLower);
          });

          if (!student) {
             // Jika belum ada, buat sebagai murid baru di draf
             student = {
               id: `temp-new-${Date.now()}-${createdCount}`,
               fullName: rawName,
               NISN: nisn,
               NIS: (nis === '-' || !nis) ? "" : nis,
               gender: gender,
               admissionStatus: "accepted",
               verificationStatus: "Lengkap",
               createdAt: new Date().toISOString(),
               isDeleted: false
             } as Applicant
             currentApplicantsInDb.push(student)
             createdCount++
          } else {
            // Update data dasar jika ada perubahan di Excel
            student.gender = gender;
            if (nis && nis !== '-') student.NIS = nis;
            if (nisn && nisn !== '-') student.NISN = nisn;
          }

          // Masukkan ke daftar siswa kelas jika belum ada
          if (!currentStudentsInClass.includes(student.id)) {
            currentStudentsInClass.push(student.id)
            addedCount++
          }
        })

        if (addedCount > 0 || createdCount > 0) {
          setLocalApplicants(currentApplicantsInDb)
          const updatedClass = { ...selectedClassForStudents, students: currentStudentsInClass, currentEnrollment: currentStudentsInClass.length }
          setLocalClasses(prev => prev.map(c => c.id === updatedClass.id ? updatedClass : c))
          setSelectedClassForStudents(updatedClass)
          setIsDirty(true)
          toast({ 
            title: "Impor Berhasil", 
            description: `${addedCount} murid masuk ke kelas (${createdCount} murid baru terdaftar di database).` 
          })
        }
      } catch (err) {
        toast({ variant: "destructive", title: "Kesalahan File", description: "Gagal memproses data Excel." });
      }
    }
    reader.readAsBinaryString(file)
    e.target.value = '';
  }

  const handleDownloadStudentsPDF = async () => {
    if (!selectedClassForStudents || currentClassStudents.length === 0) return;
    setIsExporting(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF('p', 'mm', 'a4');

      const govName = (config?.govName || "PEMERINTAH KABUPATEN MANGGARAI").toUpperCase();
      let dinasName = (config?.dinasName || "DINAS PENDIDIKAN PEMUDA DAN OLAHRAGA").toUpperCase();
      
      if (dinasName.startsWith(govName)) {
        dinasName = dinasName.replace(govName, "").trim();
      }

      const schoolName = (config?.schoolName || "SMP NEGERI 5 LANGKE REMBONG").toUpperCase();
      const schoolAddress = config?.schoolAddress || "Alamat: Mando, Kelurahan Compang Carep, Kecamatan Langke Rembong";
      const academicYear = (config?.academicYear || "-").toUpperCase();
      const hTeacher = selectedClassForStudents.homeroomTeacher || "-";
      const className = selectedClassForStudents.name.toUpperCase();

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(govName, 105, 12, { align: "center" });
      doc.text(dinasName, 105, 17, { align: "center" });
      doc.setFontSize(13);
      doc.text(schoolName, 105, 23, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text(schoolAddress, 105, 28, { align: "center" });
      doc.setLineWidth(0.6);
      doc.line(14, 31, 196, 31); 
      doc.setLineWidth(0.1);
      doc.line(14, 32, 196, 32); 

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("DAFTAR MURID", 105, 42, { align: "center" });
      doc.setFontSize(10);
      doc.text(`TAHUN PELAJARAN ${academicYear}`, 105, 47, { align: "center" });

      doc.setFontSize(9);
      doc.text(`KELAS: ${className}`, 14, 56);
      doc.text(`WALI KELAS: ${hTeacher}`, 196, 56, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(`Total Siswa: ${classGenderStats.total} (L: ${classGenderStats.male}, P: ${classGenderStats.female})`, 14, 61);

      const tableHead = [
        [{ content: 'NOMOR', colSpan: 3, styles: { halign: 'center', fontStyle: 'bold' } }, { content: 'NAMA SISWA', rowSpan: 2, styles: { valign: 'middle', fontStyle: 'bold' } }, { content: 'LP', rowSpan: 2, styles: { valign: 'middle', halign: 'center', fontStyle: 'bold' } }, { content: 'KETERANGAN', rowSpan: 2, styles: { valign: 'middle', halign: 'center', fontStyle: 'bold' } }],
        ['URUT', 'NISN', 'NIS']
      ];

      const tableBody = currentClassStudents.map((s, i) => [
        i + 1,
        s.NISN || "-",
        s.NIS || "-",
        s.fullName,
        s.gender === 'Laki-laki' ? 'L' : 'P',
        ""
      ]);

      autoTable(doc, {
        head: tableHead,
        body: tableBody,
        startY: 65,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 1.2, textColor: [0, 0, 0], lineColor: [0, 0, 0] },
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineWidth: 0.2 },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 22, halign: 'center' },
          2: { cellWidth: 18, halign: 'center' },
          4: { cellWidth: 10, halign: 'center' },
          5: { cellWidth: 22 }
        },
        margin: { bottom: 10 }
      });

      doc.save(`Daftar_Murid_${className.replace(/\s+/g, '_')}.pdf`);
      toast({ title: "Laporan Berhasil Diunduh" });
    } catch (e) {
      toast({ variant: "destructive", title: "Gagal mencetak PDF" });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadMonthlyAttendancePDF = async () => {
    if (!selectedClassForStudents || currentClassStudents.length === 0) return;
    setIsExporting(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF('l', 'mm', 'a4');

      const govName = (config?.govName || "PEMERINTAH KABUPATEN MANGGARAI").toUpperCase();
      let dinasName = (config?.dinasName || "DINAS PENDIDIKAN PEMUDA DAN OLAHRAGA").toUpperCase();
      if (dinasName.startsWith(govName)) dinasName = dinasName.replace(govName, "").trim();

      const schoolName = (config?.schoolName || "SMP NEGERI 5 LANGKE REMBONG").toUpperCase();
      const schoolAddress = config?.schoolAddress || "Alamat: Mando, Kelurahan Compang Carep, Kecamatan Langke Rembong";
      const academicYear = (config?.academicYear || "-").toUpperCase();
      const hTeacher = selectedClassForStudents.homeroomTeacher || "-";
      const className = selectedClassForStudents.name.toUpperCase();

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(govName, 148.5, 10, { align: "center" });
      doc.text(dinasName, 148.5, 14, { align: "center" });
      doc.setFontSize(12);
      doc.text(schoolName, 148.5, 20, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(schoolAddress, 148.5, 24, { align: "center" });
      doc.setLineWidth(0.6);
      doc.line(14, 27, 283, 27); 
      doc.setLineWidth(0.1);
      doc.line(14, 28, 283, 28); 

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("DAFTAR HADIR SISWA (BULANAN)", 148.5, 36, { align: "center" });
      doc.setFontSize(9);
      doc.text(`TAHUN PELAJARAN ${academicYear}`, 148.5, 41, { align: "center" });

      doc.setFontSize(8);
      doc.text(`KELAS: ${className}`, 14, 48);
      doc.text(`WALI KELAS: ${hTeacher}`, 283, 48, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.text(`Total: ${classGenderStats.total} (L: ${classGenderStats.male}, P: ${classGenderStats.female})`, 14, 52);

      const daysHeader = Array.from({ length: 31 }, (_, i) => (i + 1).toString());
      const tableHead = [
        ['NO', 'NAMA SISWA', 'LP', ...daysHeader, 'S', 'I', 'A']
      ];

      const tableBody = currentClassStudents.map((s, i) => [
        i + 1,
        s.fullName,
        s.gender === 'Laki-laki' ? 'L' : 'P',
        ...Array(31).fill(""),
        "", "", ""
      ]);

      autoTable(doc, {
        head: tableHead,
        body: tableBody,
        startY: 55,
        theme: 'grid',
        styles: { fontSize: 6, cellPadding: 0.8, textColor: [0, 0, 0], lineColor: [0, 0, 0], halign: 'center' },
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineWidth: 0.1, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 7 },
          1: { cellWidth: 50, halign: 'left' },
          2: { cellWidth: 6 },
          ...Object.fromEntries(Array.from({length: 31}, (_, i) => [i + 3, { cellWidth: 6.2 }])),
          34: { cellWidth: 6 },
          35: { cellWidth: 6 },
          36: { cellWidth: 6 }
        },
        margin: { left: 14, right: 14 }
      });

      doc.save(`Absensi_Bulanan_${className.replace(/\s+/g, '_')}.pdf`);
      toast({ title: "Laporan Berhasil Diunduh" });
    } catch (e) {
      toast({ variant: "destructive", title: "Gagal mencetak PDF" });
    } finally {
      setIsExporting(false);
    }
  };

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

  if (loadingClasses && !localClasses.length) return <div className="flex justify-center py-24"><Loader2 className="animate-spin text-primary" /></div>

  if (view === 'students' && selectedClassForStudents) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => { setView('grid'); setEditingClass(null); setIsAddStudentMode(false); }} className="rounded-full border"><ArrowLeft className="w-5 h-5" /></Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-headline font-bold">Daftar Murid: Kelas {selectedClassForStudents.name}</h1>
                <Badge variant="outline" className="font-mono">Tingkat {selectedClassForStudents.gradeLevel}</Badge>
              </div>
              <p className="text-muted-foreground text-sm">Manajemen data siswa dalam rombongan belajar ini.</p>
              
              <div className="flex items-center gap-3 mt-3">
                 <Badge className="bg-primary/10 text-primary border-primary/20 gap-1.5 py-1 px-3">
                   <Users className="w-3.5 h-3.5" /> TOTAL: {classGenderStats.total}
                 </Badge>
                 <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 gap-1.5 py-1 px-3">
                   <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div> L: {classGenderStats.male}
                 </Badge>
                 <Badge className="bg-pink-500/10 text-pink-500 border-pink-500/20 gap-1.5 py-1 px-3">
                   <div className="w-1.5 h-1.5 rounded-full bg-pink-500"></div> P: {classGenderStats.female}
                 </Badge>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleDownloadStudentsPDF} disabled={isExporting} className="gap-2 border-primary/30 text-primary">
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
              Cetak Daftar Murid
            </Button>
            <Button variant="outline" onClick={handleDownloadMonthlyAttendancePDF} disabled={isExporting} className="gap-2 border-accent/30 text-accent">
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              Cetak Absensi Bulanan
            </Button>
            <Button variant="outline" onClick={handleDownloadTemplate} className="gap-2"><Download className="w-4 h-4" /> Template</Button>
            <label className="cursor-pointer">
               <div className="flex items-center gap-2 border border-green-500/20 text-green-500 bg-green-500/5 hover:bg-green-500/10 h-10 px-4 py-2 rounded-md text-sm font-medium transition-colors">
                  <FileSpreadsheet className="w-4 h-4" /> Impor Excel
               </div>
               <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleImportExcel} />
            </label>
            <Button variant="outline" onClick={() => setIsClearAllDialogOpen(true)} className="gap-2 text-destructive border-destructive/20 hover:bg-destructive/5" disabled={currentClassStudents.length === 0}>
               <Trash className="w-4 h-4" /> Kosongkan Rombel
            </Button>
            <Button onClick={() => setIsAddStudentMode(!isAddStudentMode)} className="gap-2 bg-primary">
              {isAddStudentMode ? <X className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
              {isAddStudentMode ? "Batal Tambah" : "Tambah Murid"}
            </Button>
          </div>
        </div>

        {isAddStudentMode ? (
          <div className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-sm animate-in slide-in-from-top-4 duration-300">
            <div className="p-4 border-b bg-accent/5 flex items-center justify-between">
              <h3 className="font-bold text-xs uppercase text-accent tracking-widest flex items-center gap-2"><Plus className="w-3 h-3" /> Pilih Murid untuk Masuk Kelas</h3>
              <div className="relative w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Cari Nama/NISN/NIS..." className="pl-9 bg-background" value={studentSearch} onChange={e => setStudentSearch(e.target.value)} />
              </div>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[600px] overflow-y-auto">
              {availableStudents
                .filter(s => s.fullName.toLowerCase().includes(studentSearch.toLowerCase()) || (s.NISN || "").includes(studentSearch) || (s.NIS || "").includes(studentSearch))
                .map(s => (
                <div key={s.id} className="flex items-center justify-between p-4 rounded-xl hover:bg-muted/50 border border-border/40 bg-muted/20 transition-all group">
                   <div className="flex flex-col">
                     <span className="text-sm font-bold group-hover:text-primary transition-colors">{s.fullName}</span>
                     <span className="text-[10px] text-muted-foreground font-mono">NIS: {s.NIS || "-"} | {s.gender}</span>
                   </div>
                   <Button size="sm" variant="outline" className="h-8 px-4 text-primary border-primary/20 hover:bg-primary hover:text-white text-[10px] font-bold" onClick={() => handleAddStudentToClass(s.id)}>Pilih <ChevronRight className="w-3 h-3 ml-1" /></Button>
                </div>
              ))}
              {availableStudents.length === 0 && (
                <div className="col-span-full py-20 text-center text-muted-foreground italic flex flex-col items-center gap-4">
                  <Users className="w-12 h-12 opacity-10" />
                  <p>Seluruh murid di database sudah memiliki kelas.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50 border-b">
                  <TableRow>
                    <TableHead className="w-16 text-center font-bold">No</TableHead>
                    <TableHead className="font-bold w-[140px]">NISN</TableHead>
                    <TableHead className="font-bold w-[120px]">NIS</TableHead>
                    <TableHead className="font-bold">Nama Murid</TableHead>
                    <TableHead className="font-bold text-center">LP</TableHead>
                    <TableHead className="font-bold">Status</TableHead>
                    <TableHead className="text-right font-bold pr-8">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentClassStudents.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-32 text-muted-foreground italic flex flex-col items-center gap-4">
                      <GraduationCap className="w-16 h-16 opacity-5" />
                      <p>Belum ada murid di kelas ini. Klik tombol "Tambah Murid" atau "Impor Excel" untuk mengisi rombel.</p>
                    </TableCell></TableRow>
                  ) : currentClassStudents.map((s, idx) => (
                    <TableRow key={s.id} className="hover:bg-muted/10 transition-colors h-16">
                      <TableCell className="text-center font-mono text-xs text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{s.NISN || "-"}</TableCell>
                      <TableCell className="font-mono text-xs font-bold text-primary">{s.NIS || "-"}</TableCell>
                      <TableCell className="font-bold text-sm text-foreground">{s.fullName}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-[9px] font-bold">
                          {s.gender === 'Laki-laki' ? 'L' : 'P'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-[10px] py-0.5 px-3 font-bold gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                          {s.admissionStatus === 'graduated' ? 'LULUSAN' : 'AKTIF'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" asChild title="Lihat Detail">
                            <Link href={`/dashboard/applicants/${s.id}`}><Eye className="w-4 h-4" /></Link>
                          </Button>
                          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-primary hover:bg-primary/5" onClick={() => handleEditStudent(s)} title="Edit Biodata">
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-destructive hover:bg-destructive/5" onClick={() => handleRemoveStudentFromClass(s.id)} title="Hapus dari Kelas">
                            <UserMinus className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <div className="bg-primary/5 p-4 rounded-xl border border-primary/20 flex gap-4 mt-8">
           <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
           <div className="text-xs text-muted-foreground leading-relaxed italic">
             Data yang Anda kelola bersifat <strong>Offline Draf</strong>. Impor Excel akan mendaftarkan murid baru secara otomatis jika belum ada di database. Klik <strong>"Sinkronkan ke Cloud"</strong> untuk menyimpan permanen.
           </div>
        </div>

        <Dialog open={isEditStudentOpen} onOpenChange={setIsEditStudentOpen}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>Edit Biodata Siswa</DialogTitle>
              <DialogDescription>Ubah data dasar murid di draf lokal.</DialogDescription>
            </DialogHeader>
            <Form {...studentEditForm}>
              <form onSubmit={studentEditForm.handleSubmit(onSaveStudentLocal)} className="space-y-4 pt-4">
                <FormField control={studentEditForm.control} name="fullName" render={({ field }) => (
                  <FormItem><FormLabel>Nama Lengkap</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={studentEditForm.control} name="NIS" render={({ field }) => (
                    <FormItem><FormLabel>NIS</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={studentEditForm.control} name="NISN" render={({ field }) => (
                    <FormItem><FormLabel>NISN</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                  )} />
                </div>
                <FormField control={studentEditForm.control} name="gender" render={({ field }) => (
                  <FormItem><FormLabel>Jenis Kelamin</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="Laki-laki">Laki-laki</SelectItem>
                        <SelectItem value="Perempuan">Perempuan</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <DialogFooter className="pt-4"><Button type="submit" className="w-full">Simpan Perubahan Draf</Button></DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={isClearAllDialogOpen} onOpenChange={setIsClearAllDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Trash className="w-5 h-5 text-destructive" /> Kosongkan Daftar Murid?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Apakah Anda yakin ingin mengeluarkan **seluruh murid** ({currentClassStudents.length}) dari Kelas **{selectedClassForStudents.name}**? Data biodata murid tetap aman di database induk.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Batal</AlertDialogCancel>
              <AlertDialogAction onClick={handleClearAllStudents} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Ya, Kosongkan Sekarang
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

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
            <Button onClick={handleSyncToCloud} disabled={isSyncing} className="bg-green-600 gap-2 shadow-lg shadow-green-500/20">
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
                const isGrade9 = cls.gradeLevel >= 9

                return (
                  <Card key={cls.id} className={`border-border/50 relative group transition-all hover:border-primary/50 shadow-sm hover:shadow-md ${isTemp ? 'bg-amber-500/5 border-dashed border-2' : ''}`}>
                    <Button variant="ghost" size="icon" className="absolute top-2 right-2 text-destructive opacity-0 group-hover:opacity-100 hover:bg-destructive/10" onClick={() => handleDeleteTrigger(cls)}><Trash2 className="w-4 h-4" /></Button>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-xl">Kelas {cls.name} {isTemp && <RefreshCw className="w-4 h-4 text-amber-500 animate-spin" />}</CardTitle>
                      <CardDescription className="flex items-center justify-between mt-1">
                        <div className="flex items-center gap-2">
                          <Users className="w-3.5 h-3.5" />
                          <span className="font-bold text-foreground">{cls.currentEnrollment || 0}</span> / {cls.capacity} Murid
                        </div>
                        {cls.currentEnrollment > 0 && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className={`h-7 text-[9px] font-bold uppercase gap-1 ${isGrade9 ? 'text-green-500 border-green-500/20' : 'text-accent border-accent/20'}`}
                            onClick={() => { setClassToPromote(cls); setIsPromotionDialogOpen(true); }}
                          >
                            {isGrade9 ? <CheckCircle2 className="w-3 h-3" /> : <ArrowUpCircle className="w-3 h-3" />}
                            {isGrade9 ? "Lulus" : "Naik"}
                          </Button>
                        )}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="bg-muted/30 p-3 rounded-lg text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                        Wali Kelas: <span className="text-primary block mt-1 text-sm normal-case font-bold">{cls.homeroomTeacher || "Belum Ditentukan"}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-2">
                        <Button variant="outline" className="w-full text-xs gap-2 border-primary/20 hover:bg-primary/5" onClick={() => { setEditingClass(cls); form.reset({...cls, gradeLevel: cls.gradeLevel.toString(), capacity: cls.capacity.toString()}); setIsDialogOpen(true); }}>
                          <Pencil className="w-3.5 h-3.5" /> Edit Kelas
                        </Button>
                        <Button variant="default" className="w-full text-xs gap-2 bg-primary shadow-lg shadow-primary/20" onClick={() => { setSelectedClassForStudents(cls); setView('students'); }}>
                          <Users className="w-3.5 h-3.5" /> Daftar Murid
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="bg-accent/5 p-5 rounded-xl border border-accent/20 flex gap-5">
         <Info className="w-6 h-6 text-accent shrink-0 mt-0.5" />
         <div className="text-xs text-muted-foreground leading-relaxed italic">
           Sistem menggunakan <strong>Mode Offline Buffer</strong>. Menu ini adalah pintu masuk utama data murid. Anda dapat mengatur kelas dan memendaftarkan murid baru secara massal via Excel di sini.
         </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader><DialogTitle className="font-headline">{editingClass ? 'Ubah Informasi Rombel' : 'Tambah Rombongan Belajar'}</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSaveLocal)} className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel className="text-[10px] font-bold uppercase">Nama Kelas</FormLabel><FormControl><Input placeholder="7-A" {...field} value={field.value || ""} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="gradeLevel" render={({ field }) => (
                  <FormItem><FormLabel className="text-[10px] font-bold uppercase">Tingkat</FormLabel><FormControl><Input type="number" {...field} value={field.value || ""} /></FormControl></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="homeroomTeacher" render={({ field }) => (
                <FormItem><FormLabel className="text-[10px] font-bold uppercase">Wali Kelas</FormLabel><FormControl><Input placeholder="Nama Lengkap Guru" {...field} value={field.value || ""} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="capacity" render={({ field }) => (
                <FormItem><FormLabel className="text-[10px] font-bold uppercase">Kapasitas Maksimal</FormLabel><FormControl><Input type="number" {...field} value={field.value || ""} /></FormControl></FormItem>
              )} />
              <DialogFooter className="pt-4"><Button type="submit" className="w-full h-11">Simpan ke Buffer</Button></DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">Hapus Rombel?</AlertDialogTitle>
            <AlertDialogDescription>Tindakan ini menghapus draf kelas Anda. Murid di dalamnya akan dikeluarkan dari rombel tapi data profil mereka tetap aman di Data Induk.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={executeDeleteLocal} className="bg-destructive text-destructive-foreground">Ya, Hapus Kelas</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isPromotionDialogOpen} onOpenChange={setIsPromotionDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {classToPromote?.gradeLevel && classToPromote.gradeLevel >= 9 ? <School className="w-5 h-5 text-green-500" /> : <ArrowUpCircle className="w-5 h-5 text-accent" />}
              {classToPromote?.gradeLevel && classToPromote.gradeLevel >= 9 ? "Konfirmasi Kelulusan Massal" : "Konfirmasi Kenaikan Kelas"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {classToPromote?.gradeLevel && classToPromote.gradeLevel >= 9 
                ? `Apakah Anda yakin ingin meluluskan seluruh murid (${classToPromote.currentEnrollment}) dari Kelas ${classToPromote.name}? Status mereka akan diubah menjadi LULUS.`
                : `Murid dari Kelas ${classToPromote?.name} akan dikeluarkan dari rombel ini agar Anda dapat memasukkan mereka ke kelas tingkat berikutnya. Lanjutkan?`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handlePromoteClassLocal} 
              className={classToPromote?.gradeLevel && classToPromote.gradeLevel >= 9 ? "bg-green-600 hover:bg-green-700" : "bg-accent hover:bg-accent/90"}
            >
              Ya, Proses Sekarang
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
