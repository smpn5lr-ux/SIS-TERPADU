
"use client"

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, User, Download, MapPin, Briefcase, Info, Loader2, Sparkles, CheckCircle2, XCircle, Users, AlertCircle, ClipboardCheck, School, GraduationCap, Calendar, Phone, Trash2, ShieldAlert, Scale, Ruler, Clock, CreditCard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
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
import Link from 'next/link'
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase'
import { doc, updateDoc } from 'firebase/firestore'
import { Applicant } from '@/lib/types'
import { errorEmitter } from '@/firebase/error-emitter'
import { FirestorePermissionError } from '@/firebase/errors'
import { useToast } from '@/hooks/use-toast'

export default function ApplicantDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const db = useFirestore()
  const { toast } = useToast()
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  
  const applicantRef = useMemoFirebase(() => {
    if (!db || !id) return null
    return doc(db, 'applicants', id as string)
  }, [db, id])

  const settingsRef = useMemoFirebase(() => {
    if (!db) return null
    return doc(db, 'settings', 'system')
  }, [db])

  const { data: applicant, loading } = useDoc<Applicant>(applicantRef)
  const { data: config } = useDoc<any>(settingsRef)

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return "-";
    const parts = dateStr.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dateStr;
  }

  const handleUpdateStatus = (status: string) => {
    if (!applicantRef) return
    const updateData: any = { 
      verificationStatus: status,
      updatedAt: new Date().toISOString()
    }
    
    if (status === 'Lengkap') {
      updateData.admissionStatus = 'accepted'
    } else if (status === 'Ditolak') {
      updateData.admissionStatus = 'rejected'
    }

    updateDoc(applicantRef, updateData)
      .then(() => {
        toast({ title: `Status berhasil diubah`, description: `Sekarang berstatus: ${status}` })
      })
      .catch(async () => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: applicantRef.path, operation: 'update' }))
      })
  }

  const executeDelete = async () => {
    if (!db || !applicantRef || !applicant) return
    
    updateDoc(applicantRef, { 
      isDeleted: true,
      deletedAt: new Date().toISOString()
    }).then(() => {
      toast({ title: "Data dipindahkan ke sampah" })
      router.push('/dashboard/applicants')
    }).catch(async () => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: applicantRef.path, operation: 'update' }))
    })
  }

  const handleDownloadPDF = async () => {
    if (!applicant) return
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()
    
    doc.setFontSize(16)
    doc.text("FORMULIR PENDAFTARAN PESERTA DIDIK BARU", 105, 20, { align: "center" })
    doc.line(20, 25, 190, 25)

    const data = [
      ["No. Urut Pendaftaran (No Reg) :", applicant.registrationNumber || "-"],
      ["NISN :", applicant.NISN || "-"],
      ["NIK :", applicant.NIK || "-"],
      ["No. KK :", applicant.familyCardNumber || "-"],
      ["No. Akta Lahir :", applicant.aktaLahirNumber || "-"],
      ["Nama Lengkap :", applicant.fullName || "-"],
      ["Tempat, Tgl Lahir :", `${applicant.birthPlace || "-"}, ${formatDate(applicant.birthDate)}`],
      ["Jenis Kelamin :", applicant.gender || "-"],
      ["Agama :", applicant.religion || "-"],
      ["Anak Ke- :", applicant.childOrder?.toString() || "-"],
      ["Jml Saudara :", applicant.numberOfSiblings?.toString() || "-"],
      ["Alamat :", `${applicant.address || "-"}, RT ${applicant.rt || "-"} RW ${applicant.rw || "-"}, Kel. ${applicant.kelurahan || "-"}, Kec. ${applicant.kecamatan || "-"}, ${applicant.propinsi || "-"}`],
      ["Transportasi :", applicant.transportation || "-"],
      ["Tinggal Bersama :", applicant.livingWith || "-"],
      ["HP Siswa :", applicant.studentPhone || "-"],
      ["", ""],
      ["DATA PERIODIK", ""],
      ["Tinggi Badan :", `${applicant.heightCm || "-"} CM`],
      ["Berat Badan :", `${applicant.weightKg || "-"} KG`],
      ["Waktu Tempuh :", `${applicant.travelTimeMinutes || "-"} MENIT`],
      ["Jns Kesejahteraan:", applicant.welfareType || "Tidak Ada"],
      ["Nomor Kartu :", applicant.welfareCardNumber || "-"],
      ["Nama di Kartu :", applicant.welfareCardName || "-"],
      ["", ""],
      ["DATA ORANG TUA", ""],
      ["Nama Ayah :", applicant.fatherName || "-"],
      ["NIK Ayah :", applicant.fatherNIK || "-"],
      ["Thn Lahir Ayah :", applicant.fatherBirthYear || "-"],
      ["Pendidikan Ayah :", applicant.fatherEducation || "-"],
      ["Pekerjaan Ayah :", applicant.fatherJob || "-"],
      ["Penghasilan Ayah :", applicant.fatherIncome || "-"],
      ["", ""],
      ["Nama Ibu :", applicant.motherName || "-"],
      ["NIK Ibu :", applicant.motherNIK || "-"],
      ["Thn Lahir Ibu :", applicant.motherBirthYear || "-"],
      ["Pendidikan Ibu :", applicant.motherEducation || "-"],
      ["Pekerjaan Ibu :", applicant.motherJob || "-"],
      ["Penghasilan Ibu :", applicant.motherIncome || "-"],
    ]

    if (applicant.livingWith !== 'Bersama Orang Tua') {
      data.push(
        ["", ""],
        ["DATA WALI", ""],
        ["Nama Wali :", applicant.guardianName || "-"],
        ["NIK Wali :", applicant.guardianNIK || "-"],
        ["Thn Lahir Wali :", applicant.guardianBirthYear || "-"],
        ["Pendidikan Wali :", applicant.guardianEducation || "-"],
        ["Pekerjaan Wali :", applicant.guardianJob || "-"],
        ["Penghasilan Wali :", applicant.guardianIncome || "-"]
      )
    }

    data.push(
      ["", ""],
      ["INFO PENDAFTARAN", ""],
      ["Sekolah Asal :", applicant.originSchool || "-"],
      ["Jalur Pendaftaran :", applicant.applicationPath || "-"],
      ["Status Verifikasi :", applicant.verificationStatus || "-"]
    )

    autoTable(doc, {
      body: data,
      startY: 35,
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 1.5 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } },
      didParseCell: (data) => {
        if (["DATA PERIODIK", "DATA ORANG TUA", "DATA WALI", "INFO PENDAFTARAN"].includes(data.cell.text[0])) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = [67, 97, 238];
        }
      }
    })

    doc.save(`Formulir_${applicant.fullName}.pdf`)
  }

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="animate-spin" /></div>
  if (!applicant || applicant.isDeleted) return <div className="text-center py-24">Data tidak ditemukan atau sudah dihapus.</div>

  const isAccepted = applicant.admissionStatus === 'accepted';

  const getStatusStyles = (status: string) => {
    switch (status) {
      case 'Lengkap': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'Perlu Perbaikan': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'Ditolak': return 'bg-destructive/10 text-destructive border-destructive/20';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild><Link href="/dashboard/applicants"><ArrowLeft className="w-5 h-5" /></Link></Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{applicant.fullName}</h1>
              {isAccepted && <Badge className="bg-green-500 hover:bg-green-600 gap-1"><CheckCircle2 className="w-3 h-3" /> SISWA AKTIF</Badge>}
            </div>
            <p className="text-muted-foreground text-sm font-mono">No. Reg: {applicant.registrationNumber || applicant.registrationSequence}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleDownloadPDF} className="gap-2"><Download className="w-4 h-4" /> Cetak Biodata</Button>
          <Button variant="outline" onClick={() => setIsDeleteDialogOpen(true)} className="gap-2 text-destructive border-destructive/20 hover:bg-destructive/5">
            <Trash2 className="w-4 h-4" /> Hapus
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-border/50 shadow-md">
            <CardHeader className="border-b bg-muted/20">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-headline">{isAccepted ? "Data Induk Siswa (Dapodik)" : "Profil Calon Murid"}</CardTitle>
                  <CardDescription>Informasi biodata lengkap siswa sesuai dokumen resmi.</CardDescription>
                </div>
                <div className="bg-primary/10 p-2 rounded-lg">
                  <GraduationCap className="w-6 h-6 text-primary" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-8 space-y-12">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-5">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary"></div> I. IDENTITAS PRIBADI
                  </h4>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between border-b border-border/30 pb-1"><span className="text-muted-foreground">No. Reg Pendaftaran :</span><span className="font-bold text-primary">{applicant.registrationNumber || applicant.registrationSequence}</span></div>
                    <div className="flex justify-between border-b border-border/30 pb-1"><span className="text-muted-foreground">NISN :</span><span className="font-mono font-bold text-accent">{applicant.NISN || "-"}</span></div>
                    <div className="flex justify-between border-b border-border/30 pb-1"><span className="text-muted-foreground">NIK :</span><span className="font-mono">{applicant.NIK || "-"}</span></div>
                    <div className="flex justify-between border-b border-border/30 pb-1"><span className="text-muted-foreground">Jenis Kelamin :</span><span>{applicant.gender || "-"}</span></div>
                    <div className="flex justify-between border-b border-border/30 pb-1"><span className="text-muted-foreground">Agama :</span><span>{applicant.religion || "-"}</span></div>
                    <div className="flex justify-between border-b border-border/30 pb-1"><span className="text-muted-foreground">Tempat, Tgl Lahir :</span><span>{applicant.birthPlace || "-"}, {formatDate(applicant.birthDate)}</span></div>
                    <div className="flex justify-between border-b border-border/30 pb-1"><span className="text-muted-foreground">Anak Ke- :</span><span>{applicant.childOrder || "-"}</span></div>
                    <div className="flex justify-between border-b border-border/30 pb-1"><span className="text-muted-foreground">Jumlah Saudara :</span><span>{applicant.numberOfSiblings || "-"}</span></div>
                  </div>
                </div>
                <div className="space-y-5">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary"></div> II. DOMISILI & KONTAK
                  </h4>
                  <div className="space-y-3 text-sm">
                    <div className="flex flex-col border-b border-border/30 pb-1"><span className="text-muted-foreground">Alamat Tinggal :</span><span className="font-medium mt-1">{applicant.address || "-"}</span></div>
                    <div className="flex justify-between border-b border-border/30 pb-1"><span className="text-muted-foreground">RT / RW :</span><span>{applicant.rt || "-"} / {applicant.rw || "-"}</span></div>
                    <div className="flex justify-between border-b border-border/30 pb-1"><span className="text-muted-foreground">Desa / Kelurahan :</span><span>{applicant.kelurahan || "-"}</span></div>
                    <div className="flex justify-between border-b border-border/30 pb-1"><span className="text-muted-foreground">Kecamatan :</span><span>{applicant.kecamatan || "-"}</span></div>
                    <div className="flex justify-between border-b border-border/30 pb-1"><span className="text-muted-foreground">Provinsi :</span><span>{applicant.propinsi || "-"}</span></div>
                    <div className="flex justify-between border-b border-border/30 pb-1 text-primary"><span className="text-muted-foreground">No. HP Siswa :</span><span className="font-bold">{applicant.studentPhone || "-"}</span></div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-5">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary"></div> III. DATA PERIODIK
                  </h4>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between border-b border-border/30 pb-1"><span className="text-muted-foreground">Tinggi Badan :</span><span className="font-bold">{applicant.heightCm || "-"} CM</span></div>
                    <div className="flex justify-between border-b border-border/30 pb-1"><span className="text-muted-foreground">Berat Badan :</span><span className="font-bold">{applicant.weightKg || "-"} KG</span></div>
                    <div className="flex justify-between border-b border-border/30 pb-1"><span className="text-muted-foreground">Waktu Tempuh :</span><span className="font-bold">{applicant.travelTimeMinutes || "-"} MENIT</span></div>
                  </div>
                </div>
                <div className="space-y-5">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary"></div> IV. KESEJAHTERAAN
                  </h4>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between border-b border-border/30 pb-1"><span className="text-muted-foreground">Jenis :</span><Badge variant="secondary">{applicant.welfareType || "Tidak Ada"}</Badge></div>
                    <div className="flex justify-between border-b border-border/30 pb-1"><span className="text-muted-foreground">Nomor Kartu :</span><span className="font-mono">{applicant.welfareCardNumber || "-"}</span></div>
                    <div className="flex justify-between border-b border-border/30 pb-1"><span className="text-muted-foreground">Nama di Kartu :</span><span>{applicant.welfareCardName || "-"}</span></div>
                  </div>
                </div>
              </div>

              <div className="space-y-8">
                <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary flex items-center gap-2 border-b pb-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary"></div> V. DATA ORANG TUA KANDUNG
                </h4>
                
                <div className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between font-bold text-[10px] text-accent uppercase tracking-widest border-b pb-1"><span>Data Ayah</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Nama Lengkap :</span><span className="font-semibold">{applicant.fatherName || "-"}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">NIK Ayah :</span><span className="font-mono">{applicant.fatherNIK || "-"}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Tahun Lahir :</span><span>{applicant.fatherBirthYear || "-"}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Pendidikan :</span><span>{applicant.fatherEducation || "-"}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Pekerjaan :</span><span>{applicant.fatherJob || "-"}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Penghasilan :</span><span>{applicant.fatherIncome || "-"}</span></div>
                    </div>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between font-bold text-[10px] text-accent uppercase tracking-widest border-b pb-1"><span>Data Ibu</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Nama Lengkap :</span><span className="font-semibold">{applicant.motherName || "-"}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">NIK Ibu :</span><span className="font-mono">{applicant.motherNIK || "-"}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Tahun Lahir :</span><span>{applicant.motherBirthYear || "-"}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Pendidikan :</span><span>{applicant.motherEducation || "-"}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Pekerjaan :</span><span>{applicant.motherJob || "-"}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Penghasilan :</span><span>{applicant.motherIncome || "-"}</span></div>
                    </div>
                  </div>
                </div>

                {applicant.livingWith !== 'Bersama Orang Tua' && (
                  <div className="pt-10 space-y-6">
                    <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary flex items-center gap-2 border-b pb-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary"></div> VI. DATA WALI SISWA
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between"><span className="text-muted-foreground">Nama Wali :</span><span className="font-semibold">{applicant.guardianName || "-"}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">NIK Wali :</span><span className="font-mono">{applicant.guardianNIK || "-"}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Tahun Lahir :</span><span>{applicant.guardianBirthYear || "-"}</span></div>
                      </div>
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between"><span className="text-muted-foreground">Pendidikan :</span><span>{applicant.guardianEducation || "-"}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Pekerjaan :</span><span>{applicant.guardianJob || "-"}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Penghasilan :</span><span>{applicant.guardianIncome || "-"}</span></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {isAccepted ? (
             <Card className="border-green-500/20 bg-green-500/5 shadow-lg">
                <CardHeader className="pb-3 text-center">
                  <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-green-500/20">
                    <CheckCircle2 className="w-10 h-10 text-white" />
                  </div>
                  <CardTitle className="text-xl font-bold text-green-500">PENDAFTAR DITERIMA</CardTitle>
                  <CardDescription>Siswa telah lulus seleksi dan diverifikasi.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-2">
                  <Separator className="bg-green-500/20" />
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Jalur Seleksi :</span><Badge variant="secondary">{applicant.applicationPath}</Badge></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Status Verifikasi :</span><span className="text-green-600 font-bold">LENGKAP</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Tahun Masuk :</span><span className="font-bold">{config?.academicYear || "2024 / 2025"}</span></div>
                  </div>
                  <Button variant="outline" onClick={() => handleUpdateStatus('Belum Diverifikasi')} className="w-full mt-4 text-xs">Batalkan Kelulusan</Button>
                </CardContent>
             </Card>
          ) : (
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <ClipboardCheck className="w-5 h-5 text-primary" />
                  Panel Verifikasi
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => handleUpdateStatus('Lengkap')} 
                    className="text-green-500 border-green-500/20 hover:bg-green-500/5 h-11"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" /> Lengkap
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => handleUpdateStatus('Ditolak')} 
                    className="text-destructive border-destructive/20 hover:bg-destructive/5 h-11"
                  >
                    <XCircle className="w-4 h-4 mr-2" /> Tolak
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => handleUpdateStatus('Perlu Perbaikan')} 
                    className="col-span-2 text-amber-500 border-amber-500/20 hover:bg-amber-500/5 h-11"
                  >
                    <AlertCircle className="w-4 h-4 mr-2" /> Belum Lengkap
                  </Button>
                </div>
                
                <Separator className="my-2" />
                
                <div className="space-y-2 text-center">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Status Verifikasi Saat Ini :</p>
                  <Badge 
                    variant="outline" 
                    className={`w-full justify-center py-2.5 text-sm uppercase font-bold tracking-widest ${getStatusStyles(applicant.verificationStatus)}`}
                  >
                    {applicant.verificationStatus || "-"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}
          
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                <School className="w-4 h-4 text-accent" /> Informasi Akademik
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm pt-2">
              <div className="flex justify-between"><span className="text-muted-foreground">Asal Sekolah :</span><span className="text-right font-medium">{applicant.originSchool || "-"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Jalur Pendaftaran :</span><Badge variant="outline" className="text-[10px] font-bold">{applicant.applicationPath || "-"}</Badge></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tgl Pendaftaran :</span><span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {applicant.createdAt ? new Date(applicant.createdAt).toLocaleDateString('id-ID') : "-"}</span></div>
              {applicant.academicScore && (
                <div className="flex justify-between border-t pt-2 mt-2"><span className="text-muted-foreground font-bold">Skor Akademik :</span><span className="font-bold text-accent">{applicant.academicScore}</span></div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-destructive" /> Konfirmasi Penghapusan
            </AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin memindahkan data <strong>{applicant?.fullName}</strong> ke tempat sampah?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={executeDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Ya, Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
