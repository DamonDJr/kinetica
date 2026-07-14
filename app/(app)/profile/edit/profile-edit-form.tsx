"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, Loader2, Plus, ChevronRight, Target, Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { calcBmr } from "@/lib/bmr";

const PRESET_CONDITIONS = ["ADHD", "POTS", "hEDS", "Chronic Fatigue", "Autism", "Anxiety", "Depression", "Hypermobility", "Joint Instability"];
const PRESET_EQUIPMENT = ["Bodyweight Only", "Dumbbells", "Resistance Bands", "Pull-up Bar", "Kettlebells", "Exercise Bike", "Treadmill", "Full Gym", "VR Fitness"];
const ACTIVITY_LEVELS = [
  { value: "sedentary", label: "Sedentary", desc: "Desk job, minimal movement" },
  { value: "light", label: "Light", desc: "Light exercise 1-2 days/week" },
  { value: "moderate", label: "Moderate", desc: "Exercise 3-4 days/week" },
  { value: "active", label: "Active", desc: "Hard exercise 5+ days/week" },
];

type Initial = {
  displayName: string;
  age: number | null;
  gender: string | null;
  heightIn: number | null;
  weightLbs: number | null;
  goalWeightLbs: number | null;
  bmrOverride: number | null;
  activityLevel: string;
  conditions: string[];
  injuries: string[];
  equipment: string[];
  restrictions: string[];
  targetsCustom: boolean;
};

function ChipSet({
  presets,
  selected,
  onChange,
  addPlaceholder,
}: {
  presets: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  addPlaceholder: string;
}) {
  const [custom, setCustom] = useState("");
  // Selected values that aren't presets (added custom, or legacy) still render as chips
  const all = [...presets, ...selected.filter((s) => !presets.includes(s))];

  function toggle(label: string) {
    onChange(selected.includes(label) ? selected.filter((s) => s !== label) : [...selected, label]);
  }
  function addCustom() {
    const label = custom.trim();
    if (!label || selected.includes(label)) return;
    onChange([...selected, label]);
    setCustom("");
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-2">
        {all.map((label) => {
          const isSelected = selected.includes(label);
          return (
            <button
              key={label}
              type="button"
              onClick={() => toggle(label)}
              className={cn(
                "px-3 py-2 rounded-xl text-sm border transition-all duration-150 text-left",
                isSelected
                  ? "bg-primary/20 border-primary/50 text-primary font-medium"
                  : "bg-card border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
              )}
            >
              {isSelected && <Check className="inline h-3 w-3 mr-1" />}
              {label}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <Input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder={addPlaceholder}
          className="h-9 text-sm"
        />
        <Button onClick={addCustom} disabled={!custom.trim()} size="sm" variant="outline" className="shrink-0 h-9">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function ProfileEditForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [age, setAge] = useState(initial.age?.toString() ?? "");
  const [gender, setGender] = useState(initial.gender ?? "");
  const [heightFt, setHeightFt] = useState(initial.heightIn ? Math.floor(initial.heightIn / 12).toString() : "");
  const [heightIn, setHeightIn] = useState(initial.heightIn ? (initial.heightIn % 12).toString() : "");
  const [weightLbs, setWeightLbs] = useState(initial.weightLbs?.toString() ?? "");
  const [goalWeightLbs, setGoalWeightLbs] = useState(initial.goalWeightLbs?.toString() ?? "");
  const [bmrOverride, setBmrOverride] = useState(initial.bmrOverride?.toString() ?? "");
  const [activityLevel, setActivityLevel] = useState(initial.activityLevel);
  const [conditions, setConditions] = useState(initial.conditions);
  const [injuries, setInjuries] = useState(initial.injuries);
  const [equipment, setEquipment] = useState(initial.equipment);
  const [restrictions, setRestrictions] = useState(initial.restrictions);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalInches =
    heightFt || heightIn ? parseInt(heightFt || "0") * 12 + parseInt(heightIn || "0") : null;
  const calculatedBmr =
    weightLbs && totalInches && age
      ? calcBmr(parseFloat(weightLbs), totalInches, parseInt(age), gender || null)
      : null;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          basics: {
            displayName,
            age: age ? parseInt(age) : null,
            gender: gender || null,
            heightIn: totalInches,
            weightLbs: weightLbs ? parseFloat(weightLbs) : null,
            goalWeightLbs: goalWeightLbs ? parseFloat(goalWeightLbs) : null,
            bmrOverride: bmrOverride ? parseInt(bmrOverride) : null,
            activityLevel,
            conditions,
            injuries,
            equipment,
            restrictions,
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to save");
        return;
      }
      setSaved(true);
      router.refresh();
      setTimeout(() => router.push("/profile"), 800);
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center gap-3">
        <Link href="/profile">
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Profile</p>
          <h1 className="text-2xl font-black tracking-tight">Edit Profile</h1>
        </div>
      </div>

      {/* About you */}
      <section className="rounded-2xl border border-border bg-card p-4 space-y-4">
        <h2 className="text-sm font-bold">About you</h2>
        <div className="space-y-1.5">
          <Label>Display name</Label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Age</Label>
            <Input type="number" value={age} onChange={(e) => setAge(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Gender</Label>
            <Input placeholder="optional" value={gender} onChange={(e) => setGender(e.target.value)} />
          </div>
        </div>
      </section>

      {/* Body */}
      <section className="rounded-2xl border border-border bg-card p-4 space-y-4">
        <h2 className="text-sm font-bold">Body</h2>
        <div className="space-y-1.5">
          <Label>Height</Label>
          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <Input type="number" value={heightFt} onChange={(e) => setHeightFt(e.target.value)} min="3" max="8" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">ft</span>
            </div>
            <div className="relative">
              <Input type="number" value={heightIn} onChange={(e) => setHeightIn(e.target.value)} min="0" max="11" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">in</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Weight (lbs)</Label>
            <Input type="number" value={weightLbs} onChange={(e) => setWeightLbs(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Goal weight (lbs)</Label>
            <Input type="number" value={goalWeightLbs} onChange={(e) => setGoalWeightLbs(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Resting calories burned (BMR)</Label>
          <Input
            type="number"
            value={bmrOverride}
            onChange={(e) => setBmrOverride(e.target.value)}
            placeholder={calculatedBmr ? `${calculatedBmr} (estimated)` : "e.g. 1650"}
          />
          <p className="text-[11px] text-muted-foreground">
            {calculatedBmr
              ? `We estimate ${calculatedBmr} kcal/day at rest from your stats. Know your actual number (from a metabolic test, DEXA scan, etc.)? Enter it here to override the estimate. Leave blank to use ours.`
              : "Know your resting calorie burn (from a metabolic test, DEXA scan, etc.)? Enter it here. Otherwise leave blank and we'll estimate it once we have your age, height, and weight."}
          </p>
        </div>
        <div className="space-y-2">
          <Label>Activity level</Label>
          {ACTIVITY_LEVELS.map((l) => (
            <button
              key={l.value}
              type="button"
              onClick={() => setActivityLevel(l.value)}
              className={cn(
                "w-full text-left px-4 py-3 rounded-xl border transition-all",
                activityLevel === l.value
                  ? "bg-primary/20 border-primary/50 text-primary"
                  : "bg-card border-border text-foreground hover:border-primary/30"
              )}
            >
              <div className="font-medium text-sm">{l.label}</div>
              <div className="text-xs text-muted-foreground">{l.desc}</div>
            </button>
          ))}
        </div>
        {!initial.targetsCustom && (
          <p className="text-[11px] text-muted-foreground">
            Your calorie and protein targets are auto-calculated, so body changes update them.
            Set targets manually on the targets page if you&apos;d rather they stay put.
          </p>
        )}
      </section>

      {/* Health */}
      <section className="rounded-2xl border border-border bg-card p-4 space-y-4">
        <h2 className="text-sm font-bold">Health</h2>
        <div className="space-y-2">
          <Label className="text-xs">Conditions</Label>
          <ChipSet presets={PRESET_CONDITIONS} selected={conditions} onChange={setConditions} addPlaceholder="Add another condition" />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Injuries — the AI works around these</Label>
          <ChipSet presets={[]} selected={injuries} onChange={setInjuries} addPlaceholder="e.g. Lower back, right knee" />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Dietary restrictions</Label>
          <ChipSet presets={[]} selected={restrictions} onChange={setRestrictions} addPlaceholder="e.g. Lactose intolerant, vegetarian" />
        </div>
      </section>

      {/* Equipment */}
      <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-bold">Equipment</h2>
        <ChipSet presets={PRESET_EQUIPMENT} selected={equipment} onChange={setEquipment} addPlaceholder="Add other equipment" />
      </section>

      {/* Links to the dedicated editors */}
      <div className="grid grid-cols-2 gap-3">
        <Button asChild variant="outline" className="h-11 rounded-xl font-semibold">
          <Link href="/profile/goals"><Target className="h-4 w-4 mr-2 text-primary" />Goals <ChevronRight className="h-3.5 w-3.5 ml-auto" /></Link>
        </Button>
        <Button asChild variant="outline" className="h-11 rounded-xl font-semibold">
          <Link href="/profile/targets"><Crosshair className="h-4 w-4 mr-2 text-accent" />Targets <ChevronRight className="h-3.5 w-3.5 ml-auto" /></Link>
        </Button>
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur border-t border-border md:static md:p-0 md:bg-transparent md:border-0">
        <div className="max-w-2xl mx-auto">
          <Button onClick={handleSave} disabled={saving || saved || !displayName.trim()} className="w-full h-12 font-bold">
            {saved ? (
              <>
                <Check className="h-4 w-4 mr-2" /> Saved
              </>
            ) : saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Save changes"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
