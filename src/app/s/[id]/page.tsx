import type { Metadata } from "next";
import { ShareView } from "@/components/share/share-view";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function SharePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ShareView id={id} />;
}
