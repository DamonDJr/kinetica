"use client";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
      onClick={async () => {
        await signOut();
        router.push("/login");
      }}
    >
      <LogOut className="h-4 w-4 mr-2" /> Sign out
    </Button>
  );
}
