"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, ChevronLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const CONDITIONS = ["ADHD", "POTS", "hEDS", "Chronic Fatigue", "Autism", "Anxiety", "Depression", "Hypermobility", "Joint Instability", "None"];
const EQUIPMENT = ["Bodyweight Only", "Dumbbells", "Resistance Bands", "Pull-up Bar", "Kettlebells", "Exercise Bike", "Treadmill", "Full Gym", "VR Fitness"];
const GOALS = ["Lose Weight", "Gain Muscle", "Improve Flexibility", "Better Endurance", "Learn Skills (Handstand etc.)", "Manage Chronic Condition", "General Health", "Family Fitness"];
const ACTIVITY_LEVELS = [
  { value: "sedentary", label: "Sedentary", desc: "Desk job, minimal movement" },
  { value: "light", label: "Light", desc: "Light exercise 1-2 days/week" },
  { value: "moderate", label: "Moderate", desc: "Exercise 3-4 days/week" },
  { value: "active", label: "Active", desc: "Hard exercise 5+ days/week" },
];

type FormData = {
  displayName: string;
  age: string;
  gender: string;
  heightFt: string;
  heightIn: string;
  weightLbs: string;
  goalWeightLbs: string;
  activityLevel: string;
  conditions: string[];
  equipment: string[];
  fitnessGoals: string[];
};

const INITIAL: FormData = {
  displayName: "", age: "", gender: "",
  heightFt: "", heightIn: "", weightLbs: "", goalWeightLbs: "",
  activityLevel: "moderate", conditions: [], equipment: [], fitnessGoals: [],
};

function ToggleChip({ label, selected, onToggle }: { label: string; selected: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "px-3 py-2 rounded-xl text-sm border transition-all duration-150 text-left",
        selected
          ? "bg-primary/20 border-primary/50 text-primary font-medium"
          : "bg-card border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
      )}
    >
      {selected && <Check className="inline h-3 w-3 mr-1" />}
      {label}
    </button>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(INITIAL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function toggleArray(key: "conditions" | "equipment" | "fitnessGoals", val: string) {
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(val) ? f[key].filter((x) => x !== val) : [...f[key], val],
    }));
  }

  async function handleFinish() {
    setLoading(true);
    setError("");
    try {
      // Convert height to total inches for storage
      const totalInches = form.heightFt || form.heightIn
        ? (parseInt(form.heightFt || "0") * 12) + parseInt(form.heightIn || "0")
        : null;

      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: form.displayName,
          age: form.age ? parseInt(form.age) : null,
          gender: form.gender || null,
          heightIn: totalInches,
          weightLbs: form.weightLbs ? parseFloat(form.weightLbs) : null,
          goalWeightLbs: form.goalWeightLbs ? parseFloat(form.goalWeightLbs) : null,
          activityLevel: form.activityLevel,
          conditions: form.conditions,
          equipment: form.equipment,
          fitnessGoals: form.fitnessGoals,
        }),
      });
      if (!res.ok) throw new Error("Failed to save profile");
      router.push("/dashboard");
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  const steps = [
    {
      title: "Who are you?",
      subtitle: "Let's personalize your experience",
      content: (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Display name</Label>
            <Input placeholder="e.g. Damon" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Age</Label>
              <Input type="number" placeholder="30" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Gender</Label>
              <Input placeholder="optional" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} />
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Your body",
      subtitle: "Used to calculate your targets — always editable later",
      content: (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Height</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <Input
                  type="number"
                  placeholder="5"
                  value={form.heightFt}
                  onChange={(e) => setForm({ ...form, heightFt: e.target.value })}
                  min="3" max="8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">ft</span>
              </div>
              <div className="relative">
                <Input
                  type="number"
                  placeholder="11"
                  value={form.heightIn}
                  onChange={(e) => setForm({ ...form, heightIn: e.target.value })}
                  min="0" max="11"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">in</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Weight (lbs)</Label>
              <div className="relative">
                <Input
                  type="number"
                  placeholder="180"
                  value={form.weightLbs}
                  onChange={(e) => setForm({ ...form, weightLbs: e.target.value })}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">lbs</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Goal weight (lbs)</Label>
              <div className="relative">
                <Input
                  type="number"
                  placeholder="165"
                  value={form.goalWeightLbs}
                  onChange={(e) => setForm({ ...form, goalWeightLbs: e.target.value })}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">lbs</span>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Activity level</Label>
            <div className="space-y-2">
              {ACTIVITY_LEVELS.map((l) => (
                <button
                  key={l.value}
                  type="button"
                  onClick={() => setForm({ ...form, activityLevel: l.value })}
                  className={cn(
                    "w-full text-left px-4 py-3 rounded-xl border transition-all",
                    form.activityLevel === l.value
                      ? "bg-primary/20 border-primary/50 text-primary"
                      : "bg-card border-border text-foreground hover:border-primary/30"
                  )}
                >
                  <div className="font-medium text-sm">{l.label}</div>
                  <div className="text-xs text-muted-foreground">{l.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Health conditions",
      subtitle: "We'll adapt recommendations — no judgement, ever",
      content: (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {CONDITIONS.map((c) => (
              <ToggleChip key={c} label={c} selected={form.conditions.includes(c)} onToggle={() => toggleArray("conditions", c)} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Kinetica never provides medical advice. For health concerns, always consult a professional.</p>
        </div>
      ),
    },
    {
      title: "Your equipment",
      subtitle: "AI plans will only use what you have access to",
      content: (
        <div className="flex flex-wrap gap-2">
          {EQUIPMENT.map((e) => (
            <ToggleChip key={e} label={e} selected={form.equipment.includes(e)} onToggle={() => toggleArray("equipment", e)} />
          ))}
        </div>
      ),
    },
    {
      title: "Your goals",
      subtitle: "Pick everything that resonates — the AI will balance them",
      content: (
        <div className="flex flex-wrap gap-2">
          {GOALS.map((g) => (
            <ToggleChip key={g} label={g} selected={form.fitnessGoals.includes(g)} onToggle={() => toggleArray("fitnessGoals", g)} />
          ))}
        </div>
      ),
    },
  ];

  const current = steps[step];
  const canContinue = step === 0 ? form.displayName.trim().length > 0 : true;

  return (
    <div className="min-h-screen flex flex-col p-5">
      <div className="flex gap-2 mb-8 pt-4">
        {steps.map((_, i) => (
          <div key={i} className={cn("h-1.5 rounded-full flex-1 transition-all duration-300", i <= step ? "bg-primary" : "bg-border")} />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="flex-1 flex flex-col"
        >
          <h1 className="text-2xl font-bold mb-1">{current.title}</h1>
          <p className="text-muted-foreground text-sm mb-6">{current.subtitle}</p>
          <div className="flex-1">{current.content}</div>
        </motion.div>
      </AnimatePresence>

      {error && <p className="text-sm text-destructive mt-4">{error}</p>}

      <div className="flex items-center justify-between mt-8">
        <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        {step < steps.length - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canContinue}>
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={handleFinish} disabled={loading || !canContinue}>
            {loading ? "Saving…" : "Let's go!"}
          </Button>
        )}
      </div>
    </div>
  );
}
