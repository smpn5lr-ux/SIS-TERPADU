
export type AdmissionPath = 'Zonasi' | 'Prestasi' | 'Afirmasi' | 'Perpindahan Orang Tua';
export type VerificationStatus = 'Belum Diverifikasi' | 'Lengkap' | 'Perlu Perbaikan' | 'Ditolak';
export type AdmissionStatus = 'accepted' | 'waitlisted' | 'rejected' | 'pending' | 'graduated';
export type WelfareType = 'PIP' | 'PKH' | 'KKS' | 'KPS' | 'Tidak Ada';
export type UserRole = 'Admin' | 'Pegawai' | 'Guru' | 'Kurikulum';

export interface Applicant {
  id: string;
  registrationNumber: string;
  registrationSequence: number;
  NISN: string;
  NIS?: string;
  NIK: string;
  familyCardNumber: string;
  aktaLahirNumber: string;
  fullName: string;
  birthPlace: string;
  birthDate: string;
  gender: 'Laki-laki' | 'Perempuan';
  religion: string;
  address: string;
  rt: string;
  rw: string;
  kelurahan: string;
  kecamatan: string;
  propinsi: string;
  livingWith: 'Bersama Orang Tua' | 'Wali' | 'Asrama' | 'Kos';
  transportation: 'Jalan Kaki' | 'Motor' | 'Mobil' | 'Angkot/Kendaraan Umum';
  childOrder: number;
  numberOfSiblings: number;
  studentPhone: string;
  parentName: string;
  parentPhone: string;
  originSchool: string;
  applicationPath: AdmissionPath;
  verificationStatus: VerificationStatus;
  admissionStatus: AdmissionStatus;
  createdAt: string;
  isDeleted?: boolean;
  deletedAt?: string;
  restoredAt?: string;
  rankingInPath?: number;
  
  // Data Periodik
  heightCm?: number;
  weightKg?: number;
  travelTimeMinutes?: number;
  welfareType?: WelfareType;
  welfareCardNumber?: string;
  welfareCardName?: string;
  
  fatherName?: string;
  fatherNIK?: string;
  fatherBirthYear?: string;
  fatherEducation?: string;
  fatherJob?: string;
  fatherInputIncome?: string;
  fatherIncome?: string;
  
  motherName?: string;
  motherNIK?: string;
  motherBirthYear?: string;
  motherEducation?: string;
  motherJob?: string;
  motherIncome?: string;
  
  guardianName?: string;
  guardianNIK?: string;
  guardianBirthYear?: string;
  guardianEducation?: string;
  guardianJob?: string;
  guardianIncome?: string;
}

export interface Classroom {
  id: string;
  name: string;
  gradeLevel: number;
  homeroomTeacher: string;
  capacity: number;
  currentEnrollment: number;
  students: string[];
}

export interface Staff {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  phone?: string;
  staffNumber?: number;
  createdAt: string;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  grades: number[];
}

export interface TeacherAssignment {
  id: string;
  teacherId: string;
  teacherName: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  totalJP: number;
}

export interface Journal {
  id: string;
  assignmentId: string;
  meetingNumber: number;
  date: string;
  jamKe: string;
  jp: number;
  learningGoal: string;
  material: string;
  teachingMethod?: string;
  kktpAchievement: string;
  absentStudents: string[];
  attendanceDetail: Record<string, 'H' | 'S' | 'I' | 'A'>;
  hasTask: boolean;
  taskType: 'task1' | 'task2' | 'task3' | 'task4' | 'task5' | 'groupTask' | null;
  taskScores?: Record<string, number>;
  semester: number;
  notes: string;
  createdAt: string;
  mergedClassIds?: string[];
}

export interface Assessment {
  id: string;
  studentId: string;
  assignmentId: string;
  semester: number;
  attendance: number;
  task1: number;
  task2: number;
  task3: number;
  task4?: number;
  task5?: number;
  quiz1?: number;
  quiz2?: number;
  quiz3?: number;
  groupTask: number;
  midExam: number;
  finalExam: number;
  finalScore: number;
  updatedAt: string;
}

export interface RosterEntry {
  id: string;
  day: string;
  period: number; 
  classId: string;
  className: string;
  teacherId?: string;
  teacherName?: string;
  subjectId?: string;
  subjectName?: string;
  isActivity?: boolean;
  activityName?: string;
  duration?: number;
}

export interface GlobalActivity {
  id: string;
  day: string;
  period: number;
  name: string;
  duration: number;
  position: 'start' | 'end'; // 'start' = jam ke-X, 'end' = sebelum pulang
}

export interface DailyBreak {
  active: boolean;
  period: number;
  duration: number;
}

export interface RosterConfig {
  entryTime: string; 
  dismissalTime: string;
  dailyEntryTimes?: Record<string, string>;
  dailyDismissalTimes?: Record<string, string>;
  dailyBreaks?: Record<string, DailyBreak>;
  jpDuration: number; 
  maxPeriods: number;
  break1Active: boolean;
  break1Period: number;
  break1Duration: number;
  break2Active: boolean;
  break2Period: number;
  break2Duration: number;
  globalActivities?: GlobalActivity[];
}
