import type { Metadata } from "next";
import { CreateForm } from "@/components/create/create-form";
import { getMaxFileBytes } from "@/lib/shared/limits";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function CreatePage() {
  return <CreateForm maxFileBytes={getMaxFileBytes()} />;
}
