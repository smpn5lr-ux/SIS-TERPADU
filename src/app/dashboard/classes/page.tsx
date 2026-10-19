
"use client"

import { useState, useEffect, useMemo } from 'react'
import { 
  Users, 
  Trash2, 
  Shuffle, 
  Plus,
  Pencil,
  Eye,
  FileDown,
  FileSpreadsheet,
  FileText as FilePdf,
  ChevronDown,
  ClipboardList,
  AlertTriangle,
  ShieldAlert,
  DatabaseZap,
  Loader2,
  CheckCircle2,
  Settings2,
  ArrowLeftRight,
  UserMinus,
  GraduationCap,
  QrCode,
  UserPlus,
  Search,
  Upload,
  Check
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useCollection, useFirestore, useMemoFirebase, useDoc } from '@/firebase'
import { collection, doc, updateDoc, writeBatch, addDoc, query, orderBy, deleteDoc } from 'firebase/firestore'
import { Applicant, Classroom } from '@/lib/types'
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { errorEmitter } from '@/firebase/error-emitter'
import { FirestorePermissionError } from '@/firebase/errors'
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
  const [isShuffling, setIsShuffling] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isShuffleDialogOpen, setIsShuffleDialogOpen] = useState(false)
  const [isViewOpen, setIsViewOpen] = useState(false)
  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false)
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false)
  
  const [editingClass, setEditingClass] = useState<Classroom | null>(null)
  const [selectedClassForView, setSelectedClassForView] = useState<Classroom | null>(null)
  const [classToDelete, setClassToDelete] = useState<Classroom | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  
  const [studentToMove, setStudentToMove] = useState<Applicant | null>(null)
  const [targetClassId, setTargetClassId] = useState<string>("")
  const [movingStudent, setMovingStudent] = useState(false)
  const [studentSearch, setStudentSearch] = useState("")
  const [selectedStudentsToAdd, setSelectedStudentsToAdd] = useState<string[]>([])

  const [shuffleOptions, setShuffleOptions] = useState({
    balanceGender: true,
    balanceSchool: true
  })

  const [submitting, setSubmitting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const { toast } = useToast()
  const db = useFirestore()

  const classesQuery = useMemoFirebase(() => {
    if (!db) return null
    return query(collection(db, 'classes'), orderBy('name', 'asc'))
  }, [db])

  const applicantsQuery = useMemoFirebase(() => {
    if (!db) return null
    return collection(db, 'applicants')
  }, [db])

  const settingsRef = useMemoFirebase(() => {
    if (!db) return null
    return doc(db, 'settings', 'system')
  }, [db])

  const { data: classes, loading: loadingClasses } = useCollection<Classroom>(classesQuery)
  const { data: applicants } = useCollection<Applicant>(applicantsQuery)
  const { data: systemSettings } = useDoc<any>(settingsRef)

  const dinasName = systemSettings?.dinasName || "DINAS PENDIDIKAN"
  const schoolName = systemSettings?.schoolName || "SIS TERPADU"

  const unassignedStudents = useMemo(() => {
    if (!applicants || !classes) return []
    const allAssignedIds = new Set(classes.flatMap(c => c.students || []))
    return applicants.filter(a => 
      !a.isDeleted && 
      a.admissionStatus === 'accepted' && 
      !allAssignedIds.has(a.id)
    ).sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""))
  }, [applicants, classes])

  const filteredUnassigned = useMemo(() => {
    return unassignedStudents.filter(s => 
      s.fullName.toLowerCase().includes(studentSearch.toLowerCase()) || 
      (s.NISN || "").includes(studentSearch)
    )
  }, [unassignedStudents, studentSearch])

  const form = useForm<z.infer<typeof classFormSchema>>({
    resolver: zodResolver(classFormSchema),
    defaultValues: {
      name: "",
      gradeLevel: "7",
      homeroomTeacher: "",
      capacity: "32",
    },
  })

  useEffect(() => {
    if (editingClass) {
      form.reset({
        name: editingClass.name,
        gradeLevel: editingClass.gradeLevel.toString(),
        homeroomTeacher: editingClass.homeroomTeacher || "",
        capacity: editingClass.capacity.toString(),
      })
    } else {
      form.reset({
        name: "",
        gradeLevel: "7",
        homeroomTeacher: "",
        capacity: "32",
      })
    }
  }, [editingClass, form])

  const handleView = (cls: Classroom) => {
    setSelectedClassForView(cls)
    setIsViewOpen(true)
  }

  const handleSyncStudents = async () => {
    if (!applicants || !db || isSyncing) return
    setIsSyncing(true)
    
    const batch = writeBatch(db)
    let syncCount = 0
    
    const eligible = applicants.filter(a => 
      !a.isDeleted && 
      (a.verificationStatus === 'Lengkap' || a.verificationStatus === 'Perlu Perbaikan') &&
      a.admissionStatus !== 'accepted'
    )
    
    if (eligible.length === 0) {
      toast({
        title: "Sudah Sinkron",
        description: "Tidak ada data murid baru yang perlu ditarik."
      })
      setIsSyncing(false)
      return
    }

    try {
      eligible.forEach(a => {
        const docRef = doc(db, 'applicants', a.id)
        batch.update(docRef, { admissionStatus: 'accepted' })
        syncCount++
      })
      
      await batch.commit()
      toast({
        title: "Sinkronisasi Berhasil",
        description: `${syncCount} murid berhasil ditarik ke manajemen kelas.`
      })
    } catch (err) {
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'applicants', operation: 'write' }))
    } finally {
      setIsSyncing(false)
    }
  }

  const onClassSubmit = (values: z.infer<typeof classFormSchema>) => {
    if (!db || submitting || !classes) return
    
    const isDuplicateName = classes.some(cls => 
      cls.name.toLowerCase() === values.name.toLowerCase() && 
      (!editingClass || cls.id !== editingClass.id)
    )
    
    if (isDuplicateName) {
      toast({
        variant: "destructive",
        title: "Nama Kelas Duplikat",
        description: `Kelas dengan nama "${values.name}" sudah ada.`,
      })
      return
    }

    setSubmitting(true)
    const classData = {
      name: values.name,
      gradeLevel: parseInt(values.gradeLevel),
      homeroomTeacher: values.homeroomTeacher || "",
      capacity: parseInt(values.capacity),
    }

    if (editingClass) {
      const classRef = doc(db, 'classes', editingClass.id)
      updateDoc(classRef, classData)
        .then(() => {
          setIsDialogOpen(false)
          setEditingClass(null)
          toast({ title: "Kelas Diperbarui" })
        })
        .catch(async () => {
          errorEmitter.emit('permission-error', new FirestorePermissionError({ path: classRef.path, operation: 'update' }))
        })
        .finally(() => setSubmitting(false))
    } else {
      const newClass = {
        ...classData,
        currentEnrollment: 0,
        students: []
      }
      addDoc(collection(db, 'classes'), newClass)
        .then(() => {
          setIsDialogOpen(false)
          form.reset()
          toast({ title: "Kelas Berhasil Dibuat" })
        })
        .catch(async () => {
          errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'classes', operation: 'create' }))
        })
        .finally(() => setSubmitting(false))
    }
  }

  const handleShuffle = () => {
    if (!applicants || !classes || !db || classes.length === 0) {
      toast({ variant: "destructive", title: "Gagal", description: "Buat rombel terlebih dahulu." })
      return
    }

    const acceptedStudents = applicants.filter(a => a.admissionStatus === 'accepted' && !a.isDeleted)
    
    if (acceptedStudents.length === 0) {
      toast({
        variant: "destructive",
        title: "Tidak ada data",
        description: "Belum ada murid dengan status 'Diterima'. Klik 'Ambil Data Murid' terlebih dahulu.",
      })
      return
    }

    setIsShuffling(true)
    setIsShuffleDialogOpen(false)
    
    setTimeout(async () => {
      try {
        const batch = writeBatch(db)
        const sortedClasses = [...classes].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
        const classBuckets: string[][] = sortedClasses.map(() => [])
        
        let pool = [...acceptedStudents]
        
        if (shuffleOptions.balanceGender) {
          let males = pool.filter(s => s.gender === 'Laki-laki')
          let females = pool.filter(s => s.gender === 'Perempuan')

          if (shuffleOptions.balanceSchool) {
            males.sort((a, b) => (a.originSchool || "").localeCompare(b.originSchool || ""))
            females.sort((a, b) => (a.originSchool || "").localeCompare(b.originSchool || ""))
          } else {
            males.sort(() => Math.random() - 0.5)
            females.sort(() => Math.random() - 0.5)
          }

          const combinedPool = [...males, ...females]
          let currentClassIdx = 0
          combinedPool.forEach((student) => {
            classBuckets[currentClassIdx].push(student.id)
            currentClassIdx = (currentClassIdx + 1) % sortedClasses.length
          })
        } else {
          if (shuffleOptions.balanceSchool) {
            pool.sort((a, b) => (a.originSchool || "").localeCompare(b.originSchool || ""))
          } else {
            pool.sort(() => Math.random() - 0.5)
          }

          let currentClassIdx = 0
          pool.forEach((student) => {
            classBuckets[currentClassIdx].push(student.id)
            currentClassIdx = (currentClassIdx + 1) % sortedClasses.length
          })
        }

        sortedClasses.forEach((cls, idx) => {
          const classRef = doc(db, 'classes', cls.id)
          batch.update(classRef, {
            currentEnrollment: classBuckets[idx].length,
            students: classBuckets[idx]
          })
        })
        
        await batch.commit()
        toast({ title: "Distribusi Berhasil", description: "Murid telah dibagikan secara merata." })
      } catch (err) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'classes', operation: 'write' }))
      } finally {
        setIsShuffling(false)
      }
    }, 1200)
  }

  const handleAddStudentsToClass = async () => {
    if (!db || !selectedClassForView || selectedStudentsToAdd.length === 0) return
    setSubmitting(true)

    const classRef = doc(db, 'classes', selectedClassForView.id)
    const updatedStudents = [...(selectedClassForView.students || []), ...selectedStudentsToAdd]
    
    if (updatedStudents.length > selectedClassForView.capacity) {
      toast({ variant: "destructive", title: "Kapasitas Penuh", description: "Jumlah murid melebihi kapasitas kelas." })
      setSubmitting(false)
      return
    }

    try {
      await updateDoc(classRef, {
        students: updatedStudents,
        currentEnrollment: updatedStudents.length
      })
      toast({ title: "Murid Berhasil Ditambahkan" })
      setSelectedClassForView({
        ...selectedClassForView,
        students: updatedStudents,
        currentEnrollment: updatedStudents.length
      })
      setIsAddStudentOpen(false)
      setSelectedStudentsToAdd([])
    } catch (err) {
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: classRef.path, operation: 'update' }))
    } finally {
      setSubmitting(false)
    }
  }

  const handleImportExcelToClass = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedClassForView) return
    setSubmitting(true)

    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const content = event.target?.result
        const workbook = XLSX.read(content, { type: 'binary' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(sheet)
        
        const matchedIds: string[] = []
        data.forEach((row: any) => {
          const name = (row['NAMA'] || row['Nama Lengkap'] || row['Nama'] || "").toString().toLowerCase().trim()
          const nisn = (row['NISN'] || "").toString().trim()
          
          const match = unassignedStudents.find(s => 
            (nisn && s.NISN === nisn) || 
            (name && s.fullName.toLowerCase().trim() === name)
          )
          
          if (match) matchedIds.push(match.id)
        })

        if (matchedIds.length === 0) {
          toast({ variant: "destructive", title: "Tidak Ada Data Cocok", description: "Gunakan Nama atau NISN yang sesuai dengan database." })
          return
        }

        const uniqueMatches = Array.from(new Set(matchedIds))
        const finalStudents = [...(selectedClassForView.students || []), ...uniqueMatches]
        
        if (finalStudents.length > selectedClassForView.capacity) {
          toast({ variant: "destructive", title: "Kapasitas Melebihi Batas", description: "Beberapa murid tidak dimasukkan karena kelas penuh." })
        }

        const slicedStudents = finalStudents.slice(0, selectedClassForView.capacity)
        const classRef = doc(db, 'classes', selectedClassForView.id)
        
        await updateDoc(classRef, {
          students: slicedStudents,
          currentEnrollment: slicedStudents.length
        })

        toast({ title: "Impor Berhasil", description: `${slicedStudents.length - selectedClassForView.students.length} murid ditambahkan ke kelas.` })
        setSelectedClassForView({
          ...selectedClassForView,
          students: slicedStudents,
          currentEnrollment: slicedStudents.length
        })
        setIsAddStudentOpen(false)
      } catch (err) {
        toast({ variant: "destructive", title: "Gagal Impor" })
      } finally {
        setSubmitting(false)
        e.target.value = ''
      }
    }
    reader.readAsBinaryString(file)
  }

  const handleMoveStudentTrigger = (student: Applicant) => {
    setStudentToMove(student)
    setIsMoveDialogOpen(true)
  }

  const executeMoveStudent = async () => {
    if (!db || !studentToMove || !selectedClassForView || !targetClassId || !classes) return
    setMovingStudent(true)

    const targetClass = classes.find(c => c.id === targetClassId)
    if (!targetClass) return

    if (targetClass.students.length >= targetClass.capacity) {
      toast({ variant: "destructive", title: "Gagal", description: "Kelas tujuan sudah penuh." })
      setMovingStudent(false)
      return
    }

    const batch = writeBatch(db)
    
    const sourceRef = doc(db, 'classes', selectedClassForView.id)
    const newSourceStudents = selectedClassForView.students.filter(id => id !== studentToMove.id)
    batch.update(sourceRef, {
      students: newSourceStudents,
      currentEnrollment: newSourceStudents.length
    })

    const targetRef = doc(db, 'classes', targetClassId)
    const newTargetStudents = [...targetClass.students, studentToMove.id]
    batch.update(targetRef, {
      students: newTargetStudents,
      currentEnrollment: newTargetStudents.length
    })

    try {
      await batch.commit()
      toast({ title: "Berhasil Dipindahkan", description: `${studentToMove.fullName} dipindahkan ke Kelas ${targetClass.name}.` })
      
      setSelectedClassForView({
        ...selectedClassForView,
        students: newSourceStudents,
        currentEnrollment: newSourceStudents.length
      })
      
      setIsMoveDialogOpen(false)
      setStudentToMove(null)
      setTargetClassId("")
    } catch (err) {
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'classes', operation: 'write' }))
    } finally {
      setMovingStudent(false)
    }
  }

  const handleRemoveFromClass = async (student: Applicant) => {
    if (!db || !selectedClassForView) return
    
    const sourceRef = doc(db, 'classes', selectedClassForView.id)
    const newStudents = selectedClassForView.students.filter(id => id !== student.id)
    
    updateDoc(sourceRef, {
      students: newStudents,
      currentEnrollment: newStudents.length
    }).then(() => {
      toast({ title: "Dikeluarkan dari Rombel", description: `${student.fullName} telah dikeluarkan dari kelas.` })
      setSelectedClassForView({
        ...selectedClassForView,
        students: newStudents,
        currentEnrollment: newStudents.length
      })
    }).catch(async () => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: sourceRef.path, operation: 'update' }))
    })
  }

  const handleExportClass = async (cls: Classroom, format: 'excel' | 'pdf' | 'attendance' | 'qr') => {
    if (!applicants) return
    setIsExporting(true)
    
    const students = applicants
      .filter(a => cls.students.includes(a.id))
      .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""))
    
    const maleCount = students.filter(s => s.gender === 'Laki-laki').length
    const femaleCount = students.filter(s => s.gender === 'Perempuan').length
    const summaryLabel = `Total: ${students.length} (L: ${maleCount}, P: ${femaleCount})`

    try {
      const { default: jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')
      const headerColor = [67, 97, 238] as [number, number, number]

      if (format === 'excel') {
        const headerInfo = [
          [dinasName.toUpperCase()],
          [schoolName.toUpperCase()],
          [],
          [`DAFTAR MURID - KELAS ${cls.name}`],
          [`Wali Kelas: ${cls.homeroomTeacher || '-'}`],
          [summaryLabel],
          []
        ]

        const data = students.map((s, idx) => ({
          "No.": idx + 1,
          "Nama Lengkap": s.fullName,
          "NISN": s.NISN,
          "Jenis Kelamin": s.gender,
          "Sekolah Asal": s.originSchool
        }))

        const worksheet = XLSX.utils.aoa_to_sheet(headerInfo)
        XLSX.utils.sheet_add_json(worksheet, data, { origin: "A8", skipHeader: false })
        
        const workbook = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(workbook, worksheet, `Kelas ${cls.name}`)
        XLSX.writeFile(workbook, `Daftar_Murid_Kelas_${cls.name}.xlsx`)
      } else if (format === 'qr') {
        const doc = new jsPDF('p', 'mm', 'a4')
        
        doc.setFontSize(14).setFont("helvetica", "bold").setTextColor(headerColor[0], headerColor[1], headerColor[2])
        doc.text(`KARTU QR ABSENSI - KELAS ${cls.name}`, 105, 15, { align: "center" })
        doc.setFontSize(10).setTextColor(100).setFont("helvetica", "normal")
        doc.text(`${schoolName}`, 105, 20, { align: "center" })
        doc.line(14, 25, 196, 25)

        let x = 10;
        let y = 35;
        const cardWidth = 62;
        const cardHeight = 68;
        const margin = 2;

        students.forEach((s, idx) => {
          doc.setDrawColor(230).setLineWidth(0.2).rect(x, y, cardWidth, cardHeight)
          doc.setFillColor(headerColor[0], headerColor[1], headerColor[2]).rect(x, y, cardWidth, 5, 'F')
          
          doc.setFontSize(7).setFont("helvetica", "bold").setTextColor(0)
          const truncatedName = s.fullName.length > 25 ? s.fullName.substring(0, 23) + "..." : s.fullName
          doc.text(truncatedName.toUpperCase(), x + cardWidth/2, y + 12, { align: "center" })
          
          doc.setFontSize(6).setFont("helvetica", "normal").setTextColor(100)
          doc.text(`NISN: ${s.NISN || "-"}`, x + cardWidth/2, y + 17, { align: "center" })

          doc.setFontSize(6).setFont("helvetica", "bold").setTextColor(headerColor[0], headerColor[1], headerColor[2])
          doc.text(`KELAS: ${cls.name}`, x + cardWidth/2, y + 22, { align: "center" })

          const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${s.id}`
          doc.addImage(qrUrl, 'PNG', x + (cardWidth - 35) / 2, y + 26, 35, 35)
          
          doc.setFontSize(5).setTextColor(150).text("SCAN UNTUK ABSEN MANDIRI", x + cardWidth/2, y + 65, { align: "center" })

          x += cardWidth + margin;
          if (x + cardWidth > 200) {
            x = 10;
            y += cardHeight + margin;
          }
          if (y + cardHeight > 280) {
            doc.addPage()
            y = 15;
            x = 10;
          }
        })
        
        doc.save(`Kartu_QR_Absensi_${cls.name}.pdf`)
      } else {
        const doc = new jsPDF()
        
        doc.setFontSize(12).setFont("helvetica", "bold").setTextColor(headerColor[0], headerColor[1], headerColor[2])
        doc.text(dinasName.toUpperCase(), 105, 15, { align: "center" })
        doc.text(schoolName.toUpperCase(), 105, 22, { align: "center" })
        doc.setDrawColor(headerColor[0], headerColor[1], headerColor[2]).setLineWidth(0.5).line(14, 26, 196, 26)

        doc.setFontSize(14).setTextColor(headerColor[0], headerColor[1], headerColor[2]).setFont("helvetica", "bold")
        doc.text(`${format === 'attendance' ? 'DAFTAR HADIR' : 'DAFTAR MURID'} - ${cls.name}`, 14, 38)
        
        doc.setFontSize(10).setTextColor(100).setFont("helvetica", "normal")
        doc.text(`Wali Kelas: ${cls.homeroomTeacher || '-'}`, 14, 45)
        doc.text(summaryLabel, 14, 51)
        
        autoTable(doc, {
          head: format === 'attendance' ? 
            [['No.', 'Nama Lengkap', 'NISN', 'JK', 'Tanda Tangan', '']] : 
            [['No.', 'Nama Lengkap', 'NISN', 'JK', 'Sekolah Asal']],
          body: students.map((s, idx) => format === 'attendance' ? 
            [idx + 1, s.fullName, s.NISN, s.gender === 'Laki-laki' ? 'L' : 'P', idx % 2 === 0 ? `${idx + 1}. ...............` : '', idx % 2 !== 0 ? `${idx + 1}. ...............` : ''] : 
            [idx + 1, s.fullName, s.NISN, s.gender === 'Laki-laki' ? 'L' : 'P', s.originSchool]
          ),
          startY: 58,
          headStyles: { fillColor: headerColor, textColor: [255, 255, 255], fontStyle: 'bold' },
          styles: { fontSize: 9, cellPadding: 3 },
          columnStyles: format === 'attendance' ? { 4: { cellWidth: 35 }, 5: { cellWidth: 35 } } : {}
        })
        
        doc.save(`${format === 'attendance' ? 'Daftar_Hadir' : 'Daftar_Murid'}_${cls.name}.pdf`)
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Gagal Ekspor" })
    } finally {
      setIsExporting(false)
    }
  }

  const handleDeleteClassConfirm = (cls: Classroom) => {
    setClassToDelete(cls)
    setIsDeleteDialogOpen(true)
  }

  const executeDeleteClass = async () => {
    if (!db || !classToDelete) return
    await deleteDoc(doc(db, 'classes', classToDelete.id))
    toast({ title: "Kelas Dihapus" })
    setClassToDelete(null)
  }

  const getStudentsInClass = (studentIds: string[]) => {
    if (!applicants) return []
    return applicants
      .filter(a => (studentIds || []).includes(a.id) && !a.isDeleted)
      .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""))
  }

  const getSummary = (studentIds: string[]) => {
    const students = getStudentsInClass(studentIds)
    const male = students.filter(s => s.gender === 'Laki-laki').length
    const female = students.filter(s => s.gender === 'Perempuan').length
    return { total: students.length, male, female }
  }

  const groupedClasses = useMemo(() => {
    if (!classes) return {}
    const groups: Record<number, Classroom[]> = {}
    classes.forEach(cls => {
      const level = cls.gradeLevel
      if (!groups[level]) groups[level] = []
      groups[level].push(cls)
    })
    return groups
  }, [classes])

  const sortedLevels = useMemo(() => {
    return Object.keys(groupedClasses).map(Number).sort((a, b) => a - b)
  }, [groupedClasses])

  if (loadingClasses) return <div className="flex justify-center py-24"><Loader2 className="animate-spin text-primary" /></div>

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-headline font-bold">Manajemen Kelas</h1>
          <p className="text-muted-foreground mt-1">Kelola rombongan belajar dan distribusi murid manual/otomatis.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button 
            onClick={handleSyncStudents} 
            disabled={isSyncing} 
            variant="outline" 
            className="gap-2 border-accent/20 text-accent hover:bg-accent/5"
          >
            {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <DatabaseZap className="w-4 h-4" />}
            Ambil Data Murid
          </Button>

          <Dialog open={isShuffleDialogOpen} onOpenChange={setIsShuffleDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2 border-primary/20 text-primary">
                <Shuffle className="w-4 h-4" /> Acak Murid
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[400px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Shuffle className="w-5 h-5 text-primary" /> Atur Distribusi Seimbang
                </DialogTitle>
                <DialogDescription>Pastikan pembagian kelas adil dan seimbang.</DialogDescription>
              </DialogHeader>
              <div className="py-6 space-y-6">
                <div className="flex items-center space-x-3 bg-muted/30 p-4 rounded-xl border border-border/50">
                  <Checkbox 
                    id="balanceGender" 
                    checked={shuffleOptions.balanceGender}
                    onCheckedChange={(checked) => setShuffleOptions(prev => ({ ...prev, balanceGender: !!checked }))}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label htmlFor="balanceGender" className="text-sm font-bold cursor-pointer">Seimbangkan Jenis Kelamin</Label>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-tight">Membagi rata Laki-laki & Perempuan di setiap kelas.</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3 bg-muted/30 p-4 rounded-xl border border-border/50">
                  <Checkbox 
                    id="balanceSchool" 
                    checked={shuffleOptions.balanceSchool}
                    onCheckedChange={(checked) => setShuffleOptions(prev => ({ ...prev, balanceSchool: !!checked }))}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label htmlFor="balanceSchool" className="text-sm font-bold cursor-pointer">Seimbangkan Sekolah Asal</Label>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-tight">Menyebarkan murid dari sekolah yang sama ke kelas berbeda.</p>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setIsShuffleDialogOpen(false)}>Batal</Button>
                <Button onClick={handleShuffle} disabled={isShuffling} className="gap-2">
                  {isShuffling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shuffle className="w-4 h-4" />}
                  Mulai Distribusi
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isDialogOpen} onOpenChange={(o) => { setIsDialogOpen(o); if(!o) setEditingClass(null); }}>
            <DialogTrigger asChild>
              <Button className="gap-2 shadow-lg shadow-primary/20"><Plus className="w-4 h-4" /> Tambah Rombel</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[450px]">
              <DialogHeader>
                <DialogTitle>{editingClass ? 'Edit Rombel' : 'Buat Rombel Baru'}</DialogTitle>
                <DialogDescription>Masukkan detail kelompok belajar.</DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onClassSubmit)} className="space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem><FormLabel>Nama Kelas</FormLabel><FormControl><Input placeholder="7-A" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="gradeLevel" render={({ field }) => (
                      <FormItem><FormLabel>Tingkat</FormLabel><FormControl><Input type="number" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="homeroomTeacher" render={({ field }) => (
                    <FormItem><FormLabel>Wali Kelas</FormLabel><FormControl><Input placeholder="Nama Guru" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="capacity" render={({ field }) => (
                    <FormItem><FormLabel>Kapasitas</FormLabel><FormControl><Input type="number" {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <DialogFooter className="pt-4">
                    <Button type="submit" disabled={submitting}>{submitting ? 'Menyimpan...' : 'Simpan Kelas'}</Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="space-y-12">
        {sortedLevels.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed rounded-xl bg-muted/20">
            <GraduationCap className="w-12 h-12 mx-auto text-muted-foreground opacity-20 mb-4" />
            <h3 className="text-xl font-bold">Belum Ada Rombongan Belajar</h3>
            <p className="text-muted-foreground">Klik 'Tambah Rombel' untuk mulai membuat kelas.</p>
          </div>
        ) : sortedLevels.map((level) => (
          <section key={level} className="space-y-6">
            <div className="flex items-center gap-4">
               <div className="bg-primary px-4 py-1.5 rounded-lg shadow-lg shadow-primary/20 flex items-center gap-2">
                 <GraduationCap className="w-5 h-5 text-white" />
                 <h2 className="text-lg font-bold text-white uppercase tracking-wider">Tingkat {level}</h2>
               </div>
               <div className="h-px bg-border flex-1"></div>
               <Badge variant="outline" className="font-mono">{groupedClasses[level].length} Kelas</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {groupedClasses[level].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map((cls) => {
                const summary = getSummary(cls.students)
                return (
                  <Card key={cls.id} className="border-border/50 hover:border-primary/30 transition-all group relative">
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="absolute top-2 right-2 text-destructive border-destructive/20 hover:bg-destructive/10"
                      onClick={() => handleDeleteClassConfirm(cls)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between pr-8">
                        <CardTitle className="font-headline text-2xl">Kelas {cls.name}</CardTitle>
                        <Badge variant="outline">G-{cls.gradeLevel}</Badge>
                      </div>
                      <div className="flex flex-col gap-1 mt-2">
                        <CardDescription className="flex items-center gap-2">
                          <Users className="w-3 h-3" /> {cls.currentEnrollment} / {cls.capacity} Murid
                        </CardDescription>
                        <p className="text-[10px] font-bold text-primary/70 uppercase tracking-tighter">
                          TOTAL: {summary.total} (L: {summary.male}, P: {summary.female})
                        </p>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                          <div className="bg-primary h-full transition-all" style={{ width: `${Math.min(100, (cls.currentEnrollment / cls.capacity) * 100)}%` }}></div>
                        </div>
                        <div className="text-sm bg-muted/30 p-2 rounded border border-border/50">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase block">Wali Kelas</span>
                          <span className="font-medium truncate block">{cls.homeroomTeacher || "-"}</span>
                        </div>
                        <div className="flex gap-2">
                          <Button onClick={() => handleView(cls)} variant="outline" size="sm" className="flex-1 text-xs gap-2 border-primary/20 text-primary">
                            <Eye className="w-3 h-3" /> Daftar
                          </Button>
                          <Button onClick={() => setEditingClass(cls)} variant="outline" size="sm" className="flex-1 text-xs gap-2">
                            <Pencil className="w-3 h-3" /> Edit
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="sm:max-w-[850px] max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="p-6 pb-2 border-b bg-muted/20">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="font-headline text-2xl">Kelas {selectedClassForView?.name}</DialogTitle>
                <DialogDescription>Wali Kelas: {selectedClassForView?.homeroomTeacher || '-'}</DialogDescription>
                {selectedClassForView && (
                  <p className="text-[10px] font-bold text-primary uppercase mt-1 tracking-tight">
                    TOTAL: {getSummary(selectedClassForView.students).total} (L: {getSummary(selectedClassForView.students).male}, P: {getSummary(selectedClassForView.students).female})
                  </p>
                )}
              </div>
              <div className="flex gap-2 mr-6">
                <Button onClick={() => setIsAddStudentOpen(true)} size="sm" className="gap-2 bg-primary">
                   <UserPlus className="w-4 h-4" /> Tambah Murid
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <FileDown className="w-4 h-4" /> Unduh
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => selectedClassForView && handleExportClass(selectedClassForView, 'qr')} className="gap-2">
                      <QrCode className="w-4 h-4 text-accent" /> Kartu QR Siswa (.pdf)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => selectedClassForView && handleExportClass(selectedClassForView, 'attendance')} className="gap-2">
                      <ClipboardList className="w-4 h-4 text-primary" /> Daftar Hadir (.pdf)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => selectedClassForView && handleExportClass(selectedClassForView, 'excel')} className="gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-green-500" /> Excel (.xlsx)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => selectedClassForView && handleExportClass(selectedClassForView, 'pdf')} className="gap-2">
                      <FilePdf className="w-4 h-4 text-destructive" /> PDF (.pdf)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-hidden p-6">
            <ScrollArea className="h-[50vh]">
              <Table>
                <TableHeader className="bg-primary/5 sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="w-10">No</TableHead>
                    <TableHead>Nama Lengkap</TableHead>
                    <TableHead>NISN</TableHead>
                    <TableHead>JK</TableHead>
                    <TableHead>Sekolah Asal</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedClassForView && getStudentsInClass(selectedClassForView.students).map((s, idx) => (
                    <TableRow key={s.id} className="hover:bg-muted/30">
                      <TableCell className="text-xs">{idx + 1}</TableCell>
                      <TableCell className="font-medium text-sm">
                        <Link href={`/dashboard/applicants/${s.id}`} className="hover:text-primary transition-colors">
                          {s.fullName}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{s.NISN}</TableCell>
                      <TableCell className="text-xs">{s.gender === 'Laki-laki' ? 'L' : 'P'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.originSchool}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-primary" 
                            title="Pindah Kelas Manual"
                            onClick={() => handleMoveStudentTrigger(s)}
                          >
                            <ArrowLeftRight className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-destructive" 
                            title="Keluarkan dari Rombel"
                            onClick={() => handleRemoveFromClass(s)}
                          >
                            <UserMinus className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" asChild className="h-8 w-8 hover:text-primary">
                            <Link href={`/dashboard/applicants/${s.id}`}>
                              <Eye className="w-4 h-4" />
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!selectedClassForView?.students || selectedClassForView.students.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-20 text-muted-foreground italic">
                        <div className="flex flex-col items-center gap-4">
                           <Users className="w-12 h-12 opacity-10" />
                           <p>Belum ada murid di kelas ini.</p>
                           <Button onClick={() => setIsAddStudentOpen(true)} variant="outline" size="sm">Tambah Murid Sekarang</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
          <DialogFooter className="p-4 border-t bg-muted/10">
            <Button variant="outline" onClick={() => setIsViewOpen(false)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddStudentOpen} onOpenChange={setIsAddStudentOpen}>
        <DialogContent className="sm:max-w-[600px] flex flex-col p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle>Kelola Murid Kelas {selectedClassForView?.name}</DialogTitle>
            <DialogDescription>Pilih murid dari database atau impor melalui file Excel.</DialogDescription>
          </DialogHeader>
          
          <div className="p-6 flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div 
                className="border-2 border-dashed rounded-xl p-6 text-center bg-primary/5 border-primary/20 hover:bg-primary/10 transition-colors cursor-pointer group"
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.xlsx,.xls';
                  input.onchange = (e: any) => handleImportExcelToClass(e);
                  input.click();
                }}
              >
                <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                  <Upload className="w-5 h-5 text-primary" />
                </div>
                <h4 className="text-sm font-bold">Impor via Excel</h4>
                <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-tighter">Match by Nama/NISN</p>
              </div>

              <div className="bg-muted/20 border rounded-xl p-4 flex flex-col justify-center">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                  <span className="text-xs font-bold uppercase">Status Kelas</span>
                </div>
                <div className="flex justify-between items-end">
                  <div className="text-2xl font-bold">{selectedClassForView?.currentEnrollment || 0} <span className="text-xs text-muted-foreground font-normal">/ {selectedClassForView?.capacity}</span></div>
                  <Badge variant="outline" className="text-[10px]">{selectedStudentsToAdd.length} dipilih</Badge>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="Cari murid yang belum ada kelas..." 
                  className="pl-9 h-9 text-xs" 
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                />
              </div>
              <ScrollArea className="h-[250px] border rounded-lg bg-card">
                <div className="p-2 space-y-1">
                  {filteredUnassigned.length === 0 ? (
                    <div className="text-center py-10 text-xs text-muted-foreground italic">Tidak ada murid tersedia.</div>
                  ) : filteredUnassigned.map((s) => (
                    <div 
                      key={s.id} 
                      className={`flex items-center justify-between p-2 rounded-md hover:bg-muted/50 transition-colors border ${selectedStudentsToAdd.includes(s.id) ? 'border-primary bg-primary/5' : 'border-transparent'}`}
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox 
                          id={`add-${s.id}`} 
                          checked={selectedStudentsToAdd.includes(s.id)}
                          onCheckedChange={(checked) => {
                            setSelectedStudentsToAdd(prev => checked ? [...prev, s.id] : prev.filter(id => id !== s.id))
                          }}
                        />
                        <div>
                          <Label htmlFor={`add-${s.id}`} className="text-xs font-bold block cursor-pointer">{s.fullName}</Label>
                          <span className="text-[10px] text-muted-foreground font-mono">{s.NISN} • {s.originSchool}</span>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[9px] uppercase">{s.gender === 'Laki-laki' ? 'L' : 'P'}</Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter className="p-4 border-t bg-muted/5">
            <Button variant="ghost" onClick={() => setIsAddStudentOpen(false)}>Batal</Button>
            <Button 
              onClick={handleAddStudentsToClass} 
              disabled={selectedStudentsToAdd.length === 0 || submitting}
              className="gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Masukkan {selectedStudentsToAdd.length} Murid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isMoveDialogOpen} onOpenChange={setIsMoveDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5 text-primary" /> Pindah Kelas Manual
            </DialogTitle>
            <DialogDescription>
              Pindahkan <strong>{studentToMove?.fullName}</strong> dari Kelas {selectedClassForView?.name} ke rombel lain.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label>Pilih Kelas Tujuan</Label>
              <Select value={targetClassId} onValueChange={setTargetClassId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih Rombel Tujuan" />
                </SelectTrigger>
                <SelectContent>
                  {classes?.filter(c => c.id !== selectedClassForView?.id).map((cls) => (
                    <SelectItem key={cls.id} value={cls.id} disabled={cls.currentEnrollment >= cls.capacity}>
                      Kelas {cls.name} ({cls.currentEnrollment}/{cls.capacity} Murid)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsMoveDialogOpen(false)}>Batal</Button>
            <Button onClick={executeMoveStudent} disabled={movingStudent || !targetClassId}>
              {movingStudent ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Pindahkan Murid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-destructive" /> Konfirmasi Hapus Rombel
            </AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus <strong>Kelas {classToDelete?.name}</strong>? Murid di dalamnya akan dikeluarkan dari rombel namun data murid tetap aman.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={executeDeleteClass} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Ya, Hapus Kelas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
