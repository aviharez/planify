import type { Course } from "./types";

export const mockCourses: Course[] = [
  {
    id: "if-015",
    code: "IF-015",
    name: "Pemrograman Berorientasi Objek I",
    credits: 3,
    semester: 3,
  },
  {
    id: "if-005",
    code: "IF-005",
    name: "Basis Data Terdistribusi",
    credits: 3,
    semester: 3,
  },
  {
    id: "if-021",
    code: "IF-021",
    name: "Sistem Operasi",
    credits: 3,
    semester: 3,
  },
  {
    id: "if-022",
    code: "IF-022",
    name: "Teori Bahasa Otomata",
    credits: 3,
    semester: 3,
  },
  {
    id: "if-032",
    code: "IF-032",
    name: "Jaringan Komputer",
    credits: 3,
    semester: 3,
  },
  {
    id: "if-041",
    code: "IF-041",
    name: "Interaksi Manusia dan Komputer",
    credits: 3,
    semester: 3,
  },
  {
    id: "if-044",
    code: "IF-044",
    name: "Statistika untuk Komputasi",
    credits: 3,
    semester: 3,
  },
];

export function withMockCourses(): Course[] {
  return mockCourses.map((course) => ({ ...course }));
}
