// Mifflin-St Jeor basal metabolic rate. Profile stores imperial values in
// oddly-named fields (weightKg holds lbs, heightCm holds inches) — see
// app/api/profile/route.ts — so the metric conversion happens here too.
export function calcBmr(weightLbs: number, heightIn: number, age: number, gender: string | null): number {
  const weightKg = weightLbs * 0.453592;
  const heightCm = heightIn * 2.54;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (gender === "female" ? -161 : 5);
  return Math.round(bmr);
}

// Watches/trackers only report active calories, not resting burn — BMR fills
// that gap so "calories burned" reflects total energy expenditure.
export function profileBmr(profile: {
  weightKg: number | null;
  heightCm: number | null;
  age: number | null;
  gender: string | null;
  bmrOverride?: number | null;
}): number | null {
  if (profile.bmrOverride) return profile.bmrOverride;
  if (!profile.weightKg || !profile.heightCm || !profile.age) return null;
  return calcBmr(profile.weightKg, profile.heightCm, profile.age, profile.gender);
}
