"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ARCamera from "@/components/ARCamera";
import { REPAIR_TYPES } from "@/lib/vehicles";

function RepairSession() {
  const router = useRouter();
  const params = useSearchParams();

  const vehicle = {
    year: params.get("year") ?? "",
    make: params.get("make") ?? "",
    model: params.get("model") ?? "",
  };
  const repairType = params.get("repairType") ?? "";
  const repairLabel = REPAIR_TYPES.find((r) => r.id === repairType)?.label ?? repairType;

  if (!vehicle.year || !vehicle.make || !vehicle.model || !repairType) {
    router.push("/");
    return null;
  }

  return (
    <div className="flex flex-col h-dvh bg-black">
      <ARCamera
        vehicle={vehicle}
        repairType={repairType}
        repairLabel={repairLabel}
        onBack={() => router.push("/")}
      />
    </div>
  );
}

export default function RepairPage() {
  return (
    <Suspense fallback={
      <div className="h-dvh bg-black flex items-center justify-center text-zinc-400 text-sm">
        Loading...
      </div>
    }>
      <RepairSession />
    </Suspense>
  );
}
