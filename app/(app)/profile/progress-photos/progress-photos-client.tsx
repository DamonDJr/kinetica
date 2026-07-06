"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Camera, Pause, Play, Plus, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

type Photo = {
  id: string;
  takenAt: string; // ISO
  notes: string | null;
};

const imageUrl = (id: string) => `/api/progress-photos/${id}/image`;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

// Playback speed for the timelapse. Slow enough to register each frame,
// fast enough that a month of photos plays in a few seconds.
const TIMELAPSE_MS = 700;

interface Props {
  initialPhotos: Photo[]; // ascending by takenAt
}

export function ProgressPhotosClient({ initialPhotos }: Props) {
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos);

  // Upload form
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [takenAt, setTakenAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // AI feedback
  const [feedback, setFeedback] = useState<{ text: string; days: number } | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Timelapse
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);

  const sorted = useMemo(
    () => [...photos].sort((a, b) => Date.parse(a.takenAt) - Date.parse(b.takenAt)),
    [photos]
  );
  const oldest = sorted[0] ?? null;
  const newest = sorted.length > 1 ? sorted[sorted.length - 1] : null;
  const clampedFrame = Math.min(frame, sorted.length - 1);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setFrame((f) => {
        if (f >= sorted.length - 1) {
          setPlaying(false);
          return f;
        }
        return f + 1;
      });
    }, TIMELAPSE_MS);
    return () => clearInterval(t);
  }, [playing, sorted.length]);

  function pickFile(file: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingFile(file);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
    setUploadError(null);
  }

  async function upload() {
    if (!pendingFile) return;
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("image", pendingFile);
      if (notes.trim()) form.append("notes", notes.trim());
      // Interpret the picked date at local noon so it lands on the right day
      // regardless of timezone.
      form.append("takenAt", new Date(`${takenAt}T12:00:00`).toISOString());

      const res = await fetch("/api/progress-photos", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error ?? "Upload failed");
        return;
      }
      setPhotos((prev) => [...prev, { id: data.photo.id, takenAt: data.photo.takenAt, notes: data.photo.notes }]);
      pickFile(null);
      setNotes("");
      setFeedback(null); // newest photo changed — old comparison is stale
    } catch {
      setUploadError("Network error");
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this photo?")) return;
    const res = await fetch(`/api/progress-photos?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setPhotos((prev) => prev.filter((p) => p.id !== id));
      setFrame(0);
      setFeedback(null);
    }
  }

  async function getFeedback() {
    setFeedbackLoading(true);
    setFeedbackError(null);
    try {
      const res = await fetch("/api/ai/progress-feedback", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setFeedbackError(data.error ?? "Failed to get feedback");
        return;
      }
      setFeedback({ text: data.feedback, days: data.days });
    } catch {
      setFeedbackError("Network error");
    } finally {
      setFeedbackLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="ghost" className="h-8 w-8 p-0">
            <Link href="/profile"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <h1 className="text-2xl font-bold">Progress Photos</h1>
        </div>
        <Button size="sm" onClick={() => fileInputRef.current?.click()}>
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
      />

      {/* Upload form */}
      {pendingFile && previewUrl && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardContent className="pt-5 space-y-3">
              <p className="text-sm font-semibold">New progress photo</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="Preview" className="w-full max-h-96 object-contain rounded-xl border border-border" />
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label htmlFor="takenAt" className="text-xs">Date taken</Label>
                  <Input id="takenAt" type="date" value={takenAt} onChange={(e) => setTakenAt(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="photo-notes" className="text-xs">Notes (optional)</Label>
                  <Input id="photo-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Front pose, morning..." />
                </div>
              </div>
              {uploadError && <p className="text-xs text-rose-500">{uploadError}</p>}
              <div className="flex gap-2 pt-1">
                <Button onClick={upload} disabled={uploading} className="flex-1" size="sm">
                  {uploading ? "Uploading..." : "Save photo"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => pickFile(null)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Before / after comparison + AI feedback */}
      {oldest && newest && (
        <Card>
          <CardContent className="pt-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Then vs. now</p>
              <p className="text-xs text-muted-foreground">
                {Math.max(1, Math.round((Date.parse(newest.takenAt) - Date.parse(oldest.takenAt)) / 86400000))} days apart
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[oldest, newest].map((p, i) => (
                <div key={p.id} className="space-y-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageUrl(p.id)} alt={i === 0 ? "Oldest photo" : "Newest photo"} className="w-full aspect-[3/4] object-cover rounded-xl border border-border" />
                  <p className="text-[10px] text-center font-semibold uppercase tracking-widest text-muted-foreground">
                    {i === 0 ? "Before" : "After"} · {fmtDate(p.takenAt)}
                  </p>
                </div>
              ))}
            </div>
            <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={getFeedback} disabled={feedbackLoading}>
              <Sparkles className="h-3.5 w-3.5" />
              {feedbackLoading ? "Coach is looking..." : "Get AI feedback on my progress"}
            </Button>
            {feedbackError && <p className="text-xs text-rose-500">{feedbackError}</p>}
            {feedback && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-4"
              >
                <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1.5">
                  Coach&apos;s take · {feedback.days} days of work
                </p>
                <p className="text-sm leading-relaxed">{feedback.text}</p>
              </motion.div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Timelapse */}
      {sorted.length >= 2 && (
        <Card>
          <CardContent className="pt-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Timelapse</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {clampedFrame + 1} / {sorted.length} · {fmtDate(sorted[clampedFrame].takenAt)}
              </p>
            </div>
            {/* All frames stay mounted, stacked with opacity toggles, so every
                image is already decoded and playback never flashes blank. */}
            <div className="relative w-full aspect-[3/4] rounded-xl overflow-hidden border border-border bg-black/90">
              {sorted.map((p, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={p.id}
                  src={imageUrl(p.id)}
                  alt={`Photo from ${fmtDate(p.takenAt)}`}
                  className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-150 ${
                    i === clampedFrame ? "opacity-100" : "opacity-0"
                  }`}
                />
              ))}
              <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/60 text-white text-xs font-semibold tabular-nums">
                {fmtDate(sorted[clampedFrame].takenAt)}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                variant="outline"
                className="h-9 w-9 p-0 shrink-0"
                onClick={() => {
                  if (playing) {
                    setPlaying(false);
                  } else {
                    if (clampedFrame >= sorted.length - 1) setFrame(0);
                    setPlaying(true);
                  }
                }}
              >
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <input
                type="range"
                min={0}
                max={sorted.length - 1}
                value={clampedFrame}
                onChange={(e) => {
                  setPlaying(false);
                  setFrame(parseInt(e.target.value, 10));
                }}
                className="w-full accent-primary"
                aria-label="Timelapse position"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* History grid */}
      {sorted.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            All photos ({sorted.length})
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[...sorted].reverse().map((p) => (
              <div key={p.id} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl(p.id)}
                  alt={`Photo from ${fmtDate(p.takenAt)}`}
                  className="w-full aspect-[3/4] object-cover rounded-xl border border-border cursor-pointer"
                  onClick={() => {
                    setPlaying(false);
                    setFrame(sorted.findIndex((x) => x.id === p.id));
                  }}
                />
                <button
                  onClick={() => remove(p.id)}
                  className="absolute top-1.5 right-1.5 h-6 w-6 rounded-lg bg-black/60 text-white flex items-center justify-center opacity-70 hover:opacity-100 hover:bg-rose-600 transition-colors"
                  aria-label="Delete photo"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
                <p className="text-[10px] text-center text-muted-foreground mt-1 tabular-nums">{fmtDate(p.takenAt)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty / single-photo states */}
      {sorted.length === 0 && !pendingFile && (
        <div className="rounded-2xl border-2 border-dashed border-border p-8 text-center space-y-2">
          <Camera className="h-6 w-6 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No photos yet. Take your first progress photo — future you will thank you.
          </p>
          <Button size="sm" onClick={() => fileInputRef.current?.click()}>
            <Plus className="h-4 w-4 mr-1" /> Add first photo
          </Button>
        </div>
      )}
      {sorted.length === 1 && (
        <p className="text-xs text-muted-foreground text-center">
          Add a second photo to unlock the before/after comparison and timelapse.
        </p>
      )}
    </div>
  );
}
