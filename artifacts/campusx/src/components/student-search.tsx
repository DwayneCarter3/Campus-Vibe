import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { getSearchStudentsQueryKey, useSearchStudents } from "@workspace/api-client-react";
import { ArrowRight, MessageCircle, Search, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserVerificationMarks } from "@/components/user-verification-marks";

export function StudentSearch() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const term = query.trim();

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(term), 250);
    return () => window.clearTimeout(timer);
  }, [term]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const search = useSearchStudents(
    { q: debounced },
    {
      query: {
        queryKey: getSearchStudentsQueryKey({ q: debounced }),
        enabled: open && debounced.length >= 2,
        retry: 1,
      },
    },
  );

  const ready = term.length >= 2 && term === debounced;
  const loading = term.length >= 2 && (!ready || search.isPending || search.isFetching);
  const students = ready && !loading && !search.isError ? search.data?.students ?? [] : [];
  const close = () => {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  };

  return (
    <div ref={rootRef} className="relative min-w-0 shrink">
      <div className="relative">
        <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="search"
          aria-label="Search students at your school"
          aria-controls="student-search-results"
          aria-expanded={open && term.length >= 2}
          aria-autocomplete="list"
          autoComplete="off"
          maxLength={80}
          value={query}
          placeholder="Find students"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
            }
            if (event.key === "ArrowDown" && students.length) {
              event.preventDefault();
              resultRefs.current[0]?.focus();
            }
          }}
          className="h-9 w-[104px] sm:w-[190px] lg:w-[240px] rounded-full border border-white/10 bg-background/40 pl-9 pr-8 text-sm text-foreground outline-none placeholder:text-muted-foreground transition-[border-color,background-color] focus:border-primary/50 focus:bg-background/70"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && term.length >= 2 && (
        <div
          id="student-search-results"
          role="region"
          aria-label="Student search results"
          aria-live="polite"
          className="absolute top-[calc(100%+12px)] right-0 z-[60] w-[min(88vw,380px)] max-h-[min(70dvh,440px)] overflow-y-auto rounded-2xl border border-white/10 bg-card/95 p-2 shadow-2xl shadow-black/30 backdrop-blur-xl"
        >
          <div className="px-3 py-2 flex items-center justify-between gap-3 border-b border-white/5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Students at your school</span>
            <span className="text-[10px] text-muted-foreground">Search</span>
          </div>
          {loading ? (
            <div className="space-y-2 p-2" role="status" aria-label="Searching students">
              {[0, 1, 2].map((item) => (
                <div key={item} className="flex items-center gap-3 p-2 animate-pulse">
                  <div className="h-9 w-9 shrink-0 rounded-full bg-primary/10" />
                  <div className="space-y-2 flex-1">
                    <div className="h-2.5 w-2/3 rounded bg-primary/10" />
                    <div className="h-2 w-1/3 rounded bg-primary/10" />
                  </div>
                </div>
              ))}
            </div>
          ) : search.isError ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium">Search couldn't load</p>
              <p className="mt-1 text-xs text-muted-foreground">Check your connection and try again.</p>
              <button type="button" className="mt-4 text-xs font-semibold text-primary hover:underline" onClick={() => search.refetch()}>
                Try again
              </button>
            </div>
          ) : students.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Search className="mx-auto mb-3 h-5 w-5 text-primary/60" />
              <p className="text-sm font-medium">No students found</p>
              <p className="mt-1 text-xs text-muted-foreground">Try a name, username, or department.</p>
            </div>
          ) : (
            <div className="py-1">
              {students.map((student, index) => (
                <div key={student.userId} className="group flex items-center gap-1 rounded-xl hover:bg-primary/10 focus-within:bg-primary/10">
                  <Link
                    href={`/profile/${encodeURIComponent(student.userId)}`}
                    ref={(element) => { resultRefs.current[index] = element; }}
                    onClick={close}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        resultRefs.current[index + 1]?.focus();
                      }
                      if (event.key === "ArrowUp") {
                        event.preventDefault();
                        (resultRefs.current[index - 1] ?? inputRef.current)?.focus();
                      }
                    }}
                    className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2 outline-none"
                  >
                    <Avatar className="h-10 w-10 shrink-0 border border-primary/20">
                      <AvatarImage src={student.avatarUrl ?? undefined} alt="" />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                        {student.fullName.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 flex-wrap">
                        <span className="truncate text-sm font-semibold">{student.fullName}</span>
                        <UserVerificationMarks status={student.verificationStatus} />
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[student.username ? `@${student.username}` : null, student.department].filter(Boolean).join(" · ") || "Student"}
                      </span>
                    </span>
                    <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100" />
                  </Link>
                  <Link
                    href={`/messages?with=${encodeURIComponent(student.userId)}`}
                    onClick={close}
                    aria-label={`Message ${student.fullName}`}
                    title={`Message ${student.fullName}`}
                    className="mr-2 rounded-lg p-2 text-muted-foreground hover:bg-primary/15 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <MessageCircle className="h-4 w-4" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}