
"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updateProfile
} from "firebase/auth"
import { useAuth, useUser, useFirestore, useDoc, useMemoFirebase, useCollection } from "@/firebase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { School, LogIn, Mail, Lock, Loader2, UserPlus, Info, Eye, EyeOff } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { doc, collection, query, where } from "firebase/firestore"
import { Staff } from "@/lib/types"

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  
  const auth = useAuth()
  const db = useFirestore()
  const { user, loading: authLoading } = useUser()
  const router = useRouter()
  const { toast } = useToast()

  const settingsRef = useMemoFirebase(() => {
    if (!db) return null
    return doc(db, 'settings', 'system')
  }, [db])

  const { data: config } = useDoc<any>(settingsRef)

  const staffQuery = useMemoFirebase(() => {
    if (!db || !user?.email) return null
    return query(collection(db, 'staff'), where('email', '==', user.email))
  }, [db, user])

  const { data: staffData } = useCollection<Staff>(staffQuery)

  useEffect(() => {
    if (!authLoading && user && staffData) {
      const role = staffData[0]?.role
      if (role === 'Guru') {
        router.push("/teacher")
      } else {
        router.push("/dashboard")
      }
    }
  }, [user, authLoading, staffData, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password)
        toast({
          title: "Berhasil Masuk",
          description: "Selamat datang kembali di Portal Sistem.",
        })
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password)
        await updateProfile(userCredential.user, { displayName: fullName })
        toast({
          title: "Akun Berhasil Dibuat",
          description: "Silakan gunakan akun Anda untuk mengelola sistem.",
        })
        setIsLogin(true)
      }
    } catch (error: any) {
      let message = "Terjadi kesalahan. Silakan coba lagi."
      if (error.code === 'auth/email-already-in-use') message = "Email sudah terdaftar. Silakan login."
      if (error.code === 'auth/invalid-credential') message = "Email atau sandi salah."
      if (error.code === 'auth/weak-password') message = "Sandi minimal 6 karakter."
      
      toast({
        variant: "destructive",
        title: isLogin ? "Masuk Gagal" : "Pendaftaran Gagal",
        description: message,
      })
    } finally {
      setLoading(false)
    }
  }

  if (authLoading) return null

  const appName = config?.appName || "SIS TERPADU"
  const appLogoUrl = config?.appLogoUrl || "/icon-logo.webp"

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background/50 relative overflow-hidden p-4">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px]"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/10 rounded-full blur-[120px]"></div>

      <Card className="w-full max-w-[400px] border-border/50 shadow-2xl relative z-10 bg-card/80 backdrop-blur-xl">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 flex items-center justify-center overflow-hidden">
            {appLogoUrl ? (
              <img src={appLogoUrl} alt="Logo" className="w-full h-full object-contain" />
            ) : (
              <div className="bg-primary w-full h-full rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
                <School className="w-8 h-8 text-primary-foreground" />
              </div>
            )}
          </div>
          <div>
            <CardTitle className="font-headline text-2xl font-bold tracking-tight">
              {isLogin ? `${appName}` : "Daftar Akun Baru"}
            </CardTitle>
            <CardDescription>
              {isLogin ? `Masuk ke portal administrasi & penilaian ${appName}.` : "Buat akun baru untuk akses sistem."}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                <div className="bg-primary/10 p-3 rounded-lg border border-primary/20 flex gap-2 mb-4">
                  <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    <strong>PENTING:</strong> Gunakan email yang sudah didaftarkan oleh Admin sekolah agar role Anda aktif secara otomatis.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fullName">Nama Lengkap</Label>
                  <div className="relative">
                    <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input 
                      id="fullName"
                      type="text" 
                      placeholder="Nama Lengkap Anda" 
                      className="pl-10"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required={!isLogin}
                    />
                  </div>
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  id="email"
                  type="email" 
                  placeholder="anda@sekolah.sch.id" 
                  className="pl-10"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{isLogin ? "Kata Sandi" : "Buat Kata Sandi"}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  id="password"
                  type={showPassword ? "text" : "password"} 
                  placeholder="••••••••" 
                  className="pl-10 pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              {!isLogin && <p className="text-[10px] text-muted-foreground">Minimal 6 karakter.</p>}
            </div>
            <Button 
              type="submit" 
              className="w-full h-11 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 gap-2"
              disabled={loading}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (isLogin ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />)}
              {isLogin ? "Masuk Sekarang" : "Daftar & Atur Sandi"}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button 
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm text-primary hover:underline font-medium"
            >
              {isLogin ? "Belum punya akun? Daftar di sini" : "Sudah punya akun? Masuk di sini"}
            </button>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <p className="text-[10px] text-center text-muted-foreground uppercase tracking-widest font-bold">
            {appName} • SISTEM INFORMASI TERPADU
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}
