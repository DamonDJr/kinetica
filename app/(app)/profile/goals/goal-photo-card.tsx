"use client";
import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { ImagePlus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

type GoalPhoto = {
  width: number;
  height: number;
  notes: string | null;
  description: string | null;
};

interface Props {
  initialGoalPhoto: GoalPhoto | null;
  hasProgressPhotos: boolean;
}

export function GoalPhotoCard({ initialGoalPhoto, hasProgressPhotos }: Props) {
  const [goalPhoto, setGoalPhoto] = useState<GoalPhoto | null>(initialGoalPhoto);
  const [imgVersion, setImgVersion] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  function pickFile(file: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingFile(file);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
    setNotes(goalPhoto?.notes ?? "");
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

      const res = await fetch("/api/profile/goal-photo", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error ?? "Upload failed");
        return;
      }
      setGoalPhoto(data.goalPhoto);
      setImgVersion((v) => v + 1);
      setFeedback(null);
      pickFile(null);
    } catch {
      setUploadError("Network error");
    } finally {
      setUploading(false);
    }
  }

  async function remove() {
    if (!confirm("Remove your goal photo?")) return;
    const res = await fetch("/api/profile/goal-photo", { method: "DELETE" });
    if (res.ok) {
      setGoalPhoto(null);
      setFeedback(null);
    }
  }

  async function getFeedback() {
    setFeedbackLoading(true);
    setFeedbackError(null);
    try {
      const res = await fetch("/api/ai/goal-photo-feedback", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setFeedbackError(data.error ?? "Failed to get feedback");
        return;
      }
      setFeedback(data.feedback);
    } catch {
      setFeedbackError("Network error");
    } finally {
      setFeedbackLoading(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Body goal photo</p>
          {goalPhoto && !pendingFile && (
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={remove}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Upload a reference photo of the physique you're working toward. The AI coach factors it into
          your workout and meal plans.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />

        {pendingFile && previewUrl ? (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Preview" className="w-full max-h-96 object-contain rounded-xl border border-border" />
            <div className="space-y-1">
              <Label htmlFor="goal-photo-notes" className="text-xs">What do you want to focus on? (optional)</Label>
              <textarea
                id="goal-photo-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. shoulders and back like this, not chasing the abs"
                rows={2}
                className="w-full rounded-xl border border-border bg-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>
            {uploadError && <p className="text-xs text-rose-500">{uploadError}</p>}
            <div className="flex gap-2">
              <Button onClick={upload} disabled={uploading} className="flex-1" size="sm">
                {uploading ? "Saving..." : "Save goal photo"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => pickFile(null)}>Cancel</Button>
            </div>
          </motion.div>
        ) : goalPhoto ? (
          <div className="space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/profile/goal-photo/image?v=${imgVersion}`}
              alt="Body goal reference"
              className="w-full max-h-96 object-contain rounded-xl border border-border"
            />
            {goalPhoto.notes && (
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Your note: </span>{goalPhoto.notes}
              </p>
            )}
            {goalPhoto.description && (
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Coach sees: </span>{goalPhoto.description}
              </p>
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                Replace photo
              </Button>
              {hasProgressPhotos && (
                <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={getFeedback} disabled={feedbackLoading}>
                  <Sparkles className="h-3.5 w-3.5" />
                  {feedbackLoading ? "Coach is looking..." : "Compare to my latest photo"}
                </Button>
              )}
            </div>
            {feedbackError && <p className="text-xs text-rose-500">{feedbackError}</p>}
            {feedback && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-4"
              >
                <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1.5">
                  Coach&apos;s take
                </p>
                <p className="text-sm leading-relaxed">{feedback}</p>
              </motion.div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-2xl border-2 border-dashed border-border p-6 text-center space-y-2 hover:border-primary/40 transition-colors"
          >
            <ImagePlus className="h-6 w-6 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Tap to upload your body goal photo</p>
          </button>
        )}
      </CardContent>
    </Card>
  );
}
