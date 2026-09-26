import { useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { Form } from "@/components/ui/form";
import { getGetMyCgpaPlanQueryKey, useGetMyCgpaPlan, useSaveMyCgpaPlan } from "@workspace/api-client-react";
import type { CgpaPlan, CgpaPlanInput } from "@workspace/api-client-react";
import { ArrowUpRight, Calculator, LockKeyhole, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import "./cgpa.css";

type Grade = "A" | "B" | "C" | "D" | "E" | "F";
type DraftCourse = { code: string; units: string; grade: Grade | "" };
type Draft = {
  currentCgpa: string;
  completedUnits: string;
  targetCgpa: string;
  remainingUnits: string;
  courses: DraftCourse[];
};

const grades: Record<Grade, number> = { A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 };
const emptyDraft: Draft = { currentCgpa: "", completedUnits: "", targetCgpa: "", remainingUnits: "", courses: [] };
const blankCourse = (): DraftCourse => ({ code: "", units: "", grade: "" });
const text = (value: number | null) => value === null ? "" : String(value);
const numberOrNull = (value: string) => value.trim() === "" ? null : Number(value);
const validUnits = (value: string) => /^[1-9]\d*$/.test(value) && Number(value) <= 30;
const format = (value: number) => value.toFixed(2);

function planToDraft(plan: CgpaPlan): Draft {
  return {
    currentCgpa: text(plan.currentCgpa),
    completedUnits: text(plan.completedUnits),
    targetCgpa: text(plan.targetCgpa),
    remainingUnits: text(plan.remainingUnits),
    courses: plan.courses.map(course => ({
      code: course.code,
      units: String(course.units),
      grade: course.grade,
    })),
  };
}

function CgpaPlanner({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const key = [...getGetMyCgpaPlanQueryKey(), userId];
  const { data: plan, isLoading, isError, error, refetch, isFetching } = useGetMyCgpaPlan({
    query: { queryKey: key, enabled: !!userId, retry: false, gcTime: 0 },
  });
  const savePlan = useSaveMyCgpaPlan();
  const form = useForm<Draft>({ defaultValues: emptyDraft, mode: "onSubmit" });
  const { control, register, reset, handleSubmit } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "courses" });
  const values = useWatch({ control }) as Draft;
  const draft = values ?? emptyDraft;
  const initialized = useRef(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    if (plan && !initialized.current) {
      reset(planToDraft(plan));
      initialized.current = true;
    }
  }, [plan, reset]);

  const current = numberOrNull(draft.currentCgpa ?? "");
  const completed = numberOrNull(draft.completedUnits ?? "");
  const target = numberOrNull(draft.targetCgpa ?? "");
  const remaining = numberOrNull(draft.remainingUnits ?? "");
  const hasPlanNumbers = current !== null && completed !== null && target !== null && remaining !== null &&
    current >= 0 && current <= 5 && target >= 0 && target <= 5 &&
    Number.isInteger(completed) && completed >= 0 && Number.isInteger(remaining) && remaining >= 0;

  const goal = useMemo(() => {
    if (!hasPlanNumbers || current === null || completed === null || target === null || remaining === null) return null;
    if (remaining === 0) {
      if (completed === 0) return { kind: "none" as const, needed: null, max: null };
      return current >= target
        ? { kind: "guaranteed" as const, needed: 0, max: current }
        : { kind: "impossible" as const, needed: null, max: current };
    }
    const needed = (target * (completed + remaining) - current * completed) / remaining;
    const max = (current * completed + 5 * remaining) / (completed + remaining);
    if (needed < 0) return { kind: "guaranteed" as const, needed: 0, max };
    if (needed > 5) return { kind: "impossible" as const, needed, max };
    return { kind: "achievable" as const, needed, max };
  }, [hasPlanNumbers, current, completed, target, remaining]);

  const simulation = useMemo(() => {
    const complete = (draft.courses ?? []).filter(course =>
      course.code?.trim() && validUnits(course.units ?? "") && course.grade && course.grade in grades
    );
    const units = complete.reduce((sum, course) => sum + Number(course.units), 0);
    const points = complete.reduce((sum, course) => sum + Number(course.units) * grades[course.grade as Grade], 0);
    const semester = units > 0 ? points / units : null;
    const projected = current !== null && completed !== null && current >= 0 && current <= 5 &&
      Number.isInteger(completed) && completed >= 0 && completed + units > 0
      ? (current * completed + points) / (completed + units) : null;
    return { units, semester, projected };
  }, [draft.courses, current, completed]);

  function validate(input: Draft): CgpaPlanInput | null {
    const numeric: (keyof Pick<Draft, "currentCgpa" | "completedUnits" | "targetCgpa" | "remainingUnits">)[] =
      ["currentCgpa", "completedUnits", "targetCgpa", "remainingUnits"];
    for (const field of numeric) {
      const raw = input[field].trim();
      const value = numberOrNull(raw);
      if (raw !== "" && (value === null || !Number.isFinite(value) || value < 0 ||
        ((field === "currentCgpa" || field === "targetCgpa") ? value > 5 : !Number.isInteger(value)))) {
        setValidationError(`${field === "currentCgpa" ? "Current CGPA" : field === "completedUnits" ? "Completed units" : field === "targetCgpa" ? "Target CGPA" : "Remaining units"} must be ${field.includes("Cgpa") ? "between 0 and 5" : "a non-negative whole number"}.`);
        return null;
      }
    }
    if ((input.currentCgpa.trim() === "") !== (input.completedUnits.trim() === "")) {
      setValidationError("Enter current CGPA and completed units together to calculate your projection.");
      return null;
    }
    const courses: CgpaPlanInput["courses"] = [];
    for (const [index, course] of input.courses.entries()) {
      const code = course.code.trim();
      const unit = course.units.trim();
      if (!code && !unit && !course.grade) continue;
      if (!code || code.length > 32 || !validUnits(unit) || !course.grade || !(course.grade in grades)) {
        setValidationError(`Course ${index + 1} needs a code (up to 32 characters), 1–30 whole units, and a grade. Remove it if you don't need it.`);
        return null;
      }
      courses.push({ code, units: Number(unit), grade: course.grade as Grade });
    }
    if (courses.length > 100) {
      setValidationError("A plan can contain up to 100 courses.");
      return null;
    }
    const remainingUnits = numberOrNull(input.remainingUnits);
    if (remainingUnits !== null && courses.reduce((sum, course) => sum + course.units, 0) > remainingUnits) {
      setValidationError("Simulated course units exceed your remaining units. Adjust them before saving.");
      return null;
    }
    setValidationError("");
    return {
      currentCgpa: numberOrNull(input.currentCgpa),
      completedUnits: numberOrNull(input.completedUnits),
      targetCgpa: numberOrNull(input.targetCgpa),
      remainingUnits,
      courses,
    };
  }

  const submit = handleSubmit(input => {
    setSaveMessage("");
    const payload = validate(input);
    if (!payload) return;
    savePlan.mutate({ data: payload }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: key, exact: true });
        setSaveMessage("Plan saved. Only you can see these numbers.");
      },
      onError: () => setSaveMessage("Couldn't save your plan. Please try again."),
    });
  });

  if (isLoading || (plan && !initialized.current)) {
    return <div className="cgpa-page" aria-label="Loading CGPA plan" data-testid="loading-cgpa-plan">
      <div className="cgpa-skeleton" style={{ width: 140, height: 17, marginBottom: 34 }} />
      <div className="cgpa-skeleton" style={{ width: "min(420px, 85%)", height: 65, marginBottom: 24 }} />
      <div className="cgpa-grid"><div className="cgpa-skeleton" style={{ height: 330 }} /><div className="cgpa-skeleton" style={{ height: 330 }} /></div>
    </div>;
  }
  if (isError) {
    return <div className="cgpa-page">
      <div className="cgpa-panel cgpa-panel-pad" role="alert" data-testid="error-cgpa-plan">
        <div className="cgpa-section-label">YOUR PRIVATE PLANNER</div>
        <h1 className="cgpa-panel-title" style={{ marginTop: 18 }}>We couldn't load your plan.</h1>
        <p className="cgpa-lead" style={{ marginBottom: 16 }}>{error instanceof Error ? error.message : "Your saved numbers are safe. Try again in a moment."}</p>
        <button className="cgpa-add" type="button" onClick={() => refetch()} data-testid="button-retry-cgpa">Try again</button>
      </div>
    </div>;
  }

  return <div className="cgpa-page">
    <div className="cgpa-topline">
      <div className="cgpa-eyebrow"><Calculator size={15} /> ACADEMIC TOOLS / 01</div>
      <div className="cgpa-private"><LockKeyhole size={12} /> PRIVATE TO YOU</div>
    </div>
    <h1 className="cgpa-heading">Make your <em>next move.</em></h1>
    <p className="cgpa-lead">A little clarity goes a long way. Set your target, see the grade you need, and test the courses ahead. Built for the 5-point scale.</p>

    <Form {...form}>
      <form onSubmit={submit} onChange={() => { setSaveMessage(""); setValidationError(""); }} noValidate>
        <div className="cgpa-grid">
          <section className="cgpa-panel cgpa-panel-pad" aria-labelledby="cgpa-start-title">
            <div className="cgpa-section-label">01 / THE STARTING POINT</div>
            <h2 id="cgpa-start-title" className="cgpa-panel-title" style={{ marginTop: 12 }}>Where you are. Where you're going.</h2>
            <p className="cgpa-panel-sub">Use your most recent transcript. Leave a field blank if you're still figuring it out.</p>
            <div className="cgpa-field-grid">
              <div className="cgpa-field"><label htmlFor="cgpa-current">Current CGPA</label><input id="cgpa-current" className="cgpa-input" type="number" inputMode="decimal" min="0" max="5" step="any" placeholder="e.g. 3.42" {...register("currentCgpa")} data-testid="input-current-cgpa" /><span className="cgpa-hint">Out of 5.00</span></div>
              <div className="cgpa-field"><label htmlFor="cgpa-completed">Completed units</label><input id="cgpa-completed" className="cgpa-input" type="number" inputMode="numeric" min="0" step="1" placeholder="e.g. 82" {...register("completedUnits")} data-testid="input-completed-units" /><span className="cgpa-hint">Already on your transcript</span></div>
              <div className="cgpa-field"><label htmlFor="cgpa-target">Target CGPA</label><input id="cgpa-target" className="cgpa-input" type="number" inputMode="decimal" min="0" max="5" step="any" placeholder="e.g. 4.00" {...register("targetCgpa")} data-testid="input-target-cgpa" /><span className="cgpa-hint">The finish line you're aiming for</span></div>
              <div className="cgpa-field"><label htmlFor="cgpa-remaining">Remaining units</label><input id="cgpa-remaining" className="cgpa-input" type="number" inputMode="numeric" min="0" step="1" placeholder="e.g. 48" {...register("remainingUnits")} data-testid="input-remaining-units" /><span className="cgpa-hint">Units left before graduation</span></div>
            </div>
          </section>

          <section className="cgpa-panel cgpa-result" aria-live="polite" aria-label="Target result">
            <div className="cgpa-result-top"><span className="cgpa-section-label">02 / THE TARGET MATH</span><span className="cgpa-result-icon"><ArrowUpRight size={19} /></span></div>
            <div className="cgpa-metric" data-testid="text-required-gpa">{goal?.needed !== null && goal?.needed !== undefined ? format(goal.needed) : "—"}<span>/ 5.00</span></div>
            <p className="cgpa-metric-note">{!goal ? "Fill in the four numbers to see the average GPA you need across your remaining units." : goal.kind === "none" ? "No units remain. Add completed units to compare your current CGPA with your target." : goal.kind === "impossible" ? remaining === 0 ? "No units remain to change your current CGPA." : `You'd need a ${format(goal.needed!)} average. The 5-point scale tops out at 5.00.` : goal.kind === "guaranteed" ? "Your target is already secured, even without additional grade points." : "Average at least this GPA over your remaining units to reach your target."}</p>
            <div className={`cgpa-badge ${goal?.kind === "impossible" ? "bad" : goal?.kind === "achievable" || goal?.kind === "guaranteed" ? "good" : "neutral"}`} data-testid="status-target-feasibility">
              {goal?.kind === "impossible" ? "Impossible ⚠️" : goal?.kind === "achievable" || goal?.kind === "guaranteed" ? "Achievable 🎉" : "Awaiting your numbers"}
            </div>
            {goal?.kind === "impossible" && goal.max !== null && <div className="cgpa-max" data-testid="text-maximum-cgpa">Best possible CGPA with all A grades: <strong>{format(goal.max)}</strong></div>}
          </section>
        </div>

        <div className="cgpa-bottom">
          <section className="cgpa-panel cgpa-panel-pad cgpa-courses" aria-labelledby="cgpa-courses-title">
            <div className="cgpa-course-head">
              <div><div className="cgpa-section-label">03 / RUN THE NUMBERS</div><h2 id="cgpa-courses-title" className="cgpa-panel-title" style={{ marginTop: 12 }}>Course simulator</h2><p className="cgpa-panel-sub">Add courses to preview a semester. Only complete rows count.</p></div>
              <button type="button" className="cgpa-add" onClick={() => { append(blankCourse()); setSaveMessage(""); }} disabled={fields.length >= 100 || savePlan.isPending} data-testid="button-add-course"><Plus size={15} /> Add course</button>
            </div>
            {fields.length === 0 && <div className="cgpa-empty" data-testid="empty-courses">Nothing on the board yet. Add a course to see how its grade could change your average.</div>}
            {fields.map((field, index) => <div className="cgpa-course-row" key={field.id} data-testid={`row-course-${index}`}>
              <div className="cgpa-field"><label htmlFor={`course-code-${index}`}>Course code</label><input id={`course-code-${index}`} className="cgpa-input" maxLength={32} placeholder="e.g. CSC 301" {...register(`courses.${index}.code`)} data-testid={`input-course-code-${index}`} /></div>
              <div className="cgpa-field"><label htmlFor={`course-units-${index}`}>Units</label><input id={`course-units-${index}`} className="cgpa-input" type="number" inputMode="numeric" min="1" max="30" step="1" placeholder="3" {...register(`courses.${index}.units`)} data-testid={`input-course-units-${index}`} /></div>
              <div className="cgpa-field"><label htmlFor={`course-grade-${index}`}>Grade</label><select id={`course-grade-${index}`} className="cgpa-select" {...register(`courses.${index}.grade`)} data-testid={`select-course-grade-${index}`}><option value="">—</option>{Object.entries(grades).map(([grade, points]) => <option key={grade} value={grade}>{grade} · {points}</option>)}</select></div>
              <button type="button" className="cgpa-remove" onClick={() => { remove(index); setSaveMessage(""); }} aria-label={`Remove course ${index + 1}`} data-testid={`button-remove-course-${index}`}><Trash2 size={15} /></button>
            </div>)}
            <div className="cgpa-projection">
              <div><span>Semester GPA</span><strong data-testid="text-semester-gpa">{simulation.semester === null ? "—" : format(simulation.semester)} <small>/ 5.00</small></strong></div>
              <div><span>Projected CGPA</span><strong data-testid="text-projected-cgpa">{simulation.projected === null ? "—" : format(simulation.projected)} <small>/ 5.00</small></strong></div>
            </div>
            <p className="cgpa-panel-sub" style={{ marginTop: 12 }}>Based on {simulation.units} simulated {simulation.units === 1 ? "unit" : "units"} with complete course details. Projection includes your completed units.</p>
            {remaining !== null && remaining >= 0 && simulation.units > remaining && <div className="cgpa-warning" role="alert" data-testid="warning-units-exceeded">Your simulated courses use {simulation.units} units, which exceeds your {remaining} remaining units. Reduce the course load before saving.</div>}
          </section>

          <aside className="cgpa-panel cgpa-panel-pad cgpa-save-panel">
            <div><div className="cgpa-section-label">KEEP YOUR PLAN</div><h2 className="cgpa-panel-title" style={{ marginTop: 12 }}>Pick up where you left off.</h2><p className="cgpa-panel-sub" style={{ marginTop: 10 }}>Changes stay on this screen until you save. Come back anytime to adjust your goal.</p></div>
            <div>
              {validationError && <p role="alert" className="cgpa-error" data-testid="error-cgpa-validation">{validationError}</p>}
              {savePlan.isError && <p role="alert" className="cgpa-error" data-testid="error-cgpa-save">{saveMessage || "Couldn't save your plan. Please try again."}</p>}
              {!savePlan.isError && <p className="cgpa-save-state" role="status" data-testid="status-cgpa-save">{saveMessage || (plan?.updatedAt ? `Last saved ${new Date(plan.updatedAt).toLocaleString()}` : "Not saved yet")}</p>}
              <button type="submit" className="cgpa-save-button" disabled={savePlan.isPending || isFetching} data-testid="button-save-cgpa"><Save size={17} /> {savePlan.isPending ? "Saving plan…" : "Save plan"}</button>
              <div className="cgpa-privacy"><ShieldCheck size={17} /><span>Your CGPA plan is private to your account. It never appears on your public profile, feed, or in search.</span></div>
            </div>
          </aside>
        </div>
      </form>
    </Form>
  </div>;
}

export default function CgpaPage() {
  const { user, isLoaded } = useUser();
  if (!isLoaded || !user) return <div className="cgpa-page"><div className="cgpa-skeleton" style={{ height: 280 }} data-testid="loading-cgpa-account" /></div>;
  return <CgpaPlanner key={user.id} userId={user.id} />;
}