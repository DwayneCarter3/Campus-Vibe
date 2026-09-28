import React, { createContext, useContext, useState, useCallback } from "react";

export interface Post {
  id: string;
  authorName: string;
  authorFaculty: string;
  content: string;
  fireCount: number;
  noCapCount: number;
  firedByMe: boolean;
  noCapByMe: boolean;
  createdAt: string;
}

export interface Service {
  id: string;
  title: string;
  description: string;
  price: string;
  category: string;
  whatsappNumber: string;
  authorName: string;
  createdAt: string;
}

export interface UserProfile {
  name: string;
  faculty: string;
  level: string;
  campus: string;
}

interface AppContextType {
  posts: Post[];
  services: Service[];
  user: UserProfile;
  addPost: (content: string) => void;
  firePost: (id: string) => void;
  noCapPost: (id: string) => void;
  addService: (service: Omit<Service, "id" | "authorName" | "createdAt">) => void;
  deleteService: (id: string) => void;
  updateUser: (profile: Partial<UserProfile>) => void;
}

const defaultUser: UserProfile = {
  name: "Campus Student",
  faculty: "Science",
  level: "300L",
  campus: "LASU Ojo",
};

const SAMPLE_POSTS: Post[] = [
  {
    id: "1",
    authorName: "Tunde Bello",
    authorFaculty: "Engineering",
    content: "Exam timetable don drop o 😤 Faculty of Engineering students make una check your portal ASAP. The schedule be like they want kill us this semester 💀",
    fireCount: 24,
    noCapCount: 18,
    firedByMe: false,
    noCapByMe: false,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "2",
    authorName: "Chioma Nwosu",
    authorFaculty: "Law",
    content: "The new library extension is actually fire ngl! AC dey blow, power supply steady. Una should come study there instead of that noisy SUG hall 🏛️",
    fireCount: 41,
    noCapCount: 32,
    firedByMe: false,
    noCapByMe: false,
    createdAt: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    id: "3",
    authorName: "Adebayo Ojo",
    authorFaculty: "Social Sciences",
    content: "Anyone else notice the canteen price don increase again? Jollof rice wey used to be 300 naira don reach 600. Wahala dey o 😭",
    fireCount: 87,
    noCapCount: 63,
    firedByMe: false,
    noCapByMe: false,
    createdAt: new Date(Date.now() - 14400000).toISOString(),
  },
];

const SAMPLE_SERVICES: Service[] = [
  {
    id: "1",
    title: "Graphic Design & Branding",
    description: "Logo design, flyers, business cards, social media graphics. Fast delivery, affordable prices.",
    price: "₦2,000",
    category: "Services",
    whatsappNumber: "08012345678",
    authorName: "Chukwuemeka D.",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "2",
    title: "Mathematics Tutoring (100L-300L)",
    description: "Calculus, Statistics, Linear Algebra. Group sessions available. Weekend classes.",
    price: "₦1,500/hr",
    category: "Services",
    whatsappNumber: "08098765432",
    authorName: "Amaka T.",
    createdAt: new Date(Date.now() - 172800000).toISOString(),
  },
  {
    id: "3",
    title: "Second-hand Textbooks",
    description: "200L Engineering textbooks in good condition. Includes: Strength of Materials, Thermodynamics.",
    price: "₦3,500",
    category: "Books",
    whatsappNumber: "07011223344",
    authorName: "Seun A.",
    createdAt: new Date(Date.now() - 259200000).toISOString(),
  },
  {
    id: "4",
    title: "Ankara Tops & Dresses",
    description: "Custom-made Ankara outfits. Any design, any size. 5-7 day turnaround.",
    price: "₦4,000+",
    category: "Clothing",
    whatsappNumber: "09044556677",
    authorName: "Fatima B.",
    createdAt: new Date(Date.now() - 345600000).toISOString(),
  },
];

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [posts, setPosts] = useState<Post[]>(SAMPLE_POSTS);
  const [services, setServices] = useState<Service[]>(SAMPLE_SERVICES);
  const [user, setUser] = useState<UserProfile>(defaultUser);

  const addPost = useCallback((content: string) => {
    const newPost: Post = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      authorName: user.name,
      authorFaculty: user.faculty,
      content,
      fireCount: 0,
      noCapCount: 0,
      firedByMe: false,
      noCapByMe: false,
      createdAt: new Date().toISOString(),
    };
    setPosts((prev) => [newPost, ...prev]);
  }, [user]);

  const firePost = useCallback((id: string) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              firedByMe: !p.firedByMe,
              fireCount: p.firedByMe ? p.fireCount - 1 : p.fireCount + 1,
            }
          : p
      )
    );
  }, []);

  const noCapPost = useCallback((id: string) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              noCapByMe: !p.noCapByMe,
              noCapCount: p.noCapByMe ? p.noCapCount - 1 : p.noCapCount + 1,
            }
          : p
      )
    );
  }, []);

  const addService = useCallback(
    (service: Omit<Service, "id" | "authorName" | "createdAt">) => {
      const newService: Service = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        ...service,
        authorName: user.name,
        createdAt: new Date().toISOString(),
      };
      setServices((prev) => [newService, ...prev]);
    },
    [user]
  );

  const deleteService = useCallback((id: string) => {
    setServices((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const updateUser = useCallback((profile: Partial<UserProfile>) => {
    setUser((prev) => ({ ...prev, ...profile }));
  }, []);

  return (
    <AppContext.Provider
      value={{ posts, services, user, addPost, firePost, noCapPost, addService, deleteService, updateUser }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
